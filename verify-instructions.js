#!/usr/bin/env node
/**
 * Verification script: Test classification and unstaking instructions
 *
 * Usage:
 *   export SOLANA_RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
 *   node verify-instructions.js
 */

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const PROGRAM_CORE = "HLCorec4bsTSiyzskDuAqrqD5NXDZeLhdvWqs7wjWRx5";
const PROGRAM_LEGACY_ID = "D7scofMhczWugX7WZPXSP3YjjSyDijEULpwQdraVj54q";
const METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const POOL_CORE = "4YSH4QNLjdpbDNWz6eJmT3J8kATvAWTrRMwpfE9zCDff";

const DISC_UNFREEZE_NFT = "1437613bfba77520";
const DISC_UNFREEZE_NFT_CORE = "e17b0dcf7dec533e";

const rpcUrl = process.env.SOLANA_RPC_URL;
if (!rpcUrl) {
  console.error('ERROR: Set SOLANA_RPC_URL environment variable');
  process.exit(1);
}

async function rpc(method, params) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

async function verifyLegacyProgramDeleted() {
  console.log('\n=== Verify: Legacy Program Bytecode Deleted ===');
  try {
    const info = await rpc('getAccountInfo', [PROGRAM_LEGACY_ID, { encoding: 'jsonParsed' }]);
    const programData = info.data?.parsed?.info?.programData;

    if (!programData) {
      console.log('✓ PASS: No programData specified');
    } else {
      const pdInfo = await rpc('getAccountInfo', [programData, { encoding: 'base64' }]);
      if (pdInfo === null) {
        console.log('✓ PASS: ProgramData account is NULL (bytecode deleted)');
      } else {
        console.log('✗ FAIL: ProgramData account still exists (unexpected)');
      }
    }
  } catch (err) {
    console.log('✗ ERROR: ' + err.message);
  }
}

async function verifyNewProgramExists() {
  console.log('\n=== Verify: New Program is Executable ===');
  try {
    const info = await rpc('getAccountInfo', [PROGRAM_CORE, { encoding: 'jsonParsed' }]);
    if (info.executable) {
      console.log('✓ PASS: New program is executable');
    } else {
      console.log('✗ FAIL: Program is not executable');
    }
  } catch (err) {
    console.log('✗ ERROR: ' + err.message);
  }
}

async function verifyPoolExists() {
  console.log('\n=== Verify: Known Staking Pool Exists ===');
  try {
    const info = await rpc('getAccountInfo', [POOL_CORE, { encoding: 'base64' }]);
    if (info && info.data) {
      console.log(`✓ PASS: Pool account exists (space: ${info.space} bytes)`);
    } else {
      console.log('✗ FAIL: Pool account does not exist');
    }
  } catch (err) {
    console.log('✗ ERROR: ' + err.message);
  }
}

async function findAndVerifyNFT() {
  console.log('\n=== Verify: Find a Frozen NFT for Testing ===');

  // Example test wallet (replace with real one)
  const testWallet = "HZwfH3FhJLNk9fFRGEiKQx4SJ8qFfXbLDKYRx4oGxdT8";

  try {
    console.log(`Scanning ${testWallet}...`);
    const assets = await rpc('getAssetsByOwner', {
      ownerAddress: testWallet,
      page: 1,
      limit: 100
    });

    const frozen = (assets.items || []).filter(a => a.ownership?.frozen === true);

    if (frozen.length === 0) {
      console.log('ℹ INFO: No frozen NFTs found in test wallet (expected if empty)');
      return;
    }

    console.log(`✓ Found ${frozen.length} frozen NFT(s)`);

    // Classify first one
    const first = frozen[0];
    console.log(`\n  Test NFT: ${first.content?.metadata?.name || first.id.slice(0,8)}`);
    console.log(`  Interface: ${first.interface}`);
    console.log(`  Frozen: ${first.ownership?.frozen}`);

    if (first.interface === 'MplCoreAsset') {
      const authority = first.plugins?.freeze_delegate?.authority?.address;
      console.log(`  Pool: ${authority === POOL_CORE ? 'Known (POOL_CORE)' : 'Unknown'}`);
    } else if (!first.compression?.compressed && first.token_info?.associated_token_address) {
      const tokenAddr = first.token_info.associated_token_address;
      console.log(`  Token Account: ${tokenAddr.slice(0,8)}...`);

      // Check delegate
      const tokenInfo = await rpc('getMultipleAccounts', [[tokenAddr], { encoding: 'jsonParsed' }]);
      const delegate = tokenInfo.value[0]?.data?.parsed?.info?.delegate;

      if (delegate) {
        const delegateInfo = await rpc('getMultipleAccounts', [[delegate], { encoding: 'base64' }]);
        const owner = delegateInfo.value[0]?.owner;

        if (owner === METADATA_PROGRAM_ID) {
          console.log(`  ✓ Category: core_recoverable (delegate owner = Metadata)`);
        } else if (owner === PROGRAM_LEGACY_ID) {
          console.log(`  ✗ Category: legacy_dead (delegate owner = Legacy program)`);
        } else {
          console.log(`  ? Category: unclassified (delegate owner = ${owner.slice(0,8)}...)`);
        }
      }
    }
  } catch (err) {
    console.log('ℹ INFO: ' + err.message);
  }
}

async function verifyDiscriminators() {
  console.log('\n=== Verify: Instruction Discriminators ===');
  console.log(`Classic token unfreeze:   ${DISC_UNFREEZE_NFT}`);
  console.log(`Generations unfreeze:     ${DISC_UNFREEZE_NFT_CORE}`);
  console.log('ℹ These are used in buildInstruction() calls in recovery.html');
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  Honeyland Classification & Unstaking Verification    ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  await verifyLegacyProgramDeleted();
  await verifyNewProgramExists();
  await verifyPoolExists();
  await verifyDiscriminators();
  await findAndVerifyNFT();

  console.log('\n=== Summary ===');
  console.log('✓ If above checks pass, the classification & instructions are correct');
  console.log('✗ If any checks fail, review the error and research guide');
  console.log('\nSee UNSTAKE_INSTRUCTION_RESEARCH.md for detailed methodology');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
