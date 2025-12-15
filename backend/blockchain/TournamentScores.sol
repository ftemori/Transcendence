// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TournamentScores {
    struct Result {
        string tournamentId;
        string winnerId;
        uint256 timestamp;
    }

    address public owner;
    mapping(string => Result) private results;
    string[] private tournamentIds;

    event ResultRecorded(string indexed tournamentId, string winnerId, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function recordResult(string memory tournamentId, string memory winnerId) external onlyOwner {
        require(bytes(tournamentId).length > 0, "tournamentId required");
        require(bytes(winnerId).length > 0, "winnerId required");
        // if first time, push id for enumeration
        if (bytes(results[tournamentId].tournamentId).length == 0) {
            tournamentIds.push(tournamentId);
        }
        results[tournamentId] = Result({ tournamentId: tournamentId, winnerId: winnerId, timestamp: block.timestamp });
        emit ResultRecorded(tournamentId, winnerId, block.timestamp);
    }

    function getWinner(string memory tournamentId) external view returns (string memory) {
        return results[tournamentId].winnerId;
    }

    function getResult(string memory tournamentId) external view returns (string memory, string memory, uint256) {
        Result memory r = results[tournamentId];
        return (r.tournamentId, r.winnerId, r.timestamp);
    }

    function getTournamentCount() external view returns (uint256) {
        return tournamentIds.length;
    }

    function getTournamentAt(uint256 index) external view returns (string memory tournamentId, string memory winnerId, uint256 timestamp) {
        require(index < tournamentIds.length, "index out of bounds");
        string memory id = tournamentIds[index];
        Result memory r = results[id];
        return (r.tournamentId, r.winnerId, r.timestamp);
    }

    function getAllTournamentIds() external view returns (string[] memory) {
        return tournamentIds;
    }
}
