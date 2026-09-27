import json
import datetime
import hashlib
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from loguru import logger

try:
    from web3 import Web3
    WEB3_AVAILABLE = True
except ImportError:
    Web3 = None
    WEB3_AVAILABLE = False

from app.config import (
    BLOCKCHAIN_PROVIDER_URL,
    BLOCKCHAIN_CONTRACT_ADDRESS,
    BLOCKCHAIN_PRIVATE_KEY,
    BLOCKCHAIN_WALLET_ADDRESS
)
from app.models import BlockchainTransaction, Permission, PatientProfile, DoctorProfile, ConsentGrant
from app.database import SessionLocal

# --- Solidity Smart Contract Source Code ---
SOLIDITY_CONTRACT_SOURCE = """
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MedicalAccessControl {
    address public owner;

    struct AccessRule {
        bool exists;
        bool isAllowed;
        uint256 expiry;
        bool isEmergencyAllowed;
    }

    // Mapping: patientId => doctorId => AccessRule
    mapping(uint256 => mapping(uint256 => AccessRule)) public permissions;
    
    // Mapping: imageHash => ipfsCid
    mapping(string => string) public registeredImages;

    event AccessGranted(uint256 indexed patientId, uint256 indexed doctorId, string accessType, uint256 expiry);
    event AccessRevoked(uint256 indexed patientId, uint256 indexed doctorId);
    event ImageRegistered(string indexed imageHash, string ipfsCid, uint256 indexed patientId);
    event AuditLogged(string indexed action, string indexed detail, uint256 timestamp);

    mapping(address => bool) public authorizedCallers;

    constructor() {
        owner = msg.sender;
        authorizedCallers[msg.sender] = true;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == owner || authorizedCallers[msg.sender], "Caller is not authorized");
        _;
    }

    function setAuthorizedCaller(address caller, bool isAuthorized) public onlyOwner {
        authorizedCallers[caller] = isAuthorized;
    }

    function registerImage(string memory imageHash, string memory ipfsCid, uint256 patientId) public onlyAuthorized {
        registeredImages[imageHash] = ipfsCid;
        emit ImageRegistered(imageHash, ipfsCid, patientId);
    }

    function grantAccess(uint256 patientId, uint256 doctorId, uint256 durationHours, bool allowEmergency) public onlyAuthorized {
        permissions[patientId][doctorId] = AccessRule({
            exists: true,
            isAllowed: true,
            expiry: durationHours == 0 ? 0 : block.timestamp + (durationHours * 1 hours),
            isEmergencyAllowed: allowEmergency
        });
        emit AccessGranted(patientId, doctorId, "READ_DOWNLOAD", permissions[patientId][doctorId].expiry);
    }

    function revokeAccess(uint256 patientId, uint256 doctorId) public onlyAuthorized {
        if (permissions[patientId][doctorId].exists) {
            permissions[patientId][doctorId].isAllowed = false;
        }
        emit AccessRevoked(patientId, doctorId);
    }

    function verifyAccess(uint256 patientId, uint256 doctorId, bool isEmergency) public view returns (bool) {
        AccessRule memory rule = permissions[patientId][doctorId];
        if (!rule.exists || !rule.isAllowed) {
            if (isEmergency && rule.isEmergencyAllowed) {
                return true;
            }
            return false;
        }
        if (rule.expiry > 0 && block.timestamp > rule.expiry) {
            return false;
        }
        return true;
    }

    function logAudit(string memory action, string memory detail) public onlyAuthorized {
        emit AuditLogged(action, detail, block.timestamp);
    }
}
"""

