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
    const secret = fromAscii('test');
    const cost = 1000;
    const wager = 5000;

    beforeEach('Setup new RPS before each test', async function () {
        RPS = await RockPaperScissors.new(false, cost, {from: aliceAccount});
        gameId = await RPS.generateGameId(secret, 1, {from: player1})
        newGame = await RPS.newGame(gameId, 50, {from: player1, value: wager});
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
            return expect(RPS.newGame(gameId2, 50, {from: player1, value: wager})).to.be.rejected;
        });

        it("Should be possible to kill a paused contract", async function () {
            await RPS.pause({from: aliceAccount});
            const tx = await RPS.kill({from: aliceAccount});
            return assert.strictEqual(tx.receipt.status, true);
        });

        it("Should not be possible to run a killed contract", async function () {
            await RPS.pause({from: aliceAccount});
            const gameId2 = await RPS.generateGameId(secret, 2, {from: player1})
            return expect(RPS.newGame(gameId2, 50, {from: player1, value: wager})).to.be.rejected;
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
            return expect(RPS.newGame(gameId, 50, {from: player1, value: wager})).to.be.rejected;
        });

        it("Should be possible to join a hosted game", async function () {
            return expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
        });

        it("Should not be possible ito join a full game", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            return expect(RPS.joinGame(gameId, {from: aliceAccount, value: wager})).to.be.rejected;
        });

        it("Should not be possible to join a game if not providing a minimum stake", async function () {
            return expect(RPS.joinGame(gameId, {from: player2, value: 4000})).to.be.rejected;
        });

        it("Should not be possible to join a game in progress", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            return expect(RPS.joinGame(gameId, 50, {from: player2})).to.be.rejected;
        });

        it("Should not be possible to submit a move if not part of the game", async function () {
            return expect(RPS.submitMove(gameId, 2, {from: player2, value: wager})).to.be.rejected;
        });

        it("Should be possible to submit a move", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            return expect(RPS.submitMove(gameId, 2, {from: player2})).to.be.fulfilled;
        });

        it("Should not be possible to submit a second move", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            expect(RPS.submitMove(gameId, 2, {from: player2})).to.be.fulfilled;
            return expect(RPS.submitMove(gameId, 3, {from: player2})).to.be.rejected;
        });
    });

    describe('event logic', function () {
        it("Should be possible to verify that a new game has been create", async function () {
            const gameId2 = await RPS.generateGameId(secret, 2, {from: player1})
            const trx = await RPS.newGame(gameId2, 50, {from: player1, value: wager});

            truffleAssert.eventEmitted(trx, 'LogNewGame', (ev) => {
                return ev.gameId === gameId2 && ev.host === player1 && ev.wager.toString() === '5000'
            });
        });

        it("Should be possible to verify that a player has joined a game", async function () {
            const trx = await RPS.joinGame(gameId, {from: player2, value: wager});

            truffleAssert.eventEmitted(trx, 'LogPlayerJoined', (ev) => {
                return ev.gameId === gameId && ev.player === player2 && ev.wager.toString() === '4000'
            });
        });

        it("Should be possible to verify that the game fee has been payed", async function () {
            const trx = await RPS.joinGame(gameId, {from: player2, value: wager});

            truffleAssert.eventEmitted(trx, 'LogFeePaid', (ev) => {
                return ev.gameId === gameId && ev.player === player2 && ev.wager.toString() === '4000' && ev.fee.toString() === '1000'
            });
        });

        it("Should be possible to verify that a player has sumbitted a move", async function () {
            await RPS.joinGame(gameId, {from: player2, value: wager});
            const trx = await RPS.submitMove(gameId, 2, {from: player2});

            truffleAssert.eventEmitted(trx, 'LogPlayerMoved', (ev) => {
                return ev.gameId === gameId && ev.player === player2
            });
        });
    });

    describe('Game logic', function () {
        it("Should time out and return funds to host if player 2" +
            "doesnt make a move before a given amount of time", async function (done) {
            done(new Error("Write test"));
        });

        it("Should add the total amount (minus fees) to the winner", async function (done) {
            done(new Error("Write test"));
        });

        it("Should allow user to be their previous winnings", async function (done) {
            done(new Error("Write test"));
        });
    });
});
