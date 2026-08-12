// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IIssuerRegistry} from "./interfaces/IIssuerRegistry.sol";
import {RevocationRegistry} from "./RevocationRegistry.sol";

/// @title CredentialRegistry
/// @notice Authoritative on-chain anchor for credential validity (FR2, FR4, FR8).
/// @dev Stores only the SHA-256 credential hash, IPFS CID hash, and issuer DID — never PII.
///      Verification (verifyCredential) is a read-only, zero-gas view. Security layers
///      L6 (cryptographic integrity) and L10 (reentrancy/gas) of the proposal.
contract CredentialRegistry is ReentrancyGuard, Pausable {
    /// @dev Packed to minimise storage slots (gas) per the class diagram.
    struct Credential {
        address issuer;     // slot 0: 20 bytes
        uint64 issuedAt;    // slot 0: + 8 bytes
        uint32 _gap;        // slot 0: padding
        bytes32 cidHash;    // slot 1: keccak of IPFS CID
        bytes32 issuerDID;  // slot 2
    }

    enum VerificationStatus {
        NotFound,        // 0
        Verified,        // 1
        Revoked,         // 2
        UnknownIssuer    // 3
    }

    IIssuerRegistry public immutable issuers;
    RevocationRegistry public immutable revocations;
    address public governance;

    mapping(bytes32 => Credential) private _credentials;

    event CredentialIssued(
        bytes32 indexed credentialHash,
        address indexed issuer,
        bytes32 cidHash,
        uint64 timestamp
    );

    constructor(address issuerRegistry, address revocationRegistry, address governance_) {
        require(issuerRegistry != address(0) && revocationRegistry != address(0), "Credential: zero dep");
        require(governance_ != address(0), "Credential: zero governance");
        issuers = IIssuerRegistry(issuerRegistry);
        revocations = RevocationRegistry(revocationRegistry);
        governance = governance_;
    }

    modifier onlyIssuer() {
        require(issuers.isAuthorised(msg.sender), "Credential: not authorised issuer");
        _;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "Credential: not governance");
        _;
    }

    /// @notice Anchor a single credential. Idempotency: a hash may be anchored once.
    function issueCredential(bytes32 credentialHash, bytes32 cidHash)
        external
        onlyIssuer
        whenNotPaused
        nonReentrant
    {
        _issue(credentialHash, cidHash);
    }

    /// @notice Batch anchor (gas-amortised). Arrays must be equal length.
    function batchIssue(bytes32[] calldata hashes, bytes32[] calldata cidHashes)
        external
        onlyIssuer
        whenNotPaused
        nonReentrant
    {
        require(hashes.length == cidHashes.length, "Credential: length mismatch");
        for (uint256 i = 0; i < hashes.length; i++) {
            _issue(hashes[i], cidHashes[i]);
        }
    }

    function _issue(bytes32 credentialHash, bytes32 cidHash) internal {
        require(credentialHash != bytes32(0), "Credential: empty hash");
        require(_credentials[credentialHash].issuedAt == 0, "Credential: already issued");

        _credentials[credentialHash] = Credential({
            issuer: msg.sender,
            issuedAt: uint64(block.timestamp),
            _gap: 0,
            cidHash: cidHash,
            issuerDID: issuers.issuerDID(msg.sender)
        });
        emit CredentialIssued(credentialHash, msg.sender, cidHash, uint64(block.timestamp));
    }

    /// @notice Read-only verification (zero gas via eth_call). Maps to the five UI states.
    /// @return status NotFound / Verified / Revoked / UnknownIssuer
    function verifyCredential(bytes32 credentialHash)
        external
        view
        returns (VerificationStatus status, Credential memory cred)
    {
        cred = _credentials[credentialHash];
        if (cred.issuedAt == 0) return (VerificationStatus.NotFound, cred);
        if (revocations.isRevoked(credentialHash)) return (VerificationStatus.Revoked, cred);
        if (!issuers.isAuthorised(cred.issuer)) return (VerificationStatus.UnknownIssuer, cred);
        return (VerificationStatus.Verified, cred);
    }

    function getCredential(bytes32 credentialHash) external view returns (Credential memory) {
        return _credentials[credentialHash];
    }

    /// @notice Emergency pause of issuance. Governance (2-of-3 multi-sig) only.
    function emergencyPause() external onlyGovernance {
        _pause();
    }

    function unpause() external onlyGovernance {
        _unpause();
    }
}