# ABI representing the smart contract for Web3 interfaces
CONTRACT_ABI = [
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": False,
		"inputs": [
			{"indexed": True, "internalType": "uint256", "name": "patientId", "type": "uint256"},
			{"indexed": True, "internalType": "uint256", "name": "doctorId", "type": "uint256"},
			{"indexed": False, "internalType": "string", "name": "accessType", "type": "string"},
			{"indexed": False, "internalType": "uint256", "name": "expiry", "type": "uint256"}
		],
		"name": "AccessGranted",
		"type": "event"
	},
	{
		"anonymous": False,
		"inputs": [
			{"indexed": True, "internalType": "uint256", "name": "patientId", "type": "uint256"},
			{"indexed": True, "internalType": "uint256", "name": "doctorId", "type": "uint256"}
		],
		"name": "AccessRevoked",
		"type": "event"
	},
	{
		"anonymous": False,
		"inputs": [
			{"indexed": True, "internalType": "string", "name": "action", "type": "string"},
			{"indexed": True, "internalType": "string", "name": "detail", "type": "string"},
			{"indexed": False, "internalType": "uint256", "name": "timestamp", "type": "uint256"}
		],
		"name": "AuditLogged",
		"type": "event"
	},
	{
		"anonymous": False,
		"inputs": [
			{"indexed": True, "internalType": "string", "name": "imageHash", "type": "string"},
			{"indexed": False, "internalType": "string", "name": "ipfsCid", "type": "string"},
			{"indexed": True, "internalType": "uint256", "name": "patientId", "type": "uint256"}
		],
		"name": "ImageRegistered",
		"type": "event"
	},
	{
		"inputs": [
			{"internalType": "uint256", "name": "patientId", "type": "uint256"},
			{"internalType": "uint256", "name": "doctorId", "type": "uint256"},
			{"internalType": "uint256", "name": "durationHours", "type": "uint256"},
			{"internalType": "bool", "name": "allowEmergency", "type": "bool"}
		],
		"name": "grantAccess",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{"internalType": "string", "name": "action", "type": "string"},
			{"internalType": "string", "name": "detail", "type": "string"}
		],
		"name": "logAudit",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [{"internalType": "address", "name": "", "type": "address"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{"internalType": "uint256", "name": "", "type": "uint256"},
			{"internalType": "uint256", "name": "", "type": "uint256"}
		],
		"name": "permissions",
		"outputs": [
			{"internalType": "bool", "name": "exists", "type": "bool"},
			{"internalType": "bool", "name": "isAllowed", "type": "bool"},
			{"internalType": "uint256", "name": "expiry", "type": "uint256"},
			{"internalType": "bool", "name": "isEmergencyAllowed", "type": "bool"}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{"internalType": "string", "name": "", "type": "string"}
		],
		"name": "registeredImages",
		"outputs": [{"internalType": "string", "name": "", "type": "string"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{"internalType": "string", "name": "imageHash", "type": "string"},
			{"internalType": "string", "name": "ipfsCid", "type": "string"},
			{"internalType": "uint256", "name": "patientId", "type": "uint256"}
		],
		"name": "registerImage",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{"internalType": "uint256", "name": "patientId", "type": "uint256"},
			{"internalType": "uint256", "name": "doctorId", "type": "uint256"}
		],
		"name": "revokeAccess",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{"internalType": "uint256", "name": "patientId", "type": "uint256"},
			{"internalType": "uint256", "name": "doctorId", "type": "uint256"},
			{"internalType": "bool", "name": "isEmergency", "type": "bool"}
		],
		"name": "verifyAccess",
		"outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
		"stateMutability": "view",
		"type": "function"
	}
]

class LocalSimulatedBlockchain:
    """
    Simulated Python implementation of an immutable blockchain ledger.
    """
    def __init__(self):
        pass

    @staticmethod
    def sha3_256(text: str) -> str:
        return hashlib.sha3_256(text.encode()).hexdigest()

    def get_last_block(self, db: Session) -> Optional[BlockchainTransaction]:
        return db.query(BlockchainTransaction).order_by(BlockchainTransaction.id.desc()).first()

    def proof_of_work(self, last_proof: int) -> int:
        proof = 0
        while self.valid_proof(last_proof, proof) is False:
            proof += 1
        return proof

    @staticmethod
    def valid_proof(last_proof: int, proof: int) -> bool:
        guess = f"{last_proof}{proof}".encode()
        guess_hash = hashlib.sha3_256(guess).hexdigest()
        return guess_hash[:4] == "0000"

    def write_transaction(self, db: Session, tx_type: str, payload: dict, commit: bool = True) -> str:
        last_block = self.get_last_block(db)
        
        if last_block is None:
            block_index = 1
            prev_hash = "0" * 64
            last_proof = 100
        else:
            block_index = last_block.block_index + 1
            prev_hash = last_block.transaction_hash
            try:
                prev_payload = json.loads(last_block.payload)
                last_proof = prev_payload.get("proof", 100)
            except Exception:
                last_proof = 100

        proof = self.proof_of_work(last_proof)
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        block_data = {
            "index": block_index,
            "timestamp": timestamp,
            "type": tx_type,
            "data": payload,
            "proof": proof,
            "previous_hash": prev_hash
        }
        
        block_string = json.dumps(block_data, sort_keys=True)
        block_hash = self.sha3_256(block_string)
        
        db_tx = BlockchainTransaction(
            block_index=block_index,
            transaction_hash=block_hash,
            type=tx_type,
            payload=block_string,
            timestamp=datetime.datetime.now(datetime.timezone.utc)
        )
        db.add(db_tx)
        if commit:
            db.commit()
        else:
            db.flush()
        db.refresh(db_tx)
        return block_hash


