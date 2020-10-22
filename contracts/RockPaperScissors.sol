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
    event LogPlayerRevealedMove(bytes32 indexed gameId, address indexed player, uint time);
    event LogGameOutcome(
        bytes32 indexed gameId, 
        address indexed host, 
        address indexed player, 
        gameOutcome outcome, 
        uint price
    );
    event LogWithdrawEvent(address indexed withdrawAddress, uint amount, uint time);

    constructor(bool pauseState, uint fee)
        Pausable(pauseState)
        public
    {
        gameFee = fee;
        /// forfeit state
        outcomes[Moves.NONE][Moves.ROCK] = gameOutcome.PLAYER_WIN;
        outcomes[Moves.NONE][Moves.PAPER] = gameOutcome.PLAYER_WIN;
        outcomes[Moves.NONE][Moves.PAPER] = gameOutcome.PLAYER_WIN;
        outcomes[Moves.ROCK][Moves.NONE] = gameOutcome.HOST_WIN;
        outcomes[Moves.PAPER][Moves.NONE] = gameOutcome.HOST_WIN;
        outcomes[Moves.PAPER][Moves.NONE] = gameOutcome.HOST_WIN;
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
            (move == Moves.ROCK) ||
            (move == Moves.PAPER) ||
            (move == Moves.SCISSORS),
            'Invalid move'
        );
        _;
    }

    modifier onlyHost(bytes32 gameId, address caller)
    {
        require(msg.sender == games[gameId].host, 'Host only');
        _;
    }

    modifier onlyPlayer(bytes32 gameId, address caller)
    {
        require(msg.sender == games[gameId].player, 'Player only');
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

    function newGame(bytes32 _gameId, uint _deadline, uint wager)
        whenRunning
        external
        payable
    {
        uint bet = msg.value;
        require(games[_gameId].deadline == 0, 'Game already hosted!');
        require(wager > gameFee, 'below minimum wager sent');
        require(bet == wager || balances[msg.sender] >= wager, 'Not enough ether to host game');
        if (bet == 0) {
            balances[msg.sender] = balances[msg.sender].sub(wager);
            bet = wager;
        }
        uint deadline = now.add(_deadline);
        games[_gameId].host = msg.sender;
        games[_gameId].deadline = deadline;
        games[_gameId].wager = wager;
        emit LogNewGame(_gameId, msg.sender, deadline, wager);
    }

    function joinGame(bytes32 _gameId)
        whenRunning
        external
        payable
    {
        uint gameWager = games[_gameId].wager;
        require(games[_gameId].player == address(0x0), 'Game full!');
        require(msg.value == gameWager || balances[msg.sender] >= gameWager, 'Bet below minimum amount');
        require(games[_gameId].deadline > now, 'Game has expired');
        
        uint bet = msg.value;
        if (bet == 0) {
            balances[msg.sender] = balances[msg.sender].sub(gameWager);
            bet = gameWager;
        }
        emit LogPlayerJoined(_gameId, msg.sender, bet);
        emit LogFeePaid(_gameId, msg.sender, bet, gameFee);

        bet = bet.sub(gameFee);
        games[_gameId].player = msg.sender;
        games[_gameId].wager = games[_gameId].wager.add(bet);

        address contractOwner = getOwner();
        balances[contractOwner] = balances[contractOwner].add(gameFee);
    }

    function submitMove(bytes32 _gameId, bytes32 secretMove)
        whenRunning
        onlyPlayer(_gameId, msg.sender)
        external
    {
        require(games[_gameId].deadline > now, 'Game has expired');
        require(games[_gameId].player == msg.sender, 'You havent joined this game!');
        require(games[_gameId].hiddenPlayerMove == '', 'Youve already submitted a move');
        games[_gameId].hiddenPlayerMove = secretMove;
        emit LogPlayerMoved(_gameId, msg.sender);
    }

    function revealMove(bytes32 gameId, bytes32 secret, Moves move)
        whenRunning
        validMove(move)
        external
    {
        require(games[gameId].hiddenPlayerMove != '', 'Player hasnt submitted a move');
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

        if (games[gameId].hostMove == Moves.NONE || games[gameId].playerMove == Moves.NONE){
            uint timeLeftToReveal = REVEAL_TIMER + now;
            games[gameId].revealDeadline = timeLeftToReveal;
        }

        emit LogPlayerRevealedMove(gameId, msg.sender, now);
    }

    function playGame(bytes32 _gameId)
        whenRunning
        external
    {   
        uint revealTimeCheck = games[_gameId].revealDeadline;
        address player = games[_gameId].player; 
        address host = games[_gameId].host; 

        require(player != address(0x0), 'Additional player needed');
        require(revealTimeCheck != 0, 'Game not started');
        require(now > revealTimeCheck, 'Still time to play!');
        
        Moves hostMove = games[_gameId].hostMove;
        Moves playerMove = games[_gameId].playerMove;
        uint wager = games[_gameId].wager;
        
        /// clear out struct to save some gas
        delete games[_gameId];

        gameOutcome outcome = outcomes[hostMove][playerMove];
        emit LogGameOutcome(_gameId, host, player, outcome, wager);
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

    function cancelGame(bytes32 gameId)
        whenRunning
        onlyHost(gameId, msg.sender)
        external
    {
        require(now > games[gameId].deadline, 'deadline has not passed');

        address player = games[gameId].player; 
        uint payout = games[gameId].wager;
        games[gameId].wager = 0;

        if (player == address(0x0)){
            balances[msg.sender] = balances[msg.sender] + payout;
        } else if (player != address(0x0)) {
            payout = payout.div(2);
            balances[msg.sender] = balances[msg.sender] + payout;
            balances[player] = balances[player] + payout;
        } else {
            revert();
        }
    }

    function withdrawFunds(uint amount)
        whenRunning
        external
        returns (bool _success)
    {
        balances[msg.sender] = balances[msg.sender].sub(amount);
        (_success, ) = msg.sender.call{value: amount}("");
        require(_success, 'Transfer failed!');
    }
}
