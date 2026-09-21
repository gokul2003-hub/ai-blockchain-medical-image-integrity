# Medical Access Control — Blockchain Module

## Overview

This Hardhat project deploys the `MedicalAccessControl` smart contract to a local Ethereum node for development and testing. The backend uses Web3.py to interact with the contract for:

- Registering medical image hashes (integrity ledger)
- Granting/revoking doctor access
- Logging tamper detection and recovery events
- Audit trail immutability

---

## Quick Start (Local Development)

### Prerequisites
- Node.js 18+ (`node --version`)
- npm 8+ (`npm --version`)

### Setup and Launch

**One command (Windows):**
```batch
blockchain\start_hardhat.bat
```

**Manual (any OS):**
```bash
cd blockchain
npm install

# Terminal 1: Start local node
npx hardhat node

# Terminal 2: Deploy contract
npx hardhat run scripts/deploy.js --network localhost
```

---

## Configuration

After deployment, add to your backend `.env` file:

```env
# Switch from SQLite simulation to real blockchain
BLOCKCHAIN_PROVIDER=web3
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
BLOCKCHAIN_CONTRACT_ADDRESS=<address from deployment.json>

# Hardhat test account #0 — ONLY for local development
BLOCKCHAIN_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
BLOCKCHAIN_WALLET_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

> ⚠️ **SECURITY**: The Hardhat default private keys are public knowledge. Never use them for staging or production.

---

## Contract Architecture

### `MedicalAccessControl.sol`

| Function | Access | Description |
|----------|--------|-------------|
| `registerImage(hash, cid, patientId)` | Authorized only | Record image hash + IPFS CID on-chain |
| `grantAccess(patientId, doctorId, hours, emergency)` | Authorized only | Grant time-limited doctor access |
| `revokeAccess(patientId, doctorId)` | Authorized only | Revoke doctor access |
| `verifyAccess(patientId, doctorId, isEmergency)` | Public view | Check if access is valid |
| `logAudit(action, detail)` | Authorized only | Emit audit event |

### Events Emitted
- `ImageRegistered(imageHash, ipfsCid, patientId)` — on image upload
- `AccessGranted(patientId, doctorId, type, expiry)` — on consent grant
- `AccessRevoked(patientId, doctorId)` — on consent revocation
- `AuditLogged(action, detail, timestamp)` — on tamper/recovery/access

---

## Hardhat Test Accounts

The local node starts with 20 funded test accounts (10,000 ETH each). Account #0 is used as the contract deployer.

| Account | Address |
|---------|---------|
| #0 (deployer) | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| #1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |

---

## Backend Integration Flow

```
Backend request
    │
    ├─ BLOCKCHAIN_PROVIDER=web3 → Web3 → Hardhat RPC → Contract
    │
    └─ BLOCKCHAIN_PROVIDER=development → SQLite simulation (fallback)
```

The fallback activates automatically when the RPC URL is unreachable.
