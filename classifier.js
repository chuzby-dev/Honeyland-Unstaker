/**
 * Classification and unstaking module for Honeyland frozen NFTs
 * Categorizes NFTs by which on-chain program holds them, and routes to appropriate recovery path
 */

const fs = require('fs');
const path = require('path');

// Use the solana web3.js from the trading bot's node_modules if available, otherwise assume browser
let solanaWeb3 = null;
try {
  solanaWeb3 = require('/c/Users/chuzb/Desktop/Claude/solana-trading-bot/node_modules/@solana/web3.js');
} catch (e) {
  // Assume we're in a browser and solanaWeb3 is already injected globally
}

const PROGRAM_CORE = "HLCorec4bsTSiyzskDuAqrqD5NXDZeLhdvWqs7wjWRx5";
const PROGRAM_LEGACY_ID = "D7scofMhczWugX7WZPXSP3YjjSyDijEULpwQdraVj54q";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const METAPLEX_CORE_PROGRAM = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d";
const POOL_CORE = "4YSH4QNLjdpbDNWz6eJmT3J8kATvAWTrRMwpfE9zCDff";

/**
 * Classify a single frozen NFT into one of:
 *   - 'core_recoverable': Classic token frozen by Honeyland Core program → RECOVERABLE
 *   - 'core_asset_known_pool': Generations (mpl-core) in known staking pool → RECOVERABLE
 *   - 'core_asset_other_pool': Generations in unidentified pool → REVIEW NEEDED
 *   - 'legacy_dead': Frozen by now-deleted legacy program → UNRECOVERABLE
 *   - 'compressed': Compressed asset → NOT SUPPORTED
 *   - 'unclassified': Unknown status → REVIEW NEEDED
 */
async function classifyNFT(asset, rpc) {
  const mint = asset.id;
  const name = asset.content?.metadata?.name || mint.slice(0, 8);

  // Generations (mpl-core) assets
  if (asset.interface === 'MplCoreAsset') {
    const authority = asset.plugins?.freeze_delegate?.authority?.address;
    const collection = (asset.grouping || []).find(g => g.group_key === 'collection')?.group_value;

    if (authority === POOL_CORE) {
      return {
        mint,
        name,
        category: 'core_asset_known_pool',
        recoverable: true,
        pool: POOL_CORE,
        collection,
        interface: 'MplCoreAsset',
        reason: 'Generations asset frozen by known Honeyland Core staking pool'
      };
    } else {
      return {
        mint,
        name,
        category: 'core_asset_other_pool',
        recoverable: false,
        pool: authority,
        collection,
        interface: 'MplCoreAsset',
        reason: 'Generations asset frozen by unidentified pool or authority'
      };
    }
  }

  // Compressed assets
  if (asset.compression?.compressed === true) {
    return {
      mint,
      name,
      category: 'compressed',
      recoverable: false,
      reason: 'Compressed assets not currently supported for recovery'
    };
  }

  // Classic token assets (not compressed, has associated token address)
  if (!asset.compression?.compressed && asset.token_info?.associated_token_address) {
    const tokenAccount = asset.token_info.associated_token_address;

    try {
      // Fetch token account to find delegate
      const tokenInfo = await rpc('getMultipleAccounts', [[tokenAccount], { encoding: 'jsonParsed' }]);
      const delegate = tokenInfo.value[0]?.data?.parsed?.info?.delegate;

      if (!delegate) {
        return {
          mint,
          name,
          category: 'unclassified',
          recoverable: false,
          tokenAccount,
          reason: 'Token has no freeze delegate set'
        };
      }

      // Fetch delegate to find its owner program
      const delegateInfo = await rpc('getMultipleAccounts', [[delegate], { encoding: 'base64' }]);
      const owner = delegateInfo.value[0]?.owner;

      if (owner === METADATA_PROGRAM_ID) {
        return {
          mint,
          name,
          category: 'core_recoverable',
          recoverable: true,
          tokenAccount,
          delegate,
          reason: 'Classic token frozen by Honeyland Core program (delegate owner = Token Metadata)'
        };
      } else if (owner === PROGRAM_LEGACY_ID) {
        return {
          mint,
          name,
          category: 'legacy_dead',
          recoverable: false,
          tokenAccount,
          delegate,
          reason: 'Frozen by legacy Honeyland program (now deleted, bytecode gone, unrecoverable)'
        };
      } else {
        return {
          mint,
          name,
          category: 'unclassified',
          recoverable: false,
          tokenAccount,
          delegate,
          delegateOwner: owner,
          reason: `Token frozen by unknown owner program: ${owner}`
        };
      }
    } catch (err) {
      return {
        mint,
        name,
        category: 'unclassified',
        recoverable: false,
        tokenAccount,
        error: err.message,
        reason: 'Failed to classify: ' + err.message
      };
    }
  }

  // Leftover: frozen token without associated address
  return {
    mint,
    name,
    category: 'unclassified',
    recoverable: false,
    reason: 'Token frozen but missing associated address or recognized interface'
  };
}

/**
 * Batch classify all frozen NFTs in a wallet
 */
async function classifyWallet(walletAddress, rpc) {
  const result = {
    total: 0,
    classified: {},
    recoverable: [],
    unrecoverable: [],
    errors: []
  };

  try {
    // Fetch all assets
    let allAssets = [];
    let page = 1;
    while (true) {
      const pageResult = await rpc('getAssetsByOwner', {
        ownerAddress: walletAddress,
        page,
        limit: 1000
      });
      allAssets.push(...(pageResult.items || []));
      if ((pageResult.items || []).length < 1000) break;
      page++;
    }

    // Filter to frozen only
    const frozen = allAssets.filter(a => a.ownership?.frozen === true);
    result.total = frozen.length;

    // Classify each
    for (const asset of frozen) {
      try {
        const classification = await classifyNFT(asset, rpc);
        result.classified[classification.category] = (result.classified[classification.category] || 0) + 1;

        if (classification.recoverable) {
          result.recoverable.push(classification);
        } else {
          result.unrecoverable.push(classification);
        }
      } catch (err) {
        result.errors.push({ mint: asset.id, error: err.message });
      }
    }
  } catch (err) {
    throw new Error(`Wallet classification failed: ${err.message}`);
  }

  return result;
}

/**
 * Get unstaking instructions for recoverable NFTs
 */
function getUnstakeInstructions(classifications) {
  const instructions = {
    core_recoverable: [],
    core_asset_known_pool: []
  };

  for (const item of classifications) {
    if (item.category === 'core_recoverable') {
      instructions.core_recoverable.push({
        type: 'unfreeze_classic',
        mint: item.mint,
        tokenAccount: item.tokenAccount,
        programId: PROGRAM_CORE,
        description: 'Classic token: unfreeze via Token Metadata delegate removal'
      });
    } else if (item.category === 'core_asset_known_pool') {
      instructions.core_asset_known_pool.push({
        type: 'unfreeze_mplcore',
        mint: item.mint,
        collection: item.collection,
        programId: PROGRAM_CORE,
        description: 'Generations: unfreeze via mpl-core freeze_delegate removal'
      });
    }
  }

  return instructions;
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    classifyNFT,
    classifyWallet,
    getUnstakeInstructions,
    PROGRAM_CORE,
    PROGRAM_LEGACY_ID,
    METADATA_PROGRAM_ID,
    METAPLEX_CORE_PROGRAM,
    POOL_CORE
  };
}
