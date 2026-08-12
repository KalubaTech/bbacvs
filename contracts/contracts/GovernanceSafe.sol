// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title GovernanceSafe
/// @notice Minimal 2-of-3 multi-signature wallet for ZQA / ECZ / HEA (FR1, security L4).
/// @dev Prototype stand-in for a production Gnosis Safe deployment. Privileged operations
///      on IssuerRegistry / CredentialRegistry should set this contract as their admin so
///      that no single regulator can act unilaterally. Production: replace with Gnosis Safe.
contract GovernanceSafe {
    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public threshold; // = 2

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 confirmations;
    }

    Transaction[] public transactions;
    // txId => owner => confirmed
    mapping(uint256 => mapping(address => bool)) public confirmed;

    event TransactionProposed(uint256 indexed txId, address indexed proposer, address to);
    event TransactionConfirmed(uint256 indexed txId, address indexed owner);
    event TransactionExecuted(uint256 indexed txId);

    modifier onlyOwner() {
        require(isOwner[msg.sender], "Safe: not an owner");
        _;
    }

    /// @param _owners Exactly three signatories: [ZQA, ECZ, HEA].
    /// @param _threshold Required confirmations (2).
    constructor(address[] memory _owners, uint256 _threshold) {
        require(_owners.length == 3, "Safe: need 3 owners");
        require(_threshold == 2, "Safe: threshold must be 2");
        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0) && !isOwner[owner], "Safe: invalid owner");
            isOwner[owner] = true;
            owners.push(owner);
        }
        threshold = _threshold;
    }

    /// @notice Propose a privileged call; auto-confirms from the proposer.
    function proposeTransaction(address to, uint256 value, bytes calldata data)
        external
        onlyOwner
        returns (uint256 txId)
    {
        txId = transactions.length;
        transactions.push(Transaction({
            to: to,
            value: value,
            data: data,
            executed: false,
            confirmations: 0
        }));
        emit TransactionProposed(txId, msg.sender, to);
        _confirm(txId);
    }

    /// @notice Confirm a pending transaction. Executes automatically once threshold met.
    function confirmTransaction(uint256 txId) external onlyOwner {
        _confirm(txId);
    }

    function _confirm(uint256 txId) internal {
        require(txId < transactions.length, "Safe: bad txId");
        require(!transactions[txId].executed, "Safe: already executed");
        require(!confirmed[txId][msg.sender], "Safe: already confirmed");

        confirmed[txId][msg.sender] = true;
        transactions[txId].confirmations += 1;
        emit TransactionConfirmed(txId, msg.sender);

        if (transactions[txId].confirmations >= threshold) {
            _execute(txId);
        }
    }

    function _execute(uint256 txId) internal {
        Transaction storage t = transactions[txId];
        require(!t.executed, "Safe: already executed");
        require(t.confirmations >= threshold, "Safe: under threshold");
        t.executed = true;
        (bool ok, ) = t.to.call{value: t.value}(t.data);
        require(ok, "Safe: call failed");
        emit TransactionExecuted(txId);
    }

    function transactionCount() external view returns (uint256) {
        return transactions.length;
    }

    receive() external payable {}
}
