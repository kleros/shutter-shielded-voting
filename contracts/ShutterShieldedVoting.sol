// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ShutterShieldedVoting {
    struct Vote {
        address voter; // The address of the juror.
        bytes32 commit; // The hash of the encrypted message + salt
        uint256 choice; // The choice of the juror.
        bool voted; // True if the vote has been cast.
    }

    Vote[] public votes;

    event CommitCast(
        address indexed _voter,
        uint256[] _voteIDs,
        bytes32 _commit,
        bytes32 _identity,
        bytes _encryptedVote
    );

    event VoteCast(
        address indexed _voter,
        uint256[] _voteIDs,
        uint256 indexed _choice,
        string _justification
    );

    constructor() {
        // Granting 3 votes to the deployer
        address voter = msg.sender;
        votes.push(Vote({voter: voter, commit: bytes32(0), choice: 0, voted: false}));
        votes.push(Vote({voter: voter, commit: bytes32(0), choice: 0, voted: false}));
        votes.push(Vote({voter: voter, commit: bytes32(0), choice: 0, voted: false}));
    }

    /**
     * @dev Computes the hash of a vote using ABI encoding
     * @param _choice The choice being voted for
     * @param _justification The justification for the vote
     * @param _salt A random salt for commitment
     * @return bytes32 The hash of the encoded vote parameters
     */
    function hashVote(uint256 _choice, bytes32 _salt, string memory _justification) public pure returns (bytes32) {
        bytes32 justificationHash = keccak256(bytes(_justification));
        return keccak256(abi.encode(_choice, _salt, justificationHash));
    }

    /**
     * @dev Casts a commitment for a set of voteIDs
     * @param _voteIDs The IDs of the votes to commit
     * @param _commit The commitment hash
     * @param _identity The Shutter identity
     * @param _encryptedVote The Shutter encrypted vote
     */
    function castCommit(
        uint256[] calldata _voteIDs,
        bytes32 _commit,
        bytes32 _identity,
        bytes calldata _encryptedVote
    ) external {
        // Store the commitment hash for each voteID
        for (uint256 i = 0; i < _voteIDs.length; i++) {
            require(votes[_voteIDs[i]].voter == msg.sender, "The caller has to own the vote.");
            votes[_voteIDs[i]].commit = _commit;
        }

        emit CommitCast(msg.sender, _voteIDs, _commit, _identity, _encryptedVote);
    }

    /**
     * @dev Casts a vote for a set of voteIDs
     * @param _voteIDs The IDs of the votes to cast
     * @param _choice The vote choice
     * @param _salt The salt used for commitment
     * @param _justification The vote justification
     */
    function castVote(
        uint256[] calldata _voteIDs,
        uint256 _choice,
        bytes32 _salt,
        string memory _justification
    ) external {
        require(_voteIDs.length > 0, "No voteID provided");

        // Verify the commitment hash for all votes at once
        bytes32 computedHash = hashVote(_choice, _salt, _justification);

        for (uint256 i = 0; i < _voteIDs.length; i++) {
            require(votes[_voteIDs[i]].commit == computedHash, "The commitment hash does not match.");
            require(!votes[_voteIDs[i]].voted, "Vote already cast.");
            votes[_voteIDs[i]].choice = _choice;
            votes[_voteIDs[i]].voted = true;
        }

        emit VoteCast(msg.sender, _voteIDs, _choice, _justification);
    }
}
