// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IIssuerRegistry} from "./interfaces/IIssuerRegistry.sol";
import {ICredentialRegistry} from "./interfaces/ICredentialRegistry.sol";

/// @title RevocationRegistry
/// @notice Timestamped, reason-coded credential revocation log (FR7).
/// @dev Authoritative on-chain revocation state. Verifiers treat a non-zero reasonCode
///      as REVOKED. An issuer may revoke or supersede ONLY the credentials it anchored itself:
///      the original issuer is resolved from the CredentialRegistry, not from the caller's
///      global authorisation (defect D01). Governance (the 2-of-3 GovernanceSafe) holds a
///      separate emergency power to revoke any anchored credential for regulatory action.
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
    address public immutable governance;
    address private immutable _deployer;
    /// @notice Set once after deployment (the CredentialRegistry is deployed after this contract).
    ICredentialRegistry public credentials;

    mapping(bytes32 => Revocation) private _revocations;
    /// @notice newHash => the credential it replaced (blocks a successor being reused).
    mapping(bytes32 => bytes32) public supersedes;

    event CredentialRegistryBound(address indexed credentialRegistry);
    event CredentialRevoked(bytes32 indexed credentialHash, ReasonCode code, uint64 timestamp);
    event CredentialReissued(bytes32 indexed oldHash, bytes32 indexed newHash, uint64 timestamp);
    event EmergencyRevocation(bytes32 indexed credentialHash, ReasonCode code, uint64 timestamp);

    constructor(address issuerRegistry, address governance_) {
        require(issuerRegistry != address(0), "Revocation: zero registry");
        require(governance_ != address(0), "Revocation: zero governance");
        issuers = IIssuerRegistry(issuerRegistry);
        governance = governance_;
        _deployer = msg.sender;
    }

    /// @notice One-time wiring to the CredentialRegistry. Deployer only, cannot be changed later.
    function bindCredentialRegistry(address credentialRegistry) external {
        require(msg.sender == _deployer, "Revocation: not deployer");
        require(address(credentials) == address(0), "Revocation: already bound");
        require(credentialRegistry != address(0), "Revocation: zero registry");
        credentials = ICredentialRegistry(credentialRegistry);
        emit CredentialRegistryBound(credentialRegistry);
    }

    modifier onlyIssuer() {
        require(issuers.isAuthorised(msg.sender), "Revocation: not authorised issuer");
        _;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "Revocation: not governance");
        _;
    }

    /// @dev The credential must exist, must not already be revoked, and (for issuer calls)
    ///      must have been anchored by the caller.
    function _requireRevocable(bytes32 credentialHash, bool ownerOnly) internal view {
        require(address(credentials) != address(0), "Revocation: registry not bound");
        address originalIssuer = credentials.issuerOf(credentialHash);
        require(originalIssuer != address(0), "Revocation: unknown credential");
        if (ownerOnly) require(originalIssuer == msg.sender, "Revocation: not credential issuer");
        require(_revocations[credentialHash].reasonCode == ReasonCode.NotRevoked, "Revocation: already revoked");
    }

    /// @notice Revoke one of the caller's own credentials with a standardised reason code (1–5).
    function revoke(bytes32 credentialHash, ReasonCode code) external onlyIssuer {
        require(code != ReasonCode.NotRevoked, "Revocation: invalid reason");
        _requireRevocable(credentialHash, true);

        _revocations[credentialHash] = Revocation({
            reasonCode: code,
            revokedAt: uint64(block.timestamp),
            revokedBy: msg.sender,
            supersededBy: bytes32(0)
        });
        emit CredentialRevoked(credentialHash, code, uint64(block.timestamp));
    }

    /// @notice Mark one of the caller's credentials revoked-and-superseded by a corrected one.
    /// @dev The replacement must already be anchored by the same issuer, be live, differ from the
    ///      original, and not already be the successor of another credential.
    function reissue(bytes32 oldHash, bytes32 newHash) external onlyIssuer {
        require(newHash != bytes32(0), "Revocation: zero replacement");
        require(newHash != oldHash, "Revocation: self replacement");
        _requireRevocable(oldHash, true);
        require(credentials.issuerOf(newHash) == msg.sender, "Revocation: replacement not issued by caller");
        require(_revocations[newHash].reasonCode == ReasonCode.NotRevoked, "Revocation: replacement revoked");
        require(supersedes[newHash] == bytes32(0), "Revocation: duplicate successor");

        supersedes[newHash] = oldHash;
        _revocations[oldHash] = Revocation({
            reasonCode: ReasonCode.AdministrativeError,
            revokedAt: uint64(block.timestamp),
            revokedBy: msg.sender,
            supersededBy: newHash
        });
        emit CredentialReissued(oldHash, newHash, uint64(block.timestamp));
    }

    /// @notice Emergency revocation of ANY anchored credential by governance (2-of-3 multi-sig),
    ///         e.g. when an issuer's key is lost or the issuer itself is under regulatory action.
    function governanceRevoke(bytes32 credentialHash, ReasonCode code) external onlyGovernance {
        require(code != ReasonCode.NotRevoked, "Revocation: invalid reason");
        _requireRevocable(credentialHash, false);

        _revocations[credentialHash] = Revocation({
            reasonCode: code,
            revokedAt: uint64(block.timestamp),
            revokedBy: msg.sender,
            supersededBy: bytes32(0)
        });
        emit EmergencyRevocation(credentialHash, code, uint64(block.timestamp));
    }

    function isRevoked(bytes32 credentialHash) external view returns (bool) {
        return _revocations[credentialHash].reasonCode != ReasonCode.NotRevoked;
    }

    function getRevocation(bytes32 credentialHash) external view returns (Revocation memory) {
        return _revocations[credentialHash];
    }
}
