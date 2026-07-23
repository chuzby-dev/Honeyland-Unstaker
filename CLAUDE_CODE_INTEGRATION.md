# Honeyland Comb — Claude Code Integration Guide

## Project Adoption Summary

**Original**: Built in Claude Chat as an unofficial recovery tool for frozen Honeyland NFTs  
**Current Status**: Adopted into Claude Code for enhanced development and maintenance  
**Live Repo**: https://github.com/chuzby-dev/solstice (master branch)  
**Dev Branch**: `honeyland-classifier-dev` (local, never pushed to live)

## Project Structure

```
Honeyland Unstaker/
├── index.html                          # Landing page (links to apps)
├── recovery.html                       # Main app: unfreeze frozen NFTs
├── burn.html                           # Secondary app: burn Generations assets
├── serve.js                            # Local dev server (Node.js)
│
├── classifier.js                       # Testable classification logic (new)
├── UNSTAKE_INSTRUCTION_RESEARCH.md    # Research guide for discriminators
├── CLAUDE_CODE_INTEGRATION.md         # This file
│
├── check*.js                           # Historical research scripts (debugging only)
└── simulate_payload.js                 # Transaction simulation helper

Honeyland-Unstaker-Github Files/       # GitHub Pages-deployed version (PWA)
└── index.html, manifest.json, sw.js
```

## How Classification Works

### Two Honeyland Contracts

1. **New/Current Program** (RECOVERABLE)
   - Address: `HLCorec4bsTSiyzskDuAqrqD5NXDZeLhdvWqs7wjWRx5`
   - Bytecode: Live on-chain
   - Holds: Classic tokens + Generations (mpl-core) assets
   - Action: Can be interacted with via transaction instructions

2. **Legacy Program** (UNRECOVERABLE)
   - Address: `D7scofMhczWugX7WZPXSP3YjjSyDijEULpwQdraVj54q`
   - Bytecode: Deleted (ProgramData account is NULL)
   - Status: Frozen, no instructions can be executed
   - Action: None — permanently unrecoverable

### Classification Logic (in recovery.html)

Every frozen NFT is examined and classified into one of six categories:

| Category | Type | Frozen By | Recoverable | Action |
|----------|------|-----------|-------------|--------|
| `core_recoverable` | Classic token | New program (delegate = Token Metadata) | ✓ Yes | Send unfreeze instruction |
| `core_asset_known_pool` | Generations (mpl-core) | New program (known pool) | ✓ Yes | Send unfreeze instruction |
| `legacy_dead` | Classic token | Legacy program (deleted) | ✗ No | None — permanent loss |
| `core_asset_other_pool` | Generations | Unknown pool | ✗ Review | Manual investigation needed |
| `compressed` | Compressed NFT | Any | ✗ Not supported | Not supported (yet) |
| `unclassified` | Unknown | Unknown | ✗ Review | Manual investigation needed |

**See**: `classifier.js` for standalone classification logic  
**See**: `UNSTAKE_INSTRUCTION_RESEARCH.md` for discriminator details

## Unstaking Instructions (On-Chain)

### Classic Token Unfreeze

```javascript
Discriminator: 0x1437613bfba77520
Program: HLCorec4bsTSiyzskDuAqrqD5NXDZeLhdvWqs7wjWRx5

Accounts:
  [0] POOL_CORE (writable)
  [1] Signer (writable)
  [2] Metadata PDA (writable)
  [3] Edition PDA (writable)
  [4] Token Account (writable)
  [5] Mint (writable)
  [6] Token Program (read-only)
  [7] Metadata Program (read-only)
```

### Generations Unfreeze

```javascript
Discriminator: 0xe17b0dcf7dec533e
Program: HLCorec4bsTSiyzskDuAqrqD5NXDZeLhdvWqs7wjWRx5

Accounts:
  [0] POOL_CORE (writable)
  [1] Signer (writable)
  [2] Mint (writable)
  [3] Collection (writable)
  [4] System Program (read-only)
  [5] Noop Program (read-only)
  [6] mpl-core Program (read-only)
```

## Development Workflow

### Safe Push Configuration

```bash
# Prevents accidental pushes to live repo
# Configured in: .claude/settings.local.json
"Bash(git push *)": "deny"
```

