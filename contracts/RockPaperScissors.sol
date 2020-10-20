pragma solidity ^0.6.0;

import "./Pausable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/// @author Kat
/// @title 
contract RockPaperScissors is Pausable {

    using SafeMath for uint;

    enum Moves {NONE, ROCK, PAPER, SCISSORS}
    enum gameOutcome {DRAW, HOST_WIN, PLAYER_WIN}
    uint32 constant CUTOFF_LIMIT = 24 hours;
	uint16 constant REVEAL_TIMER = 300 seconds;
    uint gameFee;

    struct GameInfo {
       address host;
       address player;
       bytes32 hiddenPlayerMove;
       Moves hostMove;
       Moves playerMove;
       uint revealDeadline;
       uint deadline;
       uint wager;
    }

    mapping(address => uint) public balances;
    mapping(bytes32 => GameInfo) public games;
    mapping(Moves => mapping(Moves => gameOutcome)) outcomes;

    event LogNewGame(bytes32 indexed gameId, address indexed host, uint deadline, uint wager);
    event LogPlayerJoined(bytes32 indexed gameId, address indexed player, uint wager);
    event LogFeePaid(bytes32 indexed gameId, address indexed player, uint wager, uint fee);
    event LogPlayerMoved(bytes32 indexed gameId, address indexed player);
    event LogPlayerRevealedMove(bytes32 indexed gameId, address indexed player, Moves move);
    event LogGameOutcome(
        bytes32 indexed gameId, 
        address indexed host, 
        address indexed player, 
        gameOutcome outcome, 
        uint price
    );

    constructor(bool pauseState, uint fee)
        Pausable(pauseState)
        public
    {
        gameFee = fee;
        /// draw state
        outcomes[Moves.ROCK][Moves.ROCK] = gameOutcome.DRAW;
        outcomes[Moves.PAPER][Moves.PAPER] = gameOutcome.DRAW;
        outcomes[Moves.SCISSORS][Moves.SCISSORS] = gameOutcome.DRAW;
        /// host win state
        outcomes[Moves.ROCK][Moves.SCISSORS] = gameOutcome.HOST_WIN;
        outcomes[Moves.PAPER][Moves.ROCK] = gameOutcome.HOST_WIN;
        outcomes[Moves.SCISSORS][Moves.PAPER] = gameOutcome.HOST_WIN;
        /// player win state
        outcomes[Moves.PAPER][Moves.SCISSORS] = gameOutcome.PLAYER_WIN;
        outcomes[Moves.SCISSORS][Moves.ROCK] = gameOutcome.PLAYER_WIN;
        outcomes[Moves.ROCK][Moves.PAPER] = gameOutcome.PLAYER_WIN;
    }

    modifier validMove(Moves move)
    {
        require(
            (move != Moves.ROCK) ||
            (move != Moves.PAPER) ||
            (move != Moves.SCISSORS),
            'Invalid move'
        );
        _;
    }

    function generateGameId(bytes32 secret, Moves move)
        public
        validMove(move)
        view
        returns (bytes32 puzzle)
    {
        puzzle = keccak256(abi.encodePacked(msg.sender, secret, move, address(this)));
    }

    function checkMove(bytes32 secret, Moves move, address player)
        private
        validMove(move)
        view
        returns (bytes32 puzzle)
    {
        puzzle = keccak256(abi.encodePacked(player, secret, move, address(this)));
    }

    function newGame(bytes32 _gameId, uint _deadline)
        whenRunning
        external
        payable
    {
        require(games[_gameId].deadline == 0, 'Game already hosted!');
        require(msg.value > gameFee, 'below minimum wager sent');
        uint deadline = now.add(_deadline);
        games[_gameId].host = msg.sender;
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

    function submitMove(bytes32 _gameId, bytes32 move)
        whenRunning
        external
    {
        require(games[_gameId].deadline > now, 'Game has expired');
        require(games[_gameId].player == msg.sender, 'You havent joined this game!');
        require(games[_gameId].hiddenPlayerMove == '', 'Youve already submitted a move');
        games[_gameId].hiddenPlayerMove = move;
        emit LogPlayerMoved(_gameId, msg.sender);
    }

    function revealMove(bytes32 gameId, bytes32 secret, Moves move)
        whenRunning
        validMove(move)
        external
    {
        require(games[gameId].revealDeadline == 0 || now < games[gameId].revealDeadline, 'times up!');
		if (msg.sender == games[gameId].host) {
            require(gameId == checkMove(secret, move, msg.sender), 'incorrect move');
            games[gameId].hostMove = move;
        } else if (msg.sender == games[gameId].player) {
            require(games[gameId].hiddenPlayerMove == checkMove(secret, move, msg.sender), 'incorrect move');
            games[gameId].playerMove = move;
        } else {
            revert();
        }

        if (games[gameId].hostMove == Moves.NONE && games[gameId].playerMove == Moves.NONE){
            games[gameId].revealDeadline == REVEAL_TIMER + now;
        }

    }

    function playGame(bytes32 _gameId)
        whenRunning
        external
    {   
        Moves hostMove = games[_gameId].hostMove;
        Moves playerMove = games[_gameId].playerMove;
        address player = games[_gameId].player; 
        address host = games[_gameId].host; 
        uint wager = games[_gameId].wager;
        require(player != address(0x0), 'Additional player needed');
        require(games[_gameId].deadline > now, 'Game has expired');
        require(hostMove != Moves.NONE && playerMove != Moves.NONE, 'Both moves not revealed');

        gameOutcome outcome = outcomes[hostMove][playerMove];
        emit LogGameOutcome(_gameId, outcome, host, player, wager);
        if (outcome == gameOutcome.DRAW){
            uint payout = wager.div(2);
            balances[host] = balances[host].add(payout);  
            balances[player] = balances[player].add(payout);  
        } else if (outcome == gameOutcome.HOST_WIN) {
            balances[host] = balances[host].add(wager);  
        } else if (outcome == gameOutcome.PLAYER_WIN) {
            balances[player] = balances[player].add(wager);  
        } else {
            revert();
        }
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

    function reclaimFunds()
        external
        returns (bool _success)
    {

        uint amount;
        (_success, ) = msg.sender.call{value: amount}("");
        require(_success, 'Transfer failed!');
    }
}
