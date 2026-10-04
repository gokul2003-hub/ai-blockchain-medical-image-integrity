from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import json
import hashlib

from app.database import get_db
from app.models import BlockchainTransaction, User
from app.schemas import BlockchainTransactionResponse
from app.auth import get_current_user, RoleChecker
from app.blockchain import LocalSimulatedBlockchain

router = APIRouter(prefix="/blockchain", tags=["Blockchain Ledger"])
admin_guard = RoleChecker(["super_admin", "hospital_admin"])

GENESIS_PARENT_HASH = "0" * 64


def _load_payload(block: BlockchainTransaction):
    """Return (payload_dict, error). Exactly one of the two is None."""
    try:
        payload = json.loads(block.payload)
    except (TypeError, ValueError) as exc:
        return None, f"payload is not valid JSON ({exc})"

    if not isinstance(payload, dict):
        return None, f"payload is a {type(payload).__name__}, expected a JSON object"

    return payload, None


def _read_previous_hash(block: BlockchainTransaction):
    payload, _ = _load_payload(block)
    return payload.get("previous_hash") if payload else None

@router.get("/blocks", response_model=List[BlockchainTransactionResponse])
async def get_blockchain_ledger(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieves all mined blocks of the blockchain ledger."""
    return db.query(BlockchainTransaction).order_by(
        BlockchainTransaction.block_index.asc(),
        BlockchainTransaction.id.asc(),
    ).all()

@router.get("/verify-chain")
async def verify_blockchain_integrity(
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_guard)
):
    """
    Validates the entire blockchain cryptographic links to verify ledger integrity.

    Three independent properties are checked for every block:
      1. genesis anchoring - block 1 must point at the all-zero parent hash
      2. link continuity   - each block's previous_hash must equal its parent's hash
      3. content integrity - transaction_hash must equal SHA3-256 of the block payload
    """
    blocks = db.query(BlockchainTransaction).order_by(
        BlockchainTransaction.block_index.asc(),
        BlockchainTransaction.id.asc(),
    ).all()

    if not blocks:
        return {"status": "SUCCESS", "message": "Blockchain ledger is empty (no transactions recorded yet)"}

    chain = LocalSimulatedBlockchain()
    violations = []

    genesis_block = blocks[0]
    if _read_previous_hash(genesis_block) != GENESIS_PARENT_HASH:
        violations.append(
            f"Genesis Block #{genesis_block.block_index} is not anchored: "
            f"expected previous_hash of all zeros."
        )

    for i in range(1, len(blocks)):
        current_block = blocks[i]
        previous_block = blocks[i - 1]

        payload, parse_error = _load_payload(current_block)
        if parse_error:
            violations.append(
                f"Malformed payload at Block #{current_block.block_index}: {parse_error}"
            )
            continue

        expected_prev_hash = payload.get("previous_hash")
        if not isinstance(expected_prev_hash, str):
            violations.append(
                f"Block #{current_block.block_index} is missing a string 'previous_hash' field."
            )
        elif expected_prev_hash != previous_block.transaction_hash:
            violations.append(
                f"Cryptographic link broken at Block #{current_block.block_index}. "
                f"Expected previous hash: {previous_block.transaction_hash[:10]}... "
                f"but block contains: {expected_prev_hash[:10]}..."
            )

        recomputed = chain.sha3_256(json.dumps(payload, sort_keys=True))
        if recomputed != current_block.transaction_hash:
            violations.append(
                f"Block #{current_block.block_index} content hash mismatch - the stored "
                f"payload does not hash to its recorded transaction_hash "
                f"({current_block.transaction_hash[:10]}... vs {recomputed[:10]}...)."
            )

    if violations:
        return {
            "status": "FAIL",
            "message": "Ledger integrity check failed! Unauthorized modification detected.",
            "violations": violations,
        }

    return {
        "status": "SUCCESS",
        "message": "Blockchain ledger integrity verified successfully. All block links are valid.",
        "block_count": len(blocks)
    }
