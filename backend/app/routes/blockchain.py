from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import json
import hashlib

from app.database import get_db
from app.models import BlockchainTransaction, User
from app.schemas import BlockchainTransactionResponse
from app.auth import get_current_user, RoleChecker

router = APIRouter(prefix="/blockchain", tags=["Blockchain Ledger"])
admin_guard = RoleChecker(["super_admin", "hospital_admin"])

@router.get("/blocks", response_model=List[BlockchainTransactionResponse])
async def get_blockchain_ledger(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieves all mined blocks of the blockchain ledger."""
    return db.query(BlockchainTransaction).order_by(BlockchainTransaction.block_index.asc()).all()

@router.get("/verify-chain")
async def verify_blockchain_integrity(
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_guard)
):
    """
    Validates the entire blockchain cryptographic links to verify ledger integrity.
    Checks that every block's previous_hash equals the hash of the preceding block.
    """
    blocks = db.query(BlockchainTransaction).order_by(BlockchainTransaction.block_index.asc()).all()
    
    if not blocks:
        return {"status": "SUCCESS", "message": "Blockchain ledger is empty (no transactions recorded yet)"}
        
    warnings = []
    for i in range(1, len(blocks)):
        current_block = blocks[i]
        previous_block = blocks[i-1]
        
        try:
            current_payload = json.loads(current_block.payload)
            expected_prev_hash = current_payload.get("previous_hash")
            
            if expected_prev_hash != previous_block.transaction_hash:
                warnings.append(
                    f"Cryptographic link broken at Block #{current_block.block_index}. "
                    f"Expected previous hash: {previous_block.transaction_hash[:10]}... "
                    f"but block contains: {expected_prev_hash[:10]}..."
                )
        except Exception as e:
            warnings.append(f"Failed to parse payload at Block #{current_block.block_index}: {str(e)}")
            
    if warnings:
        return {
            "status": "FAIL",
            "message": "Ledger integrity check failed! Unauthorized modification detected.",
            "violations": warnings
        }
        
    return {
        "status": "SUCCESS",
        "message": "Blockchain ledger integrity verified successfully. All block links are valid.",
        "block_count": len(blocks)
    }
