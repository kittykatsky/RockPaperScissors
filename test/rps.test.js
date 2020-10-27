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
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
const expect = chai.expect;
const truffleAssert = require('truffle-assertions');
const RockPaperScissors = artifacts.require('RockPaperScissors');
const timeMachine = require('ganache-time-traveler');

require("dotenv").config({path: "./.env"});

contract('RPS', function(accounts) {

    let RPS, snapshotId;
    const [aliceAccount, bobAccount, carolAccount] = accounts;

    const player1 = bobAccount;
    const player2 = carolAccount;
    const player3 = aliceAccount;
    const secret = fromAscii('hello');
    const secret2 = fromAscii('world');
    const cost = 1000;
    const wager = 5000;
    const bet = 6000;


    beforeEach('Setup new RPS before each test', async function () {
        RPS = await RockPaperScissors.new(false, cost, {from: aliceAccount});
        gameId = await RPS.generateGameId(secret, 2, {from: player1})
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
            const gameId2 = await RPS.generateGameId(secret, 2, {from: player1})
            return expect(RPS.newGame(gameId2, 5000, wager, {from: player1, value: bet})).to.be.rejected;
        });

        it("Should be possible to kill a paused contract", async function () {
            await RPS.pause({from: aliceAccount});
            const tx = await RPS.kill({from: aliceAccount});
            return assert.strictEqual(tx.receipt.status, true);
        });

        it("Should not be possible to run a killed contract", async function () {
            await RPS.pause({from: aliceAccount});
            const gameId2 = await RPS.generateGameId(secret, 2, {from: player1})
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
            return expect(RPS.joinGame(gameId, 2, {from: player2, value: bet})).to.be.fulfilled;
        });

        it("Should not be possible to join a hosted game after the deadline has expired", async function () {
            await timeMachine.advanceTimeAndBlock(5000);
            return expect(RPS.joinGame(gameId, 2, {from: player2, value: bet})).to.be.rejected;
        });

        it("Should not be possible to join a second time", async function () {
            expect(RPS.joinGame(gameId, 2, {from: player2, value: bet})).to.be.fulfilled;
            return expect(RPS.joinGame(gameId, 2, {from: player2, value: bet})).to.be.rejected;
        });

        it("Should not be possible to join a game if not providing a minimum stake", async function () {
            return expect(RPS.joinGame(gameId, 2, {from: player2, value: 4000})).to.be.rejected;
        });

        it("Should not be possible to join if not part of the game", async function () {
            return expect(RPS.joinGame(gameId, 2, {from: player3, value: bet})).to.be.rejected;
        });

        it("Should not be possible to join with a invalid move", async function () {
            return expect(RPS.joinGame(gameId, 0, {from: player3, value: bet})).to.be.rejected;
        });

        it("Should not be possible to lie about your move", async function () {
            expect(RPS.joinGame(gameId, 3, {from: player2, value: bet})).to.be.fulfilled;
            return expect(RPS.playGame(secret, 3, {from: player1})).to.be.rejected;
        });

        it("Should be possible to play the game", async function () {
            expect(RPS.joinGame(gameId, 3, {from: player2, value: bet})).to.be.fulfilled;
            return await RPS.playGame(secret, 2, {from: player1});
        });

        it("Should add the wager to the winners balance", async function () {
            expect(RPS.joinGame(gameId, 3, {from: player2, value: bet})).to.be.fulfilled;
            let winnerBalance = await RPS.balances(player2);
            let loserBalance = await RPS.balances(player1);
            assert.strictEqual(winnerBalance.toString(), '0');
            assert.strictEqual(loserBalance.toString(), '0');

            await RPS.playGame(secret, 2, {from: player1});

            winnerBalance = await RPS.balances(player2);
            loserBalance = await RPS.balances(player1);
            expectedAmount = new BN(wager.toString()).mul(new BN('2'));
            assert.strictEqual(winnerBalance.toString(), expectedAmount.toString());
            return assert.strictEqual(loserBalance.toString(), '0');
        });

        it("Should split the wager between the players in the case of draw", async function () {
            expect(RPS.joinGame(gameId, 2, {from: player2, value: bet})).to.be.fulfilled;
            let winnerBalance = await RPS.balances(player2);
            let loserBalance = await RPS.balances(player1);
            assert.strictEqual(winnerBalance.toString(), '0');
            assert.strictEqual(loserBalance.toString(), '0');

            await RPS.playGame(secret, 2, {from: player1});

            winnerBalance = await RPS.balances(player2);
            loserBalance = await RPS.balances(player1);
            expectedAmount = new BN(wager.toString());

            assert.strictEqual(winnerBalance.toString(), expectedAmount.toString());
            return assert.strictEqual(loserBalance.toString(), expectedAmount.toString());
        });

        it("Should pay the game fees to the contract owner", async function () {
            let hostBalance = await RPS.balances(player3);
            assert.strictEqual(hostBalance.toString(), '1000');
            expect(RPS.joinGame(gameId, 2, {from: player2, value: bet})).to.be.fulfilled;
            hostBalance = await RPS.balances(player3);
            return assert.strictEqual(hostBalance.toString(), '2000');
        });
    });

    describe('event logic', function () {
        it("Should be possible to verify that a new game has been create", async function () {
            const gameId2 = await RPS.generateGameId(secret, 3, {from: player1})
            const trx = await RPS.newGame(gameId2, player2, 5000, wager, {from: player1, value: bet});

            const block = await web3.eth.getBlock(trx.receipt.blockNumber);
            const setDeadline = block.timestamp + 5000;

            truffleAssert.eventEmitted(trx, 'LogNewGame', (ev) => {
                return ev.gameId === gameId2
                    && ev.host === player1
                    && ev.secondPlayer === player2
                    && ev.deadline.toString() === setDeadline.toString()
                    && ev.wager.toString() === '5000'
            });
        });

        it("Should be possible to verify that a player has joined a game", async function () {
            const trx = await RPS.joinGame(gameId, 3, {from: player2, value: bet});
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
            const trx = await RPS.joinGame(gameId, 3, {from: player2, value: bet});

            truffleAssert.eventEmitted(trx, 'LogFeePaid', (ev) => {
                return ev.gameId === gameId
                    && ev.player === player2
                    && ev.wager.toString() === '5000'
                    && ev.fee.toString() === '1000'
            });
        });

        it("Should be possible to verify the outcome of a game", async function () {
            expect(RPS.joinGame(gameId, 3, {from: player2, value: bet})).to.be.fulfilled;
            const trx = await RPS.playGame(secret, 2, {from: player1});

            truffleAssert.eventEmitted(trx, 'LogGameOutcome', (ev) => {
                return ev.gameId === gameId
                    && ev.host === player1
                    && ev.player === player2
                    && ev.outcome.toString() === '2'
                    && ev.price.toString() === '10000'
            });
        });

        it("Should be possible to verify a player has withdraw funds", async function () {
            expect(RPS.joinGame(gameId, 3, {from: player2, value: bet})).to.be.fulfilled;
            expect(RPS.playGame(secret, 2, {from: player1})).to.be.fulfilled;
            const trx = await RPS.withdrawFunds(9000, {from: player2});

            truffleAssert.eventEmitted(trx, 'LogWithdrawEvent', (ev) => {
                return ev.withdrawAddress === player2
                    && ev.amount.toString() === '9000'
            });
        });

        it("Shoud be possible to verify that a game has been canceled", async function () {
            await timeMachine.advanceTimeAndBlock(5005);
            const trx = await RPS.cancelGame(gameId, secret, 2, {from: player1});

            truffleAssert.eventEmitted(trx, 'LogGameCanceled', (ev) => {
                return ev.gameId === gameId
                    && ev.host === player1
                    && ev.player === player2
            });
        });

        it("Should be possible to verify that the host is a sore loser", async function () {
            expect(RPS.joinGame(gameId, 3, {from: player2, value: bet})).to.be.fulfilled;
            await timeMachine.advanceTimeAndBlock(605);
            const trx = await RPS.soreLoser(gameId, player1, {from: player2});

            truffleAssert.eventEmitted(trx, 'LogHostIsASoreLoser', (ev) => {
                return ev.gameId === gameId
                    && ev.host === player1
                    && ev.player === player2
                    && ev.price.toString() === '10000'
            });
        });
    });

    describe('other logic', function () {

        it("Should allow user to bet their previous winnings", async function () {
            expect(RPS.joinGame(gameId, 3, {from: player2, value: bet})).to.be.fulfilled;

            let winnerBalance = await RPS.balances(player2);
            let loserBalance = await RPS.balances(player1);
            assert.strictEqual(winnerBalance.toString(), '0');
            assert.strictEqual(loserBalance.toString(), '0');

            await RPS.playGame(secret, 2, {from: player1});

            winnerBalance = await RPS.balances(player2);
            loserBalance = await RPS.balances(player1);
            expectedAmount = new BN(wager.toString()).mul(new BN('2'));
            assert.strictEqual(winnerBalance.toString(), expectedAmount.toString());
            assert.strictEqual(loserBalance.toString(), '0');

            const gameId2 = await RPS.generateGameId(secret, 3, {from: player2})
            expect(RPS.newGame(gameId2, player2, 5000, wager, {from: player1, value: bet})).to.be.fulfilled;
            return expect(RPS.joinGame(gameId2, 2, {from: player2, value: 1000})).to.be.fulfilled;
        });

        it("Should allow the user to host a game with previous winnings", async function () {
            expect(RPS.joinGame(gameId, 3, {from: player2, value: bet})).to.be.fulfilled;
            let winnerBalance = await RPS.balances(player2);
            let loserBalance = await RPS.balances(player1);
            assert.strictEqual(winnerBalance.toString(), '0');
            assert.strictEqual(loserBalance.toString(), '0');

            await RPS.playGame(secret, 2, {from: player1});

            winnerBalance = await RPS.balances(player2);
            loserBalance = await RPS.balances(player1);
            expectedAmount = new BN(wager.toString()).mul(new BN('2'));
            assert.strictEqual(winnerBalance.toString(), expectedAmount.toString());
            assert.strictEqual(loserBalance.toString(), '0');
            const gameId2 = await RPS.generateGameId(secret, 3, {from: player2})
            return expect(RPS.newGame(gameId2, player1, 5000, wager, {from: player2, value:1000})).to.be.fulfilled;
        });

        it("Should allow user to withdraw their winnings", async function () {
            expect(RPS.joinGame(gameId, 3, {from: player2, value: bet})).to.be.fulfilled;
            let winnerBalance = await RPS.balances(player2);
            let loserBalance = await RPS.balances(player1);
            assert.strictEqual(winnerBalance.toString(), '0');
            assert.strictEqual(loserBalance.toString(), '0');

            await RPS.playGame(secret, 2, {from: player1});

            winnerBalance = await RPS.balances(player2);
            loserBalance = await RPS.balances(player1);
            expectedAmount = new BN(wager.toString()).mul(new BN('2'));
            assert.strictEqual(winnerBalance.toString(), expectedAmount.toString());
            assert.strictEqual(loserBalance.toString(), '0');

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
            assert.strictEqual(hostBalance.toString(), '0');

            await timeMachine.advanceTimeAndBlock(5005);
            expect(RPS.cancelGame(gameId, secret, 2, {from: player1})).to.be.fulfilled;

            hostBalance = await RPS.balances(player1);
            assert.strictEqual(hostBalance.toString(), wager.toString());
        });

        it("Should no be possible for the other player to cancel the game", async function () {
            expect(RPS.joinGame(gameId, 3, {from: player2, value: bet})).to.be.fulfilled;
            await timeMachine.advanceTimeAndBlock(5005);
            expect(RPS.cancelGame(gameId, secret, 2, {from: player2})).to.be.rejected;
        });

        it("Should not be able to cancel game if deadline hasnt passed", async function () {
            expect(RPS.cancelGame(gameId, secret, 2, {from: player1})).to.be.rejected;
        });

        it("Should not be possible to cancel the game if the player has joined", async function () {
            expect(RPS.joinGame(gameId, 3, {from: player2, value: bet})).to.be.fulfilled;
            await timeMachine.advanceTimeAndBlock(5005);
            expect(RPS.cancelGame(gameId, secret, 2, {from: player1})).to.be.rejected;
        });

        it("Should be possible for the 2nd player to finish the game if after 10 mins " +
            "the host hasn't done so", async function () {
            expect(RPS.joinGame(gameId, 3, {from: player2, value: bet})).to.be.fulfilled;
            await timeMachine.advanceTimeAndBlock(605);
            expect(RPS.soreLoser(gameId, player1, {from: player2})).fulfilled;
        });
    });
});
