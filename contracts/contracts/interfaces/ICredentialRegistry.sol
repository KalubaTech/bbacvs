// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICredentialRegistry
/// @notice Minimal interface the RevocationRegistry uses to resolve a credential's recorded issuer.
interface ICredentialRegistry {
    /// @notice The address that anchored `credentialHash`, or address(0) if it was never anchored.
    function issuerOf(bytes32 credentialHash) external view returns (address);
}