### Local Branch Strategy

```bash
# All work is on honeyland-classifier-dev branch
git checkout honeyland-classifier-dev

# Never push this branch to origin/master
git push --set-upstream origin honeyland-classifier-dev  # DO NOT DO THIS

# To send changes back to live repo:
# 1. Manually cherry-pick tested commits from this branch
# 2. Create a formal PR on GitHub with detailed explanations
# 3. Get community feedback before merging to master
```

### Testing Workflow

1. **Local Dev Server**: `npm start` (runs serve.js on port 8090)
2. **Manual Testing**: Open http://localhost:8090 in Solflare/Phantom
3. **Simulation**: Use existing `check*.js` scripts to verify on-chain behavior
4. **Live Testing**: Start with 1 NFT before batching larger operations

## Key Files & Their Purpose

### User-Facing

- **recovery.html**: Main application (unfreeze frozen NFTs)
  - Classification, scanning, batch unstaking
  - Private key or wallet signing
  - Transaction confirmation tracking

- **burn.html**: Secondary application (burn Generations)
  - Scans for live mpl-core assets
  - Permanent destruction (no undo)
  - Reclaims rent SOL to user

- **index.html**: Landing page (links to both apps)

### Developer-Facing

- **classifier.js**: Reusable classification logic
  - Can be imported into Node.js test scripts
  - DAS-based wallet scanning
  - Detailed classification with reasoning

- **UNSTAKE_INSTRUCTION_RESEARCH.md**: Research guide
  - Discriminator values
  - Account layouts
  - Historical context & methods

- **check*.js**: Historical research (read-only)
  - Binary parsing examples
  - Transaction inspection
  - on-chain state verification

## Next Steps for Enhancement

### Short Term (This Session)

- [ ] Verify discriminators with live simulations
- [ ] Test classifier against real wallets
- [ ] Add error handling for edge cases (multisig, disputed NFTs)
- [ ] Document any discovered edge cases

### Medium Term (Future Work)

- [ ] Support for NFTs in unknown pools (if discoverable)
- [ ] Batching optimization (combine multiple NFT unfreezes into one tx)
- [ ] Wallet auto-detection (Phantom vs. Solflare)
- [ ] Dry-run mode (simulate without signing)

### Long Term

- [ ] Compressed asset support (requires tree proofs)
- [ ] Multisig account handling
- [ ] Historical transaction log analysis
- [ ] Community governance model for pool enumeration

## Important Notes

### Security

- **No keys transmitted**: All signing happens locally in the browser
- **Client-side only**: No backend server, no cookie tracking
- **Source is auditable**: Single HTML file, view source directly
- **Read the code**: Before pasting your private key, inspect recovery.html

### Limitations

- **Legacy program**: Unrecoverable (bytecode deleted on-chain, verified)
- **Compressed assets**: Not supported (requires merkle proof verification)
- **Unknown pools**: May exist for Generations; would need pool enumeration
- **Multisig wallets**: Not tested; signer account must be the transaction payer

### Community

- Built as an unofficial community tool (not affiliated with Honeyland team)
- No warranty or liability accepted
- If this tool helped, optional donation address is in footer
- Pull requests welcome for verified improvements

## Research References

- **on-chain program states**: Verified via Solana blockchain (mainnet)
- **Legacy program bytecode**: Confirmed deleted (ProgramData = NULL)
- **Discriminators**: Extracted from known working transactions
- **Instruction layouts**: Reverse-engineered from successful unfreezes

## Files Modified This Session

```
NEW:
  Honeyland Unstaker/classifier.js
  Honeyland Unstaker/UNSTAKE_INSTRUCTION_RESEARCH.md
  Honeyland Unstaker/CLAUDE_CODE_INTEGRATION.md

MODIFIED:
  Honeyland Unstaker/recovery.html (added classification report section)
  Honeyland Unstaker/serve.js (support PORT env var)
  .claude/launch.json (added honeyland-unstaker config)

UNCHANGED (live):
  Honeyland-Unstaker-Github Files/* (not modified, not deployed)
  index.html, burn.html, check*.js (reference only)
```

## Questions?

See individual file headers for technical details. Review `UNSTAKE_INSTRUCTION_RESEARCH.md` for on-chain research methodology.
