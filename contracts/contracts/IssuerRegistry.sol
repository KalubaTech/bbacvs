// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IIssuerRegistry} from "./interfaces/IIssuerRegistry.sol";

/// @title IssuerRegistry
/// @notice Role-gated registry of accredited institutional issuers.
/// @dev Privileged calls (grant/revoke ISSUER_ROLE) are gated to DEFAULT_ADMIN_ROLE,
///      which in production is held by the 2-of-3 GovernanceSafe (ZQA/ECZ/HEA), not an EOA.
///      Security layer L3 (OpenZeppelin AccessControl) of the proposal's ten-layer model.
contract IssuerRegistry is AccessControl, IIssuerRegistry {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    struct Issuer {
        bytes32 did;          // did:ethr identifier
        bytes32 institution;  // short name / accreditation code
        uint64 registeredAt;
        bool active;
    }

    mapping(address => Issuer) private _issuers;

    event IssuerRoleGranted(address indexed account, bytes32 indexed did, bytes32 institution);
    event IssuerRoleRevoked(address indexed account);

    /// @param governance Address (GovernanceSafe) that receives DEFAULT_ADMIN_ROLE.
    constructor(address governance) {
        require(governance != address(0), "IssuerRegistry: zero governance");
        _grantRole(DEFAULT_ADMIN_ROLE, governance);
    }

    /// @notice Register/authorise an institutional issuer. Admin (governance) only.
    function grantIssuerRole(
        address account,
        bytes32 did,
        bytes32 institution
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(account != address(0), "IssuerRegistry: zero account");
        require(did != bytes32(0), "IssuerRegistry: empty DID");

        _issuers[account] = Issuer({
            did: did,
            institution: institution,
            registeredAt: uint64(block.timestamp),
            active: true
        });
        _grantRole(ISSUER_ROLE, account);
        emit IssuerRoleGranted(account, did, institution);
    }

    /// @notice Revoke an issuer's authorisation. Admin (governance) only.
    function revokeIssuerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_issuers[account].active, "IssuerRegistry: not active");
        _issuers[account].active = false;
        _revokeRole(ISSUER_ROLE, account);
        emit IssuerRoleRevoked(account);
    }

    /// @inheritdoc IIssuerRegistry
    function isAuthorised(address account) external view returns (bool) {
        return _issuers[account].active && hasRole(ISSUER_ROLE, account);
    }

    /// @inheritdoc IIssuerRegistry
    function issuerDID(address account) external view returns (bytes32) {
        return _issuers[account].active ? _issuers[account].did : bytes32(0);
    }

    function getIssuer(address account) external view returns (Issuer memory) {
        return _issuers[account];
    }
}