class BlockchainService:
    """
    Production-grade Blockchain Client.
    Manages Web3 connections, gas estimation, wallet signing, and verification.
    Optimized for Hyperledger Besu Enterprise PoA (IBFT 2.0 / Zero-Gas configurations).
    """
    def __init__(self):
        self.w3 = None
        self.use_ethereum = False
        self.local_chain = LocalSimulatedBlockchain()
        self.contract_address = BLOCKCHAIN_CONTRACT_ADDRESS
        self.private_key = BLOCKCHAIN_PRIVATE_KEY
        self.wallet_address = BLOCKCHAIN_WALLET_ADDRESS
        self.contract = None

        if WEB3_AVAILABLE and Web3 is not None:
            try:
                self.w3 = Web3(Web3.HTTPProvider(BLOCKCHAIN_PROVIDER_URL))
                # Validate connection
                if self.w3.is_connected():
                    self.use_ethereum = True
                    
                    # Detect if connected to Hyperledger Besu or zero-gas private net
                    is_besu = False
                    try:
                        client_version = self.w3.client_version
                        gas_price = self.w3.eth.gas_price
                        if "besu" in client_version.lower() or gas_price == 0:
                            is_besu = True
                    except Exception:
                        pass
                        
                    if is_besu:
                        logger.info(f"Connected to Hyperledger Besu Private/Hybrid node at {BLOCKCHAIN_PROVIDER_URL} (Consensus: IBFT 2.0 / Zero-Gas Mode)")
                    else:
                        logger.info(f"Connected to Ethereum EVM-compatible node at {BLOCKCHAIN_PROVIDER_URL}")

                    if self.contract_address:
                        self.contract = self.w3.eth.contract(
                            address=Web3.to_checksum_address(self.contract_address),
                            abi=CONTRACT_ABI
                        )
                        logger.info(f"Connected to smart contract at {self.contract_address}")
                else:
                    logger.warning("Web3 provider configured but not connected. Using local blockchain simulation.")
            except Exception as e:
                logger.warning(f"Failed to initialize Web3 connector: {e}. Using simulation.")

    def _send_signed_transaction(self, contract_function, *args) -> str:
        """
        Builds, signs, and broadcasts a smart contract transaction.
        Supports both EIP-1559 and legacy formats to handle Besu PoA configurations.
        """
        if not self.use_ethereum or not self.contract or not self.private_key:
            raise RuntimeError("Web3 is not configured or contract is not deployed.")
            
        nonce = self.w3.eth.get_transaction_count(self.wallet_address)
        gas_price = self.w3.eth.gas_price
        
        # Build transaction parameters optimized for Besu
        tx_params = {
            'chainId': self.w3.eth.chain_id,
            'gas': 200000, # Initial fallback gas limit
            'nonce': nonce,
            'from': self.wallet_address
        }
        
        # Dynamic fee configuration: handle Besu zero-gas mode
        if gas_price == 0:
            tx_params['gasPrice'] = 0
        else:
            try:
                # EIP-1559 configuration (standard EVM)
                tx_params['maxFeePerGas'] = gas_price
                tx_params['maxPriorityFeePerGas'] = self.w3.to_wei('0', 'gwei') # Besu PoA priority fee is typically 0
            except Exception:
                # Fallback to legacy transaction format (Besu Clique/IBFT 1.0)
                tx_params['gasPrice'] = gas_price
                
        # Build transaction
        tx = contract_function(*args).build_transaction(tx_params)
        
        # Dynamic gas estimation
        try:
            estimated_gas = contract_function(*args).estimate_gas({'from': self.wallet_address})
            tx['gas'] = int(estimated_gas * 1.2) # Add safety margin
        except Exception as e:
            logger.warning(f"Gas estimation failed, using default gas limit: {str(e)}")

        # Sign the transaction
        signed_tx = self.w3.eth.account.sign_transaction(tx, private_key=self.private_key)
        
        # Broadcast the transaction
        tx_hash = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        
        # Wait for receipt
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        logger.info(f"Smart contract transaction succeeded. Gas used: {receipt.gasUsed}. Block: {receipt.blockNumber}")
        return tx_hash.hex()

    def record_upload(
        self, db: Session, image_id: int, image_hash: str, ipfs_cid: str,
        patient_id: int, uploader_id: int, commit: bool = True,
    ) -> str:
        """Registers a new medical image on-chain using only the IPFS CID."""
        payload = {
            "image_id": image_id,
            "image_hash": image_hash,
            "ipfs_cid": ipfs_cid,
            "patient_id": patient_id,
            "uploader_id": uploader_id,
            "action": "UPLOAD_IMAGE"
        }
        
        if self.use_ethereum and self.contract:
            try:
                tx_hash = self._send_signed_transaction(
                    self.contract.functions.registerImage,
                    image_hash,
                    ipfs_cid,
                    patient_id
                )
                self.local_chain.write_transaction(db, "UPLOAD", payload, commit=commit)
                return tx_hash
            except Exception as e:
                logger.error(f"Failed to record upload on-chain: {str(e)}. Falling back to simulation.")
                
        return self.local_chain.write_transaction(db, "UPLOAD", payload, commit=commit)

    def record_verification(self, db: Session, image_id: int, status: str, details: dict) -> str:
        """Logs verification events on-chain."""
        payload = {
            "image_id": image_id,
            "status": status,
            "details": details,
            "action": "VERIFY_INTEGRITY"
        }
        
        if self.use_ethereum and self.contract:
            try:
                tx_hash = self._send_signed_transaction(
                    self.contract.functions.logAudit,
                    "VERIFY_INTEGRITY",
                    json.dumps({"image_id": image_id, "status": status})
                )
                self.local_chain.write_transaction(db, "VERIFY", payload)
                return tx_hash
            except Exception as e:
                logger.error(f"Web3 audit log failed: {str(e)}")
                
        return self.local_chain.write_transaction(db, "VERIFY", payload)

    def record_permission_grant(self, db: Session, patient_id: int, doctor_id: Optional[int], hospital_id: Optional[int], access_type: str, expires_at: Optional[datetime.datetime]) -> str:
        """Records permission grants on the blockchain."""
        payload = {
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "hospital_id": hospital_id,
            "access_type": access_type,
            "expires_at": expires_at.isoformat() if expires_at else None,
            "action": "GRANT_PERMISSION"
        }
        
        if self.use_ethereum and self.contract:
            try:
                duration_hours = 0
                if expires_at:
                    delta = expires_at - datetime.datetime.now(datetime.timezone.utc)
                    duration_hours = max(1, int(delta.total_seconds() / 3600))
                
                # Default values for doctor/hospital mapping on contract
                target_doc = doctor_id or 0
                tx_hash = self._send_signed_transaction(
                    self.contract.functions.grantAccess,
                    patient_id,
                    target_doc,
                    duration_hours,
                    False # allowEmergency
                )
                self.local_chain.write_transaction(db, "ACCESS_GRANT", payload)
                return tx_hash
            except Exception as e:
                logger.error(f"Web3 grantAccess failed: {str(e)}")
                
        return self.local_chain.write_transaction(db, "ACCESS_GRANT", payload)

    def record_permission_revoke(self, db: Session, patient_id: int, doctor_id: Optional[int], hospital_id: Optional[int]) -> str:
        """Records permission revocation on the blockchain."""
        payload = {
            "patient_id": patient_id,
            "doctor_id": doctor_id,
            "hospital_id": hospital_id,
            "action": "REVOKE_PERMISSION"
        }
        
        if self.use_ethereum and self.contract:
            try:
                target_doc = doctor_id or 0
                tx_hash = self._send_signed_transaction(
                    self.contract.functions.revokeAccess,
                    patient_id,
                    target_doc
                )
                self.local_chain.write_transaction(db, "ACCESS_REVOKE", payload)
                return tx_hash
            except Exception as e:
                logger.error(f"Web3 revokeAccess failed: {str(e)}")
                
        return self.local_chain.write_transaction(db, "ACCESS_REVOKE", payload)

    def record_tamper_alert(self, db: Session, image_id: int, user_id: int, details: dict) -> str:
        """Records a tamper alert on the blockchain."""
        payload = {
            "image_id": image_id,
            "user_id": user_id,
            "details": details,
            "action": "TAMPER_ALERT"
        }
        
        if self.use_ethereum and self.contract:
            try:
                tx_hash = self._send_signed_transaction(
                    self.contract.functions.logAudit,
                    "TAMPER_ALERT",
                    json.dumps(payload)
                )
                self.local_chain.write_transaction(db, "TAMPER_ALERT", payload)
                return tx_hash
            except Exception as e:
                logger.error(f"Web3 tamper alert log failed: {str(e)}")
                
        return self.local_chain.write_transaction(db, "TAMPER_ALERT", payload)

    def record_quarantine(self, db: Session, image_id: int, user_id: int, details: dict) -> str:
        """Records an image quarantine event on the blockchain."""
        payload = {
            "image_id": image_id,
            "user_id": user_id,
            "details": details,
            "action": "IMAGE_QUARANTINED"
        }
        if self.use_ethereum and self.contract:
            try:
                tx_hash = self._send_signed_transaction(
                    self.contract.functions.logAudit,
                    "IMAGE_QUARANTINED",
                    json.dumps(payload)
                )
                self.local_chain.write_transaction(db, "IMAGE_QUARANTINED", payload)
                return tx_hash
            except Exception as e:
                logger.error(f"Web3 quarantine log failed: {str(e)}")
        return self.local_chain.write_transaction(db, "IMAGE_QUARANTINED", payload)

    def record_recovery(self, db: Session, image_id: int, user_id: int, details: dict) -> str:
        """Records a region-level self-recovery execution event on the blockchain."""
        payload = {
            "image_id": image_id,
            "user_id": user_id,
            "details": details,
            "action": "RECOVERY_COMPLETED"
        }
        if self.use_ethereum and self.contract:
            try:
                tx_hash = self._send_signed_transaction(
                    self.contract.functions.logAudit,
                    "RECOVERY_COMPLETED",
                    json.dumps(payload)
                )
                self.local_chain.write_transaction(db, "RECOVERY_COMPLETED", payload)
                return tx_hash
            except Exception as e:
                logger.error(f"Web3 recovery log failed: {str(e)}")
        return self.local_chain.write_transaction(db, "RECOVERY_COMPLETED", payload)


    def check_smart_contract_permission(self, db: Session, patient_id: int, doctor_id: int, hospital_id: int, is_emergency: bool = False) -> bool:
        """
        Verifies permission states. Checks smart contract state if available,
        otherwise falls back to local database mappings (Permission and ConsentGrant).
        """
        if is_emergency:
            # Audit log on blockchain for emergency access
            self.record_verification(db, 0, "EMERGENCY_OVERRIDE", {"patient_id": patient_id, "doctor_id": doctor_id})
            return True
            
        if self.use_ethereum and self.contract:
            try:
                # Query verifyAccess on-chain
                allowed = self.contract.functions.verifyAccess(patient_id, doctor_id, False).call()
                return allowed
            except Exception as e:
                logger.warning(f"Web3 verifyAccess check failed: {str(e)}. Querying database fallback.")

        # Local database permission check
        now = datetime.datetime.now(datetime.timezone.utc)
        doc_profile = db.query(DoctorProfile).filter(DoctorProfile.user_id == doctor_id).first()
        resolved_doc_id = doc_profile.id if doc_profile else doctor_id

        # Check doctor specific permission
        perm = db.query(Permission).filter(
            Permission.patient_id == patient_id,
            Permission.doctor_id == resolved_doc_id,
            Permission.is_active == True
        ).first()

        if not perm and hospital_id:
            # Check hospital-wide permission granted by patient
            perm = db.query(Permission).filter(
                Permission.patient_id == patient_id,
                Permission.hospital_id == hospital_id,
                Permission.is_active == True
            ).first()

        if perm:
            perm_expiry = perm.expires_at
            if perm_expiry:
                if perm_expiry.tzinfo is None:
                    perm_expiry = perm_expiry.replace(tzinfo=datetime.timezone.utc)
                if perm_expiry > now:
                    return True
            else:
                return True

        # Check fine-grained ConsentGrant records
        user_id_to_check = doctor_id
        if doc_profile and doc_profile.user_id:
            user_id_to_check = doc_profile.user_id

        grant = db.query(ConsentGrant).filter(
            ConsentGrant.patient_id == patient_id,
            ConsentGrant.recipient_user_id == user_id_to_check,
            ConsentGrant.revoked_at.is_(None),
            ConsentGrant.starts_at <= now,
            ConsentGrant.expires_at > now
        ).first()
        if grant:
            return True

        return False

# Global instance
blockchain_service = BlockchainService()
