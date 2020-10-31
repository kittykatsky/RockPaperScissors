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
    uint32 public constant MAX_GAMETIME = 24 hours;
    // Game min length
    uint32 public constant MIN_GAMETIME = 300 seconds;
    // Amount of time the host has to resolve the game after
    // the 2bd player has joined, after which the game is
    // considered a forfeit (by the host) and the 2nd player
    // can claim the wager
	uint16 public constant PLAY_TIME = 600 seconds;
    uint public gameFee;

    struct GameInfo {
       address player;
       address host;
       Moves playerMove;
       uint deadline;
       uint bet;
    }

    /// Holds players winnings
    mapping(address => uint) public balances;
    /// Maps game id to game
    mapping(bytes32 => GameInfo) public games;
    /// Maps move combinations to game outcomes
    mapping(Moves => mapping(Moves => gameOutcome)) public outcomes;

    /// Events
    event LogGameStarted(
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
    event LogGameFinished(
        bytes32 indexed gameId, 
        address indexed host, 
        address indexed player, 
        gameOutcome outcome, 
        uint price
    );
    event LogBalanceDeposited(address indexed depositAddress, uint amount);
    event LogBalanceWithdrawn(address indexed withdrawAddress, uint amount);
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
    }

    modifier validMove(Moves move)
    {
        require(move > Moves.NONE && move <= Moves.SCISSORS,'Invalid move');
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
    /// @param gameTime game deadline
    /// @param wager amount wagered in the game
    /// @dev game can either be hosted by providing ether when calling
    /// or previous winnings
    function newGame(bytes32 gameId, address player, uint gameTime, uint wager)
        whenRunning
        external
        payable
    {
        require(player != address(0x0) && player != msg.sender, 'Incorrect player specified');
        require(gameId != bytes32(0), 'Incorrect gameId provided');
        require(games[gameId].deadline == 0, 'Game already hosted!');
        require(gameTime <= MAX_GAMETIME && gameTime >= MIN_GAMETIME, 
                'A game cant run for less than 5 mins or longer than 24h');
        require(wager >= gameFee, 'below minimum wager sent');

        uint paid = msg.value.sub(gameFee);
        uint hostBalance = balances[msg.sender]; 
        
        require(paid == wager || hostBalance.add(paid) >= wager, 'Not enough ether to host game');

        // if sent amount if less than wager, withdraw missing amount from balances
        // if its more, deposit rest into balances

        if (paid != wager) {
            if (paid < wager) {
                balances[msg.sender] = hostBalance.sub(wager.sub(paid)); 
                emit LogBalanceWithdrawn(msg.sender, gameFee);
            } else if (paid > wager) {
                balances[msg.sender] = hostBalance.add(paid.sub(wager)); 
                emit LogBalanceDeposited(msg.sender, gameFee);
            }
        }
        

        uint gameDeadline = now.add(gameTime);
        games[gameId].deadline = gameDeadline;
        games[gameId].bet = paid;
        games[gameId].host = msg.sender; 
        games[gameId].player = player; 
        
        emit LogGameStarted(gameId, msg.sender, player, gameDeadline, wager, gameFee);

        address contractOwner = getOwner();
        balances[contractOwner] = balances[contractOwner].add(gameFee);

        emit LogFeePaid(gameId, msg.sender, paid, gameFee);
        emit LogBalanceDeposited(msg.sender, gameFee);
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
        uint wager = games[gameId].bet;
        uint paid = msg.value.sub(gameFee);

        require(games[gameId].playerMove == Moves.NONE, 'Already joined');
        require(paid == wager|| balances[msg.sender].add(paid) >= wager, 'wager below minimum amount');
        require(games[gameId].deadline > now, 'Game has expired');
        
        // if sent amount if less than the wager, withdraw missing amount from balances
        // if its more, deposit rest into balances

        if (paid != wager) {
            uint playerBalance = balances[msg.sender];
            if (paid < wager) {
                balances[msg.sender] = playerBalance.sub(wager.sub(paid));
                emit LogBalanceWithdrawn(msg.sender, gameFee);
            } else if (paid > wager) {
                balances[msg.sender] = playerBalance.add(paid.sub(wager));
                emit LogBalanceDeposited(msg.sender, gameFee);
            } 
        }
        
        uint newDeadline = now.add(PLAY_TIME);
        games[gameId].playerMove = move;
        games[gameId].deadline = newDeadline; 

        emit LogPlayerJoined(gameId, msg.sender, wager, newDeadline);

        address contractOwner = getOwner();
        balances[contractOwner] = balances[contractOwner].add(gameFee);

        emit LogFeePaid(gameId, msg.sender, wager, gameFee);
    }

    /// Play the game
    /// @param secret host secret
    /// @param hostMove hosts move
    /// @dev plays the game, decides the winner, game data 
    /// is cleared out, saving the caller some gas
    function playGame(bytes32 secret, Moves hostMove)
        whenRunning
        external
    {   
        bytes32 gameId = generateGameId(msg.sender, secret, hostMove);
        Moves playerMove = games[gameId].playerMove;

        require(playerMove != Moves.NONE, 'Player hasnt joined');
        
        address player = games[gameId].player;
        uint wager = games[gameId].bet;
        
        /// clear out struct to save some gas
        games[gameId].player = address(0);
        games[gameId].playerMove = Moves.NONE;
        games[gameId].bet = 0;

        gameOutcome outcome = gameOutcome.DRAW;
        uint hostMoveCheck = uint(hostMove);
        uint playerMoveCheck = uint(playerMove).mod(3);

        if (hostMoveCheck.mod(3) == playerMoveCheck) {
            balances[msg.sender] = balances[msg.sender].add(wager);  
            balances[player] = balances[player].add(wager);  
            emit LogBalanceDeposited(msg.sender, wager);
            emit LogBalanceDeposited(player, wager);
        } else {
            wager = wager.mul(2);
            if (hostMoveCheck == playerMoveCheck + 1) {
                outcome = gameOutcome.HOST_WIN;
                balances[msg.sender] = balances[msg.sender].add(wager);  
                emit LogBalanceDeposited(msg.sender, wager);
            } else {
                outcome = gameOutcome.PLAYER_WIN;
                balances[player] = balances[player].add(wager);  
                emit LogBalanceDeposited(player, wager);
            }
        }
        emit LogGameFinished(gameId, msg.sender, player, outcome, wager);
    }

    /// Cancel a hosted game
    /// @param gameId unique id of a game
    /// @dev Host can cancel the game if the second player doesnt 
    /// join before the deadline has lapsed. 
    /// Canceling a game allows the gameId to be reused
    function cancelGame(bytes32 gameId)
        whenRunning
        external
    {
        require(games[gameId].host == msg.sender, 'Only host can cancel a game');
        require(games[gameId].playerMove == Moves.NONE, 'Cant cancel after player has joined');
        require(
            now >= games[gameId].deadline, 
            'deadline has not passed'
        );

        address player = games[gameId].player; 
        uint payout = games[gameId].bet;
        
        delete games[gameId];

        balances[msg.sender] = balances[msg.sender].add(payout);

        emit LogGameCanceled(gameId, msg.sender, player);
    }

    /// Use in case the host is a sore loser
    /// @param gameId unique id of a game
    /// @dev anyone can resolve a game if the host
    /// doesnt resolve the game within 10 minutes
    /// of a player joining. If someone resolves 
    /// the game on behalf of the player they retain
    /// a small fee to cover the costs
    function soreLoser(bytes32 gameId)
        whenRunning
        external
    {
        require(games[gameId].playerMove != Moves.NONE, 'player needs to join game');
        require(now >= games[gameId].deadline, 'Host still has time to resolve the game');
        uint payout = games[gameId].bet.mul(2);
        address host = games[gameId].host;
        address player = games[gameId].player;

        delete games[gameId];

        if (msg.sender != player) {
            uint fee = payout.div(10);
            payout = payout.sub(fee);
            balances[msg.sender] = balances[msg.sender].add(fee);
            emit LogBalanceDeposited(msg.sender, fee);
        }

        balances[player] = balances[player].add(payout);

        emit LogBalanceDeposited(player, payout);
        emit LogHostIsASoreLoser(gameId, host, player, payout);
    }

    /// Allows a player to withdraw their winnings
    /// @param amount amount to withdraw
	/// @return _success true if the withdrawal was successful
    function withdrawFunds(uint amount)
        whenRunning
        external
        returns (bool _success)
    {
        balances[msg.sender] = balances[msg.sender].sub(amount, 'Not enough ETH available');
        emit LogBalanceWithdrawn(msg.sender, amount);
        (_success, ) = msg.sender.call{value: amount}("");
        require(_success, 'Transfer failed!');
    }


    /// Allows us to test the game logic
    /// @param left left move
    /// @param right right move
    /// @param expectedOutcome expected result of game
	/// @return _outcome true if the game logic matches the desired outcome
    function testGameLogic(Moves left, Moves right, gameOutcome expectedOutcome)
    public
    view
    returns (bool _outcome)
    {
        gameOutcome outcome = gameOutcome.DRAW;
        uint leftMoveCheck = uint(left);
        uint rightMoveCheck = uint(right).mod(3);

        if (leftMoveCheck.mod(3) == rightMoveCheck) {
        } else {
            if (leftMoveCheck == rightMoveCheck + 1) {
                outcome = gameOutcome.HOST_WIN;
            } else {
                outcome = gameOutcome.PLAYER_WIN;
            }
        }
        if (outcome == expectedOutcome) {
            _outcome = true;
        }
        else {
            _outcome = false;
        }
        require(_outcome, 'incorrect outcome');
    }

    /// Generate a unique id for a game
    /// @param secret hosts password for this game
    /// @param move move played by host
    /// @dev puzzle combines the address of the host, 
    /// the contract, the secret and move provided by the host
    /// this generates a unique id for the game
	/// @return gameId a hash generated from the input paramaters
    function generateGameId(address host, bytes32 secret, Moves move)
        public
        validMove(move)
        view
        returns (bytes32 gameId)
    {
        gameId = keccak256(abi.encodePacked(host, secret, move, address(this)));
    }
}
