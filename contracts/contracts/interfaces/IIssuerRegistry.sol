// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IIssuerRegistry
/// @notice Minimal interface other BBACVS contracts use to check issuer authorisation.
interface IIssuerRegistry {
    /// @notice True if `account` currently holds an authorised ISSUER_ROLE.
    function isAuthorised(address account) external view returns (bool);

    /// @notice DID (did:ethr) bound to an authorised issuer, or 0x0 if none.
    function issuerDID(address account) external view returns (bytes32);
}
