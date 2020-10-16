pragma solidity ^0.6.0;

import "./Pausable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/// @author Kat
/// @title 
contract RockPaperScissors is Pausable {

    using SafeMath for uint;

    enum Moves {ROCK, PAPER, SCISSORS}
    uint32 constant CUTOFF_LIMIT = 2 hours;
    uint gameFee;

    struct GameInfo {
       address player;
       Moves playerMove;
       uint deadline;
       uint wager;
    }

    mapping(address => uint) public balances;
    mapping(bytes32 => GameInfo) public games;

    event LogNewGame(bytes32 indexed gameId, address indexed host, uint deadline, uint wager);
    event LogPlayerJoined(bytes32 indexed gameId, address player);

    constructor(bool pauseState, uint fee)
        Pausable(pauseState)
        public
    {
        gameFee = fee;
    }

    function generateGameId(bytes32 secret, Moves move)
        public
        view
        returns (bytes32 puzzle)
    {
        puzzle = keccak256(abi.encodePacked(msg.sender, secret, move, address(this)));
    }

    function newGame(bytes32 _gameId, uint _deadline)
        whenRunning
        external
        payable
    {
        uint wager = msg.value.sub(gameFee);
        uint deadline = now.add(_deadline);
        games[_gameId].deadline = deadline;
        games[_gameId].wager = wager;
        emit LogNewGame(_gameId, msg.sender, deadline, wager);
    }

    function playGame(bytes32 _gameId, Moves move)
        whenRunning
        external
        payable
    {
        uint wager = msg.value.sub(gameFee);
        games[_gameId].player = msg.sender;
        games[_gameId].playerMove = move;
        games[_gameId].wager = wager;
    }

}
