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
    // Amount of time the host has to resolve the game after
    // the 2bd player has joined, after which the game is
    // considered a forfeit (by the host) and the 2nd player
    // can claim the wager
	uint16 public constant PLAY_TIME = 600 seconds;
    uint public gameFee;

    struct GameInfo {
       address player;
       Moves playerMove;
       uint cutoffTime;
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
    event LogNewGame(
        bytes32 indexed gameId,
        address indexed host,
        address indexed secondPlayer,
        uint deadline,
        uint wager,
        uint gameFee
    );
    event LogPlayerJoined(
        bytes32 indexed gameId, 
        address indexed player, 
        uint wager, 
        uint cutoffTime
    );
    event LogFeePaid(bytes32 indexed gameId, address indexed player, uint wager, uint fee);
    event LogGameOutcome(
        bytes32 indexed gameId, 
        address indexed host, 
        address indexed player, 
        gameOutcome outcome, 
        uint price
    );
    event LogWithdrawEvent(address indexed withdrawAddress, uint amount);
    event LogGameCanceled(bytes32 indexed gameId, address indexed host, address indexed player);
    event LogHostIsASoreLoser(
        bytes32 indexed gameId, 
        address indexed host, 
        address indexed player, 
        uint price
    );

    /// Deployer sets running state, cost of playing a game
    /// Constructor then sets gamestates
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
        require(move > Moves.NONE && move <= Moves.SCISSORS,'Invalid move');
        _;
    }

    modifier onlyHost(bytes32 gameId, bytes32 secret, Moves move)
    {
        require(gameId == generateGameId(secret, move), 'Only game host can call this');
        _;
    }

    modifier onlyPlayer(bytes32 gameId)
    {
        require(msg.sender == games[gameId].player, 'Only this games player can call this');
        _;
    }

    /// Host a new game of RPS
    /// @param gameId unique gameid 
    /// @param player address of 2nd player
    /// @param deadline game deadline
    /// @param wager amount wagered in the game
    /// @dev game can either be hosted by providing ether when calling
    /// or previous winnings
    function newGame(bytes32 gameId, address player, uint deadline, uint wager)
        whenRunning
        external
        payable
    {
        require(player != address(0x0) && player != msg.sender, 'Incorrect player specified');
        require(games[gameId].deadline == 0, 'Game already hosted!');
        require(deadline <= CUTOFF_LIMIT, 'A game cant run longer than 24h');
        require(wager >= gameFee, 'below minimum wager sent');

        uint bet = msg.value.sub(gameFee);
        
        require(bet == wager || balances[msg.sender].add(bet) >= wager, 'Not enough ether to host game');

        if (bet < wager) {
            balances[msg.sender] = balances[msg.sender].sub(wager.sub(bet));
        }

        uint gameDeadline = now.add(deadline);
        games[gameId].deadline = gameDeadline;
        games[gameId].wager = wager;
        games[gameId].player = player; 
        
        emit LogNewGame(gameId, msg.sender, player, gameDeadline, wager, gameFee);

        address contractOwner = getOwner();
        balances[contractOwner] = balances[contractOwner].add(gameFee);

        emit LogFeePaid(gameId, msg.sender, bet, gameFee);
    }

    /// Allows second player to join the game
    /// @param gameId id of game the player wishes to join
    /// @param move players move
    /// @dev player can either send ether matching the wager + gameFee 
    /// or use previous winnings to join the game. Game fees
    /// are deducted at this point
    function joinGame(bytes32 gameId, Moves move)
        whenRunning
        onlyPlayer(gameId)
        validMove(move)
        external
        payable
    {
        uint wager = games[gameId].wager;
        uint bet = msg.value.sub(gameFee);

        require(games[gameId].playerMove == Moves.NONE, 'Already joined');
        require(bet == wager || balances[msg.sender].add(bet) >= wager, 'Bet below minimum amount');
        require(games[gameId].deadline > now, 'Game has expired');
        
        if (bet < wager) {
            balances[msg.sender] = balances[msg.sender].sub(wager.sub(bet));
            bet = wager;
        }
        
        uint cutoffTime = now.add(PLAY_TIME);
        games[gameId].playerMove = move;
        games[gameId].wager = games[gameId].wager.add(bet);
        games[gameId].cutoffTime = cutoffTime; 

        emit LogPlayerJoined(gameId, msg.sender, bet, cutoffTime);

        address contractOwner = getOwner();
        balances[contractOwner] = balances[contractOwner].add(gameFee);

        emit LogFeePaid(gameId, msg.sender, bet, gameFee);
    }

    /// Play the game
    /// @param gameId unique id of a game
    /// @param secret host secret
    /// @param hostMove hosts move
    /// @dev plays the game, decides the winner, game data 
    /// is cleared out, saving the caller some gas
    function playGame(bytes32 gameId, bytes32 secret, Moves hostMove)
        whenRunning
        onlyHost(gameId, secret, hostMove)
        external
    {   
        Moves playerMove = games[gameId].playerMove;

        require(playerMove != Moves.NONE, 'Player hasnt joined');
        require(now < games[gameId].deadline, 'game Deadline has passed');
        
        address player = games[gameId].player;
        uint wager = games[gameId].wager;
        
        /// clear out struct to save some gas
        delete games[gameId];

        gameOutcome outcome = outcomes[hostMove][playerMove];
        emit LogGameOutcome(gameId, msg.sender, player, outcome, wager);
        if (outcome == gameOutcome.DRAW){
            uint payout = wager.div(2);
            balances[msg.sender] = balances[msg.sender].add(payout);  
            balances[player] = balances[player].add(payout);  
        } else if (outcome == gameOutcome.HOST_WIN) {
            balances[msg.sender] = balances[msg.sender].add(wager);  
        } else if (outcome == gameOutcome.PLAYER_WIN) {
            balances[player] = balances[player].add(wager);  
        } else {
            revert();
        }

    }

    /// Cancel a hosted game
    /// @param gameId unique id of a game
    /// @dev Host can cancel the game if the second player doesnt 
    /// join before the deadline has lapsed. Also ensure that the
    /// host cant abscond with the wager if the player joins with
    /// less than 10 minutes of the deadline left and ensures
    /// that the playe still has a chance to declare the host
    /// a sore loser by giving the host another 15 after the player
    /// has joined before being able to cancel the game
    function cancelGame(bytes32 gameId, bytes32 secret, Moves move)
        whenRunning
        onlyHost(gameId, secret, move)
        external
    {
        require(
            now > games[gameId].deadline 
            && now > games[gameId].cutoffTime.add(300), 
            'deadline has not passed'
        );

        Moves playerMove = games[gameId].playerMove; 
        address player = games[gameId].player; 
        uint payout = games[gameId].wager;
        delete games[gameId];

        if (playerMove == Moves.NONE){
            balances[msg.sender] = balances[msg.sender] + payout;
        } else if (playerMove != Moves.NONE) {
            payout = payout.div(2);
            balances[msg.sender] = balances[msg.sender] + payout;
            balances[player] = balances[player] + payout;
        } else {
            revert();
        }
        emit LogGameCanceled(gameId, msg.sender, player);
    }

    /// Use in case the host is a sore loser
    /// @param gameId unique id of a game
    /// @dev 2nd player can claim victory if host
    /// doesnt resolve the game within 10 minutes
    /// of the player joining
    function soreLoser(bytes32 gameId, address host)
        whenRunning
        onlyPlayer(gameId)
        external
    {
        require(now > games[gameId].cutoffTime, 'Host still has time to resolve the game');
        uint payout = games[gameId].wager;
        delete games[gameId];
        balances[msg.sender] = balances[msg.sender] + payout;
        
        emit LogHostIsASoreLoser(gameId, host, msg.sender, payout);
    }

    /// Allows a player to withdraw their winnings
    /// @param amount amount to withdraw
	/// @return _success true if the withdrawal was successful
    function withdrawFunds(uint amount)
        whenRunning
        external
        returns (bool _success)
    {
        emit LogWithdrawEvent(msg.sender, amount);
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
        public
        validMove(move)
        view
        returns (bytes32 gameId)
    {
        gameId = keccak256(abi.encodePacked(msg.sender, secret, move, address(this)));
    }
}
