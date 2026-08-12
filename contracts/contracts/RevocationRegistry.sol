// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IIssuerRegistry} from "./interfaces/IIssuerRegistry.sol";

/// @title RevocationRegistry
/// @notice Timestamped, reason-coded credential revocation log (FR7).
/// @dev Authoritative on-chain revocation state. Verifiers treat a non-zero reasonCode
///      as REVOKED. Only the authorised issuer may revoke its own credentials.
contract RevocationRegistry {
    /// @dev Standardised reason codes from FR7 of the proposal.
    enum ReasonCode {
        NotRevoked,        // 0
        AdministrativeError, // 1
        FraudDetected,     // 2
        RegulatoryAction,  // 3
        HolderRequest,     // 4
        Other              // 5
    }

    struct Revocation {
        ReasonCode reasonCode;
        uint64 revokedAt;
        address revokedBy;
        bytes32 supersededBy; // optional: hash of the reissued credential
    }

    IIssuerRegistry public immutable issuers;
    mapping(bytes32 => Revocation) private _revocations;

    event CredentialRevoked(bytes32 indexed credentialHash, ReasonCode code, uint64 timestamp);
    event CredentialReissued(bytes32 indexed oldHash, bytes32 indexed newHash, uint64 timestamp);

    constructor(address issuerRegistry) {
        require(issuerRegistry != address(0), "Revocation: zero registry");
        issuers = IIssuerRegistry(issuerRegistry);
    }

    modifier onlyIssuer() {
        require(issuers.isAuthorised(msg.sender), "Revocation: not authorised issuer");
        _;
    }

    /// @notice Revoke a credential with a standardised reason code (1–5).
    function revoke(bytes32 credentialHash, ReasonCode code) external onlyIssuer {
        require(code != ReasonCode.NotRevoked, "Revocation: invalid reason");
        require(_revocations[credentialHash].reasonCode == ReasonCode.NotRevoked, "Revocation: already revoked");

        _revocations[credentialHash] = Revocation({
            reasonCode: code,
            revokedAt: uint64(block.timestamp),
            revokedBy: msg.sender,
            supersededBy: bytes32(0)
        });
        emit CredentialRevoked(credentialHash, code, uint64(block.timestamp));
    }

    /// @notice Mark an old credential revoked-and-superseded by a reissued one.
    function reissue(bytes32 oldHash, bytes32 newHash) external onlyIssuer {
        require(_revocations[oldHash].reasonCode == ReasonCode.NotRevoked, "Revocation: already revoked");
        _revocations[oldHash] = Revocation({
            reasonCode: ReasonCode.AdministrativeError,
            revokedAt: uint64(block.timestamp),
            revokedBy: msg.sender,
            supersededBy: newHash
        });
        emit CredentialReissued(oldHash, newHash, uint64(block.timestamp));
    }

    function isRevoked(bytes32 credentialHash) external view returns (bool) {
        return _revocations[credentialHash].reasonCode != ReasonCode.NotRevoked;
    }

    function getRevocation(bytes32 credentialHash) external view returns (Revocation memory) {
        return _revocations[credentialHash];
    }
}
