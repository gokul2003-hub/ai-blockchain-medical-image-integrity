// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MedicalAccessControl
 * @notice Blockchain audit ledger for AI-Driven Secure Medical Image Sharing.
 *         Records image registration, access grants/revocations, and tamper/recovery events.
 * @dev Deployed on Hardhat local network for development.
 *      Only authorized callers (backend wallet) can write state.
 */
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

    // Mapping: imageHash => ipfsCid (integrity registry)
    mapping(string => string) public registeredImages;

    // Events
    event AccessGranted(
        uint256 indexed patientId,
        uint256 indexed doctorId,
        string accessType,
        uint256 expiry
    );
    event AccessRevoked(uint256 indexed patientId, uint256 indexed doctorId);
    event ImageRegistered(
        string indexed imageHash,
        string ipfsCid,
        uint256 indexed patientId
    );
    event AuditLogged(
        string indexed action,
        string indexed detail,
        uint256 timestamp
    );

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
        require(
            msg.sender == owner || authorizedCallers[msg.sender],
            "Caller is not authorized"
        );
        _;
    }

    function setAuthorizedCaller(
        address caller,
        bool isAuthorized
    ) public onlyOwner {
        authorizedCallers[caller] = isAuthorized;
    }

    /**
     * @notice Register a medical image hash and its IPFS CID on-chain.
     * @param imageHash  SHA-3 hash of the original image
     * @param ipfsCid    IPFS content identifier for the encrypted image
     * @param patientId  Patient identifier (opaque integer, no PHI stored)
     */
    function registerImage(
        string memory imageHash,
        string memory ipfsCid,
        uint256 patientId
    ) public onlyAuthorized {
        registeredImages[imageHash] = ipfsCid;
        emit ImageRegistered(imageHash, ipfsCid, patientId);
    }

    /**
     * @notice Grant a doctor access to a patient's images.
     * @param patientId      Patient identifier
     * @param doctorId       Doctor identifier
     * @param durationHours  0 = permanent; otherwise hours until expiry
     * @param allowEmergency Whether emergency break-glass is allowed
     */
    function grantAccess(
        uint256 patientId,
        uint256 doctorId,
        uint256 durationHours,
        bool allowEmergency
    ) public onlyAuthorized {
        permissions[patientId][doctorId] = AccessRule({
            exists: true,
            isAllowed: true,
            expiry: durationHours == 0
                ? 0
                : block.timestamp + (durationHours * 1 hours),
            isEmergencyAllowed: allowEmergency
        });
        emit AccessGranted(
            patientId,
            doctorId,
            "READ_DOWNLOAD",
            permissions[patientId][doctorId].expiry
        );
    }

    /**
     * @notice Revoke a doctor's access to a patient's images.
     */
    function revokeAccess(
        uint256 patientId,
        uint256 doctorId
    ) public onlyAuthorized {
        if (permissions[patientId][doctorId].exists) {
            permissions[patientId][doctorId].isAllowed = false;
        }
        emit AccessRevoked(patientId, doctorId);
    }

    /**
     * @notice Verify whether a doctor has current access to a patient's images.
     * @return True if access is valid and not expired.
     */
    function verifyAccess(
        uint256 patientId,
        uint256 doctorId,
        bool isEmergency
    ) public view returns (bool) {
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

    /**
     * @notice Log an audit event on-chain (tamper detection, recovery, access).
     * @param action  Action type string (e.g. "UPLOAD", "TAMPER_DETECTED", "RECOVERY")
     * @param detail  Additional metadata (e.g. image hash prefix, tx reference)
     */
    function logAudit(
        string memory action,
        string memory detail
    ) public onlyAuthorized {
        emit AuditLogged(action, detail, block.timestamp);
    }
}
