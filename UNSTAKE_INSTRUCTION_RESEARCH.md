# Honeyland Unstaking Instruction Research Guide

## Overview

Two separate Honeyland NFT programs exist:
1. **New/Current (Recoverable)**: `HLCorec4bsTSiyzskDuAqrqD5NXDZeLhdvWqs7wjWRx5`
   - Maintains bytecode on-chain
   - Can be interacted with via instruction reconstruction
   - Holds two types: Classic tokens and Generations (mpl-core)

2. **Legacy (Unrecoverable)**: `D7scofMhczWugX7WZPXSP3YjjSyDijEULpwQdraVj54q`
   - ProgramData account is NULL
   - Bytecode deleted, program frozen
   - Any NFTs frozen by this program cannot be recovered

## Classification Logic

### New Contract (Recoverable)

**Classic Tokens** (older NFT standard):
- Interface: NOT `MplCoreAsset`
- Has: `token_info.associated_token_address`
- Not compressed
- Frozen status: checked via token account's freeze delegate
- **Delegate Owner**: `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s` (Token Metadata program)
- **Action**: Remove freeze delegate to unfreeze

**Generations** (mpl-core standard):
- Interface: `MplCoreAsset`
- Has: collection info in grouping
- Freeze delegate authority: `4YSH4QNLjdpbDNWz6eJmT3J8kATvAWTrRMwpfE9zCDff` (known staking pool)
- **Action**: Remove freeze delegate plugin to unfreeze

### Legacy Contract (Unrecoverable)

**Classic Tokens frozen by legacy program**:
- Same as above BUT delegate owner is: `D7scofMhczWugX7WZPXSP3YjjSyDijEULpwQdraVj54q`
- Program bytecode has been deleted → cannot call any instruction
- **Action**: NONE — permanently unrecoverable

## Finding Historic Instructions

### Method 1: Simulate Against Known Working Transactions

1. Find a successful unfreeze/unstake transaction on-chain (block explorers: Solscan, Solana Beach)
2. Decode the transaction's instruction data
3. Reverse-engineer the discriminator (first 8 bytes)
4. Simulate the instruction against a test NFT
5. Refine based on simulation errors

### Method 2: Extract from Program IDL or Docs

- Check if Honeyland published an IDL (Instruction Description Language)
- Look for archived GitHub/Notion docs
- Search Discord/Twitter for historical posts about unstaking

### Method 3: Binary Reverse-Engineering

1. Fetch the program's on-chain bytecode
2. Use Anchor or Solang disassembler to find instruction handlers
3. Identify the unfreeze/unstake instruction by its log output
4. Reconstruct the account layout and data requirements

## Current Known Instructions (From recovery.html)

### Classic Token Unfreeze
```
Discriminator: 0x1437613bfba77520
Program: HLCorec4bsTSiyzskDuAqrqD5NXDZeLhdvWqs7wjWRx5

Accounts:
  1. POOL_CORE (writable) - staking pool
  2. Signer (payer) - transaction signer
  3. Metadata PDA (writable) - derived from mint
  4. Edition PDA (writable) - derived from mint
  5. Token Account (writable) - associated token account
  6. Mint (writable) - NFT mint
  7. TOKEN_PROGRAM_ID (read-only)
  8. METADATA_PROGRAM_ID (read-only)

Data: 8 bytes (discriminator only, no args)
```

### Generations (mpl-core) Unfreeze
```
Discriminator: 0xe17b0dcf7dec533e
Program: HLCorec4bsTSiyzskDuAqrqD5NXDZeLhdvWqs7wjWRx5

Accounts:
  1. POOL_CORE (writable) - staking pool
  2. Signer (payer) - transaction signer
  3. Mint (writable) - asset mint
  4. Collection (writable) - collection mint
  5. SYSTEM_PROGRAM (read-only)
  6. NOOP_PROGRAM (read-only)
  7. METAPLEX_CORE_PROGRAM (read-only)

Data: 8 bytes (discriminator only, no args)
```

## Validation Process

1. **Simulation**: Use `simulateTransaction` with `sigVerify:false` and `replaceRecentBlockhash:true` to test without signing
2. **Error Analysis**:
   - `IncorrectAccount` = wrong account in the instruction vector
   - `AccountNotInitialized` = account needs setup first
   - `Custom(XYZ)` = program-specific custom error code
3. **Live Test**: After simulation passes, send one real transaction and monitor confirmation

## Research Checkpoints

- [ ] Confirm classic token unfreeze discriminator: `0x1437613bfba77520`
- [ ] Confirm mpl-core unfreeze discriminator: `0xe17b0dcf7dec533e`
- [ ] Test discriminators against current on-chain program state
- [ ] Verify POOL_CORE is the only valid staking pool or enumerate others
- [ ] Check if legacy program's PDAs are still recoverable (unlikely but worth checking)
- [ ] Identify any frozen NFTs in pools other than POOL_CORE

## References

- **Token Program**: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`
- **Metadata Program**: `metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`
- **mpl-core Program**: `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d`
- **Honeyland Pool**: `4YSH4QNLjdpbDNWz6eJmT3J8kATvAWTrRMwpfE9zCDff`

## Next Steps

1. Update `classifier.js` to integrate with recovery.html
2. Test classification against real wallet data (via Helius RPC)
3. Verify discriminators with simulation before sending live transactions
4. Add detailed error handling for edge cases (multisig wallets, NFTs under dispute, etc.)
