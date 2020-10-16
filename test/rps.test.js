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

    let RPS, trx, snapshotId;
    const [aliceAccount, bobAccount, carolAccount] = accounts;

    const player1 = bobAccount;
    const player2 = carolAccount;
    const secret = fromAscii('test');
    const cost = 1000;
    const wager = 5000;

    beforeEach('Setup new RPS before each test', async function () {
        RPS = await RockPaperScissors.new(false, cost, {from: aliceAccount});
        gameId = await RPS.generateGameId(secret, 'ROCK', {from: player1})
        trx = await RPS.newGame(gameId, 50, {from: player1, value: wager});
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
            return expect(RPS.newGame(player2, {from: player1, value: wager})).to.be.rejected;
        });

        it("Should be possible to kill a paused contract", async function () {
            await RPS.pause({from: aliceAccount});
            const tx = await RPS.kill({from: aliceAccount});
            return assert.strictEqual(tx.receipt.status, true);
        });

        it("Should no be possible to run a killed contract", async function () {
            await RPS.pause({from: aliceAccount});
            return expect(RPS.playGame(gameId, 'PAPER', {from: player1})).to.be.rejected;
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

        it("Should not be possible to host a game when one is ongoing", async function (done) {
            done(new Error("Write test"));
        });

        it("Should be possible to join a hosted game", async function (done) {
            done(new Error("Write test"));
        });

        it("Should not be possible to join a game if not providing a minimum stake", async function () {
            done(new Error("Write test"));
        });

        it("Should not be possible to join a game in progress", async function (done) {
            done(new Error("Write test"));
        });

        it("Should not be possible to submit a move if not part of the game", async function (done) {
            done(new Error("Write test"));
        });

        it("Should be possible to submit a move", async function (done) {
            done(new Error("Write test"));
        });

        it("Should not be possible to submit a second move", async function (done) {
            done(new Error("Write test"));
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
