pragma solidity ^0.6.0;

import "./Pausable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/// @author Kat
/// @title A Smart Contract implementatoin of Rock, Paper, Scissors 
contract RockPaperScissors is Pausable {

    using SafeMath for uint;

    // Valid moves
    enum Moves {NONE, ROCK, PAPER, SCISSORS}
    // Valid game states
    enum gameOutcome {DRAW, HOST_WIN, PLAYER_WIN}
    // Game max length
    uint32 public constant CUTOFF_LIMIT = 24 hours;
    // Amount of time 2nd player has to reveal his move after
    // first player has removed his/her
	uint16 public constant REVEAL_TIMER = 300 seconds;
    uint public gameFee;

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

    /// Holds players winnings
    mapping(address => uint) public balances;
    /// Maps game id to game
    mapping(bytes32 => GameInfo) public games;
    /// Maps move combinations to game outcomes
    mapping(Moves => mapping(Moves => gameOutcome)) public outcomes;

    /// Events
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
    event LogGameCanceled(bytes32 indexed gameId, address indexed host, address indexed player);

    /// Deployer sets running state, cost of playing a game
    /// Constructor then sets gamestates
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

    /// Host a new game of RPS
    /// @param gameId unique gameid 
    /// @param deadline game deadline
    /// @param wager amount wagered in the game
    /// @dev game can either be hosted by providing ether when calling
    /// or previous winnings, gmae fee is not applied until another 
    /// player joins
    function newGame(bytes32 gameId, uint deadline, uint wager)
        whenRunning
        external
        payable
    {
        uint bet = msg.value;
        require(games[gameId].deadline == 0, 'Game already hosted!');
        require(deadline <= CUTOFF_LIMIT, 'A game cant run longer than 24h');
        require(wager > gameFee, 'below minimum wager sent');
        require(bet == wager || balances[msg.sender] >= wager, 'Not enough ether to host game');
        if (bet == 0) {
            balances[msg.sender] = balances[msg.sender].sub(wager);
            bet = wager;
        }
        uint gameDeadline = now.add(deadline);
        games[gameId].host = msg.sender;
        games[gameId].deadline = gameDeadline;
        games[gameId].wager = wager;
        emit LogNewGame(gameId, msg.sender, gameDeadline, wager);
    }

    /// Allows second player to join the game
    /// @param gameId id of game the player wishes to join
    /// @dev player can either send ether matching the wager
    /// or use previous winnings to join the game. Game fees
    /// are deducted at this point
    function joinGame(bytes32 gameId)
        whenRunning
        external
        payable
    {
        uint gameWager = games[gameId].wager;
        require(games[gameId].player == address(0x0), 'Game full!');
        require(msg.value == gameWager || balances[msg.sender] >= gameWager, 'Bet below minimum amount');
        require(games[gameId].deadline > now, 'Game has expired');
        
        uint bet = msg.value;
        if (bet == 0) {
            balances[msg.sender] = balances[msg.sender].sub(gameWager);
            bet = gameWager;
        }
        emit LogPlayerJoined(gameId, msg.sender, bet);
        emit LogFeePaid(gameId, msg.sender, bet, gameFee);

        bet = bet.sub(gameFee);
        games[gameId].player = msg.sender;
        games[gameId].wager = games[gameId].wager.add(bet);

        address contractOwner = getOwner();
        balances[contractOwner] = balances[contractOwner].add(gameFee);
    }

    /// Allows second player to submit their move
    /// @param gameId unique game id
    /// @param secretMove players encoded move
    /// @dev Allows the 2nd player to submit their move
    function submitMove(bytes32 gameId, bytes32 secretMove)
        whenRunning
        external
    {
        require(games[gameId].deadline > now, 'Game has expired');
        require(games[gameId].player == msg.sender, 'You havent joined this game!');
        require(games[gameId].hiddenPlayerMove == '', 'Youve already submitted a move');
        games[gameId].hiddenPlayerMove = secretMove;
        emit LogPlayerMoved(gameId, msg.sender);
    }

    /// Allows a player to reveal their moves
    /// @param gameId unique id of game
    /// @param secret a players secret
    /// @param move move submitted by a player
    /// @dev both players need to reveal their moves before
    /// playing the game. A 5 min timer start after the first
    /// move is revealed. If both players have revealed their
    /// moves, the game can be played after this timer has lapsed.
    /// If the 2nd player hasnt revealed their move, this counts 
    /// as a forfeit, and the player who revealed their move will
    /// automatically win.
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

    /// Play the game
    /// @param gameId unique id of a game
    /// @dev plays the game, decides the winner, game data 
    /// is cleared out, saving the caller some gas
    function playGame(bytes32 gameId)
        whenRunning
        external
    {   
        uint revealTimeCheck = games[gameId].revealDeadline;
        address player = games[gameId].player; 
        address host = games[gameId].host; 

        require(player != address(0x0), 'Additional player needed');
        require(revealTimeCheck != 0, 'Game not started');
        require(now > revealTimeCheck, 'Still time to play!');
        
        Moves hostMove = games[gameId].hostMove;
        Moves playerMove = games[gameId].playerMove;
        uint wager = games[gameId].wager;
        
        /// clear out struct to save some gas
        delete games[gameId];

        gameOutcome outcome = outcomes[hostMove][playerMove];
        emit LogGameOutcome(gameId, host, player, outcome, wager);
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

    /// Cancel a hosted game
    /// @param gameId unique id of a game
    /// @dev Host can cancel the game if the second player doesnt 
    /// join or submit a move before the deadline has lapsed
    function cancelGame(bytes32 gameId)
        whenRunning
        external
    {
        require(msg.sender == games[gameId].host, 'Only host can cancel a game');
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
        emit LogGameCanceled(gameId, msg.sender, player);
    }

    /// Allows a player to withdraw their winnings
    /// @param amount amount to withdraw
	/// @return _success true if the withdrawal was successful
    function withdrawFunds(uint amount)
        whenRunning
        external
        returns (bool _success)
    {
        balances[msg.sender] = balances[msg.sender].sub(amount);
        (_success, ) = msg.sender.call{value: amount}("");
        require(_success, 'Transfer failed!');
    }

    /// Generate a unique id for a game
    /// @param secret hosts password for this game
    /// @param move move played by host
    /// @dev puzzle combines the address of the host, 
    /// the contract, the secret and move provided by the host
    /// this generates a unique id for the game
	/// @return gameId a hash generated from the input paramaters
    function generateGameId(bytes32 secret, Moves move)
        external
        validMove(move)
        view
        returns (bytes32 gameId)
    {
        gameId = keccak256(abi.encodePacked(msg.sender, secret, move, address(this)));
    }

    /// Used to check a players move
    /// @param secret player password for this game
    /// @param move players move
    /// @param player the player who submitted the move
    /// @dev this function is used by the contract to verify
    /// that the move the player has revealed is the same as 
    /// they've submitted, note that the player is both the host
    /// and they 2nd player in this context, meaning that the
    /// hosts gameHash will be the gameId
	/// @return moveHash a hash generated from the input paramaters
    function checkMove(bytes32 secret, Moves move, address player)
        private
        validMove(move)
        view
        returns (bytes32 moveHash)
    {
        moveHash = keccak256(abi.encodePacked(player, secret, move, address(this)));
    }

}
