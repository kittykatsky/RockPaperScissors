pragma solidity ^0.6.0;

import "./Pausable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/// @author Kat
/// @title 
contract RockPaperScissors is Pausable {

    using SafeMath for uint;

    enum Moves {NONE, ROCK, PAPER, SCISSORS}
    uint32 constant CUTOFF_LIMIT = 24 hours;
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
    event LogPlayerJoined(bytes32 indexed gameId, address indexed player, uint wager);
    event LogFeePaid(bytes32 indexed gameId, address indexed player, uint wager, uint fee);
    event LogPlayerMoved(bytes32 indexed gameId, address indexed player);

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
        require(games[_gameId].deadline == 0, 'Game already hosted!');
        uint deadline = now.add(_deadline);
        games[_gameId].deadline = deadline;
        games[_gameId].wager = msg.value;
        emit LogNewGame(_gameId, msg.sender, deadline, msg.value);
    }

    function joinGame(bytes32 _gameId)
        whenRunning
        external
        payable
    {
        require(games[_gameId].player == address(0x0), 'Game full!');
        require(games[_gameId].wager <= msg.value, 'Bet below minimum amount');
        require(games[_gameId].deadline > now, 'Game has expired');
        
        uint wager = msg.value.sub(gameFee);
        games[_gameId].player = msg.sender;
        games[_gameId].wager = games[_gameId].wager.add(wager);

        emit LogPlayerJoined(_gameId, msg.sender, wager);
        emit LogFeePaid(_gameId, msg.sender, wager, gameFee);

        address contractOwner = getOwner();
        
        balances[contractOwner] = balances[contractOwner].add(gameFee);
    }

    function submitMove(bytes32 _gameId, Moves move)
        whenRunning
        external
    {
        require(games[_gameId].deadline > now, 'Game has expired');
        require(games[_gameId].player == msg.sender, 'You havent joined this game!');
        require(games[_gameId].playerMove == Moves.NONE, 'Youve already submitted a move');
        require(move != Moves.NONE, 'Bad move specified');
        games[_gameId].playerMove = move;
        emit LogPlayerMoved(_gameId, msg.sender);
    }

    function playGame(bytes32 secret)
        whenRunning
        external
    {

    }

    function withdrawFunds()
        external
        whenRunning
        returns (bool _success)
    {

        uint amount;
        (_success, ) = msg.sender.call{value: amount}("");
        require(_success, 'Transfer failed!');
    }

    function reclaimFunds(bytes32 puzzle)
        external
        returns (bool _success)
    {

        uint amount;
        (_success, ) = msg.sender.call{value: amount}("");
        require(_success, 'Transfer failed!');
    }
}
