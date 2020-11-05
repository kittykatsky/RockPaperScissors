/* xxx
 *
 * Tests for xxx contract.
 * All test refers to the xxx contract (it)
 * unless otherwise specifed.
 *
 * tests require min. 3 accounts
 *
 * */

const { BN, toBN, fromAscii } = web3.utils;
const chai = require('chai');
const chaiAsPromised = require("chai-as-promised");
chai.use(require('chai-bn')(BN));
chai.use(chaiAsPromised);
const expect = chai.expect;
const truffleAssert = require('truffle-assertions');
const RockPaperScissors = artifacts.require('RockPaperScissors');
const timeMachine = require('ganache-time-traveler');

require("dotenv").config({path: "./.env"});

contract('RPS', function(accounts) {

    let RPS, gameId, newGame, snapshotId;
    const [aliceAccount, bobAccount, carolAccount] = accounts;

    const player1 = bobAccount;
    const player2 = carolAccount;
    const player3 = aliceAccount;
    const secret = fromAscii('hello');
    const secret2 = fromAscii('world');
    const cost = 1000;
    const wager = 5000;
    const bet = 6000;
    const rock = 1
        , paper = 2
        , scissors = 3
    const draw = 0
        , hostWin = 1
        , playerWin = 2;

    beforeEach('Setup new RPS before each test', async function () {
        RPS = await RockPaperScissors.new(false, cost, {from: aliceAccount});
        gameId = await RPS.generateGameId(player1, secret, paper);
        newGame = await RPS.newGame(gameId, player2, 5000, wager, {from: player1, value: bet});
        snapshotId = (await timeMachine.takeSnapshot())['result'];
    });

    afterEach(async() => {
        await timeMachine.revertToSnapshot(snapshotId);
    });

    describe('deployment', function () {

    });

    describe('Pausable', function () {

        it("Should be owned by the deployer", async function () {
            return expect(await RPS.getOwner()).to.equal(aliceAccount)
        });

        it("Should not be possible to host a game when paused", async function () {
            await RPS.pause({from: aliceAccount})
            const gameId2 = await RPS.generateGameId(player1, secret, paper)
            return expect(RPS.newGame(gameId2, 5000, wager, {from: player1, value: bet})).to.be.rejected;
        });

        it("Should be possible to kill a paused contract", async function () {
            await RPS.pause({from: aliceAccount});
            const tx = await RPS.kill({from: aliceAccount});
            return assert.strictEqual(tx.receipt.status, true);
        });

        it("Should not be possible to run a killed contract", async function () {
            await RPS.pause({from: aliceAccount});
            const gameId2 = await RPS.generateGameId(player1, secret, paper)
            return expect(RPS.newGame(gameId2, 5000, wager, {from: player1, value: bet})).to.be.rejected;
        });

        it("Should not be possible to unpause a killed contract", async function () {
            await RPS.pause({from: aliceAccount});
            await RPS.kill({from: aliceAccount});
            return expect(RPS.resume({from: aliceAccount})).to.be.rejected;
        });

        it("Should not be possible to empty a live contract", async function () {
            return expect(RPS.emptyAccount(aliceAccount, {from: aliceAccount})).to.be.rejected;
        });

        it("Should be possible to empty a killed contract", async function () {
            await RPS.pause({from: aliceAccount});
            await RPS.kill({from: aliceAccount});
            return expect(RPS.emptyAccount(aliceAccount, {from: aliceAccount})).to.be.fulfilled;
        });
    });

    describe('Play game', function () {

        it("Should not be possible to rehost a running game", async function () {
            return expect(RPS.newGame(gameId, 5000, wager, {from: player1, value: bet})).to.be.rejected;
        });

        it("Should be possible to join a hosted game", async function () {
            return expect(RPS.joinGame(gameId, paper, {from: player2, value: bet})).to.be.fulfilled;
        });

        it("Should not be possible to join a hosted game after the deadline has expired", async function () {
            await timeMachine.advanceTimeAndBlock(5000);
            return expect(RPS.joinGame(gameId, paper, {from: player2, value: bet})).to.be.rejected;
        });

        it("Should not be possible to join a second time", async function () {
            await expect(RPS.joinGame(gameId, paper, {from: player2, value: bet})).to.be.fulfilled;
            return expect(RPS.joinGame(gameId, paper, {from: player2, value: bet})).to.be.rejected;
        });

        it("Should not be possible to join a game if not providing a minimum stake", async function () {
            return expect(RPS.joinGame(gameId, paper, {from: player2, value: 4000})).to.be.rejected;
        });

        it("Should not be possible to join if not part of the game", async function () {
            return expect(RPS.joinGame(gameId, paper, {from: player3, value: bet})).to.be.rejected;
        });

        it("Should not be possible to join with a invalid move", async function () {
            return expect(RPS.joinGame(gameId, 0, {from: player3, value: bet})).to.be.rejected;
        });

        it("Should not be possible to lie about your move", async function () {
            await expect(RPS.joinGame(gameId, 3, {from: player2, value: bet})).to.be.fulfilled;
            return expect(RPS.playGame(secret, 3, {from: player1})).to.be.rejected;
        });

        it("Should be possible to play the game", async function () {
            await expect(RPS.joinGame(gameId, scissors, {from: player2, value: bet})).to.be.fulfilled;
            return await RPS.playGame(secret, paper, {from: player1});
        });

        it("Should add the wager to the winners balance", async function () {
            await expect(RPS.joinGame(gameId, scissors, {from: player2, value: bet})).to.be.fulfilled;
            const winnerBalanceBefore = await RPS.balances(player2);
            const loserBalanceBefore = await RPS.balances(player1);
            assert.strictEqual(winnerBalanceBefore.toString(), '0');
            assert.strictEqual(loserBalanceBefore.toString(), '0');

            await RPS.playGame(secret, paper, {from: player1});

            const winnerBalanceAfter = await RPS.balances(player2);
            const loserBalanceAfter = await RPS.balances(player1);
            expectedAmount = new BN(wager.toString()).mul(new BN('2'));
            assert.strictEqual(winnerBalanceAfter.toString(), expectedAmount.toString());
            return assert.strictEqual(loserBalanceAfter.toString(), '0');
        });

        it("Should split the wager between the players in the case of draw", async function () {
            await expect(RPS.joinGame(gameId, paper, {from: player2, value: bet})).to.be.fulfilled;

            await RPS.playGame(secret, paper, {from: player1});

            const winnerBalanceAfter = await RPS.balances(player2);
            const loserBalanceAfter = await RPS.balances(player1);
            expectedAmount = new BN(wager.toString());

            assert.strictEqual(winnerBalanceAfter.toString(), expectedAmount.toString());
            return assert.strictEqual(loserBalanceAfter.toString(), expectedAmount.toString());
        });

        it("Should pay the game fees to the contract owner", async function () {
            const hostBalanceBefore = await RPS.balances(player3);
            assert.strictEqual(hostBalanceBefore.toString(), '1000');
            await expect(RPS.joinGame(gameId, paper, {from: player2, value: bet})).to.be.fulfilled;
            const hostBalanceAfter = await RPS.balances(player3);
            return assert.strictEqual(hostBalanceAfter.toString(), '2000');
        });
    });

    describe('event logic', function () {
        it("Should be possible to verify that a new game has been create", async function () {
            const gameId2 = await RPS.generateGameId(player1, secret, scissors)
            const trx = await RPS.newGame(gameId2, player2, 5000, wager, {from: player1, value: bet});

            const block = await web3.eth.getBlock(trx.receipt.blockNumber);
            const setDeadline = block.timestamp + 5000;

            truffleAssert.eventEmitted(trx, 'LogGameStarted', (ev) => {
                return ev.gameId === gameId2
                    && ev.host === player1
                    && ev.secondPlayer === player2
                    && ev.deadline.toString() === setDeadline.toString()
                    && ev.wager.toString() === '5000'
            });
        });

        it("Should be possible to verify that a player has joined a game", async function () {
            const trx = await RPS.joinGame(gameId, scissors, {from: player2, value: bet});
            const block = await web3.eth.getBlock(trx.receipt.blockNumber);
            const setDeadline = block.timestamp + 600;

            truffleAssert.eventEmitted(trx, 'LogPlayerJoined', (ev) => {
                return ev.gameId === gameId
                    && ev.player === player2
                    && ev.wager.toString() === '5000'
                    && ev.cutoffTime.toString() === setDeadline.toString()
            });
        });

        it("Should be possible to verify that the game fee has been payed", async function () {
            const trx = await RPS.joinGame(gameId, scissors, {from: player2, value: bet});

            truffleAssert.eventEmitted(trx, 'LogFeePaid', (ev) => {
                return ev.gameId === gameId
                    && ev.player === player2
                    && ev.wager.toString() === '5000'
                    && ev.fee.toString() === '1000'
            });
        });

        it("Should be possible to verify the outcome of a game", async function () {
            await expect(RPS.joinGame(gameId, scissors, {from: player2, value: bet})).to.be.fulfilled;
            const trx = await RPS.playGame(secret, paper, {from: player1});

            truffleAssert.eventEmitted(trx, 'LogGameFinished', (ev) => {
                return ev.gameId === gameId
                    && ev.host === player1
                    && ev.player === player2
                    && ev.outcome.toString() === '2'
                    && ev.price.toString() === '10000'
            });
        });

        it("Should be possible to verify a player has withdraw funds", async function () {
            await expect(RPS.joinGame(gameId, scissors, {from: player2, value: bet})).to.be.fulfilled;
            await expect(RPS.playGame(secret, paper, {from: player1})).to.be.fulfilled;
            const trx = await RPS.withdrawFunds(9000, {from: player2});

            truffleAssert.eventEmitted(trx, 'LogBalanceWithdrawn', (ev) => {
                return ev.withdrawAddress === player2
                    && ev.amount.toString() === '9000'
            });
        });

        it("Shoud be possible to verify that a game has been canceled", async function () {
            await timeMachine.advanceTimeAndBlock(5005);
            const trx = await RPS.cancelGame(gameId, {from: player1});

            truffleAssert.eventEmitted(trx, 'LogGameCanceled', (ev) => {
                return ev.gameId === gameId
                    && ev.host === player1
                    && ev.player === player2
            });
        });

        it("Should be possible to verify that the host is a sore loser", async function () {
            await expect(RPS.joinGame(gameId, scissors, {from: player2, value: bet})).to.be.fulfilled;
            await timeMachine.advanceTimeAndBlock(605);
            const trx = await RPS.soreLoser(gameId, {from: player2});

            truffleAssert.eventEmitted(trx, 'LogSoreLoserUnmasked', (ev) => {
                return ev.gameId === gameId
                    && ev.host === player1
                    && ev.player === player2
                    && ev.price.toString() === '10000'
            });
        });
    });

    describe('other logic', function () {

        it("Should allow user to bet their previous winnings", async function () {
            await expect(RPS.joinGame(gameId, scissors, {from: player2, value: bet})).to.be.fulfilled;

            await RPS.playGame(secret, paper, {from: player1});

            const winnerBalanceAfter = await RPS.balances(player2);
            const loserBalanceAfter = await RPS.balances(player1);
            expectedAmount = new BN(wager.toString()).mul(new BN('2'));
            assert.strictEqual(winnerBalanceAfter.toString(), expectedAmount.toString());
            assert.strictEqual(loserBalanceAfter.toString(), '0');

            const gameId2 = await RPS.generateGameId(player2, secret, scissors)
            await expect(RPS.newGame(gameId2, player2, 5000, wager, {from: player1, value: bet})).to.be.fulfilled;
            return expect(RPS.joinGame(gameId2, paper, {from: player2, value: 1000})).to.be.fulfilled;
        });

        it("Should allow the user to host a game with previous winnings", async function () {
            await expect(RPS.joinGame(gameId, scissors, {from: player2, value: bet})).to.be.fulfilled;

            const winnerBalanceBefore = await RPS.balances(player2);
            const loserBalanceBefore = await RPS.balances(player1);

            await RPS.playGame(secret, paper, {from: player1});

            const winnerBalanceAfter = await RPS.balances(player2);
            const loserBalanceAfter = await RPS.balances(player1);
            expectedAmount = new BN(wager.toString()).mul(new BN('2'));
            assert.strictEqual(winnerBalanceAfter.toString(), expectedAmount.toString());
            assert.strictEqual(loserBalanceAfter.toString(), '0');
            const gameId2 = await RPS.generateGameId(player2, secret, scissors)
            return expect(RPS.newGame(gameId2, player1, 5000, wager, {from: player2, value:1000})).to.be.fulfilled;
        });

        it("Should allow user to withdraw their winnings", async function () {
            await expect(RPS.joinGame(gameId, scissors, {from: player2, value: bet})).to.be.fulfilled;
            await RPS.playGame(secret, paper, {from: player1});

            const winnerBalanceAfter = await RPS.balances(player2);
            const loserBalanceAfter = await RPS.balances(player1);
            expectedAmount = new BN(wager.toString()).mul(new BN('2'));
            assert.strictEqual(winnerBalanceAfter.toString(), expectedAmount.toString());
            assert.strictEqual(loserBalanceAfter.toString(), '0');

            const winnerExpectedBalance = toBN(await web3.eth.getBalance(player2)).add(new BN('9000'));

            const trx = await RPS.withdrawFunds(9000, {from: player2});
            const trxTx = await web3.eth.getTransaction(trx.tx);

            const gasUsed = new BN(trx.receipt.gasUsed);
            const gasPrice = new BN(trxTx.gasPrice);
            const gasCost = gasPrice.mul(gasUsed);

            const winnerAccountBalance = toBN(await web3.eth.getBalance(player2)).add(gasCost);
            const winnerGameBalance = await RPS.balances(player2);

            assert.strictEqual(winnerAccountBalance.toString(), winnerExpectedBalance.toString());
            return assert.strictEqual(winnerGameBalance.toString(), '1000');
        });

        it("Should be able to cancel game if player doesnt join before deadline", async function () {
            hostBalance = await RPS.balances(player1);

            await timeMachine.advanceTimeAndBlock(5005);
            await expect(RPS.cancelGame(gameId, {from: player1})).to.be.fulfilled;

            hostBalance = await RPS.balances(player1);
            return assert.strictEqual(hostBalance.toString(), wager.toString());
        });

        it("Should no be possible for the other player to cancel the game", async function () {
            await expect(RPS.joinGame(gameId, scissors, {from: player2, value: bet})).to.be.fulfilled;
            await timeMachine.advanceTimeAndBlock(5005);
            return expect(RPS.cancelGame(gameId, secret, paper, {from: player2})).to.be.rejected;
        });

        it("Should not be able to cancel game if deadline hasnt passed", async function () {
            return expect(RPS.cancelGame(gameId, secret, paper, {from: player1})).to.be.rejected;
        });

        it("Should not be possible to cancel the game if the player has joined", async function () {
            await expect(RPS.joinGame(gameId, scissors, {from: player2, value: bet})).to.be.fulfilled;
            await timeMachine.advanceTimeAndBlock(5005);
            return expect(RPS.cancelGame(gameId, secret, paper, {from: player1})).to.be.rejected;
        });

        it("Should be possible for the 2nd player to finish the game if after 10 mins " +
            "the host hasn't done so", async function () {
            await expect(RPS.joinGame(gameId, scissors, {from: player2, value: bet})).to.be.fulfilled;
            await timeMachine.advanceTimeAndBlock(605);
            return expect(RPS.soreLoser(gameId, {from: player2})).fulfilled;
        });

        it("Should be possible for another player to finish the game by calling " +
            "sore loser if the player wants", async function () {
            await expect(RPS.joinGame(gameId, scissors, {from: player2, value: bet})).to.be.fulfilled;
            await timeMachine.advanceTimeAndBlock(87005);
            return expect(RPS.soreLoser(gameId, {from: player3})).fulfilled;
        });

        it("Should have correct game outcomes", async function () {
            const checks = [
                    { left: rock, right: rock, outcome: draw},
                    { left: rock, right: paper, outcome: playerWin},
                    { left: rock, right: scissors, outcome: hostWin},
                    { left: paper, right: rock, outcome: hostWin},
                    { left: paper, right: paper, outcome: draw},
                    { left: paper, right: scissors, outcome: playerWin},
                    { left: scissors, right: rock, outcome: playerWin},
                    { left: scissors, right: paper, outcome: hostWin},
                    { left: scissors, right: scissors, outcome: draw}
            ].map(setup => expect(
                RPS.runGameLogic(setup.left, setup.right))
                .to.eventually.be.a.bignumber.equal(new BN(setup.outcome)));
            return Promise.all(checks);
        });
    });
});
