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
    const secret = fromAscii('hello');
    const secret2 = fromAscii('world');
    const cost = 1000;
    const wager = 5000;

    beforeEach('Setup new RPS before each test', async function () {
        RPS = await RockPaperScissors.new(false, cost, {from: aliceAccount});
        gameId = await RPS.generateGameId(secret, 1, {from: player1})
        newGame = await RPS.newGame(gameId, 5000, wager, {from: player1, value: wager});
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
            return expect(RPS.newGame(gameId2, 5000, wager, {from: player1, value: wager})).to.be.rejected;
        });

        it("Should be possible to kill a paused contract", async function () {
            await RPS.pause({from: aliceAccount});
            const tx = await RPS.kill({from: aliceAccount});
            return assert.strictEqual(tx.receipt.status, true);
        });

        it("Should not be possible to run a killed contract", async function () {
            await RPS.pause({from: aliceAccount});
            const gameId2 = await RPS.generateGameId(secret, 2, {from: player1})
            return expect(RPS.newGame(gameId2, 5000, wager, {from: player1, value: wager})).to.be.rejected;
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
            return expect(RPS.newGame(gameId, 5000, wager, {from: player1, value: wager})).to.be.rejected;
        });

        it("Should be possible to join a hosted game", async function () {
            return expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
        });

        it("Should not be possible to join a hosted game after the deadline has expired", async function () {
            await timeMachine.advanceTimeAndBlock(5000);
            return expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.rejected;
        });

        it("Should not be possible to join a full game", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            return expect(RPS.joinGame(gameId, {from: aliceAccount, value: wager})).to.be.rejected;
        });

        it("Should not be possible to join a game if not providing a minimum stake", async function () {
            return expect(RPS.joinGame(gameId, {from: player2, value: 4000})).to.be.rejected;
        });

        it("Should not be possible to join a game in progress", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            return expect(RPS.joinGame(gameId, 5000, {from: player2})).to.be.rejected;
        });

        it("Should not be possible to submit a move if not part of the game", async function () {
            const playerSecretMove = await RPS.generateGameId(secret2, 2, {from: player2})
            return expect(RPS.submitMove(gameId, playerSecretMove, {from: player2, value: wager})).to.be.rejected;
        });

        it("Should be possible to submit a move", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            const playerSecretMove = await RPS.generateGameId(secret2, 2, {from: player2})
            return expect(RPS.submitMove(gameId, playerSecretMove, {from: player2})).to.be.fulfilled;
        });

        it("Shouldi not be possible to submit a move after the deadline has expired", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            await timeMachine.advanceTimeAndBlock(5000);

            const playerSecretMove = await RPS.generateGameId(secret2, 2, {from: player2})
            return expect(RPS.submitMove(gameId, playerSecretMove, {from: player2})).to.be.rejected;
        });

        it("Should not be possible to submit a invalid move", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            return expect(RPS.generateGameId(secret2, 0, {from: player2})).to.be.rejected;
        });

        it("Should not be possible to submit a second move", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            const playerSecretMove = await RPS.generateGameId(secret2, 2, {from: player2})
            const playerSecretMove2 = await RPS.generateGameId(secret2, 3, {from: player2})
            expect(RPS.submitMove(gameId, playerSecretMove, {from: player2})).to.be.fulfilled;
            return expect(RPS.submitMove(gameId, playerSecretMove2, {from: player2})).to.be.rejected;
        });

        it("Should not be possible to reveal your move before both moves have been submitted", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            expect(RPS.revealMove(gameId, secret, 1, {from: player1})).to.be.rejected;
        });

        it("Should be possible to reveal your move", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            const playerSecretMove = await RPS.generateGameId(secret2, 2, {from: player2})
            expect(RPS.submitMove(gameId, playerSecretMove, {from: player2})).to.be.fulfilled;
            expect(RPS.revealMove(gameId, secret, 1, {from: player1})).to.be.fulfilled;
            return expect(RPS.revealMove(gameId, secret2, 2, {from: player2})).to.be.fulfilled;
        });

        it("Should not be possible to lie about your move", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            const playerSecretMove = await RPS.generateGameId(secret2, 2, {from: player2});
            expect(RPS.submitMove(gameId, playerSecretMove, {from: player2})).to.be.fulfilled;
            return expect(RPS.revealMove(gameId, secret, 3, {from: player1})).to.be.rejected;
        });

        it("Should not be possible for the other player to reveal their move " +
            "5 minutes after the inital move was revealed", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            const playerSecretMove = await RPS.generateGameId(secret2, 2, {from: player2})
            expect(RPS.submitMove(gameId, playerSecretMove, {from: player2})).to.be.fulfilled;
            expect(RPS.revealMove(gameId, secret, 1, {from: player1})).to.be.fulfilled;
            await timeMachine.advanceTimeAndBlock(500);
            return expect(RPS.revealMove(gameId, secret2, 2, {from: player2})).to.be.rejected;
        });


        it("Should be possible to play the game", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            const playerSecretMove = await RPS.generateGameId(secret2, 2, {from: player2})
            expect(RPS.submitMove(gameId, playerSecretMove, {from: player2})).to.be.fulfilled;
            expect(RPS.revealMove(gameId, secret, 1, {from: player1})).to.be.fulfilled;
            return expect(RPS.revealMove(gameId, secret2, 2, {from: player2})).to.be.fulfilled;
        });

        it("Should give add the wager to the winners balance", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            const playerSecretMove = await RPS.generateGameId(secret2, 2, {from: player2})
            let winnerBalance = await RPS.balances(player2);
            let loserBalance = await RPS.balances(player1);
            assert.strictEqual(winnerBalance.toString(), '0');
            assert.strictEqual(loserBalance.toString(), '0');
            expect(RPS.submitMove(gameId, playerSecretMove, {from: player2})).to.be.fulfilled;
            expect(RPS.revealMove(gameId, secret, 1, {from: player1})).to.be.fulfilled;
            expect(RPS.revealMove(gameId, secret2, 2, {from: player2})).to.be.fulfilled;

            await timeMachine.advanceTimeAndBlock(500);
            await RPS.playGame(gameId);

            winnerBalance = await RPS.balances(player2);
            loserBalance = await RPS.balances(player1);
            expectedAmount = new BN(wager.toString()).mul(new BN('2')).sub(new BN(cost.toString()));
            assert.strictEqual(winnerBalance.toString(), expectedAmount.toString());
            return assert.strictEqual(loserBalance.toString(), '0');
        });

        it("Should split the wager between the players in the case of draw", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            const playerSecretMove = await RPS.generateGameId(secret2, 1, {from: player2})
            let winnerBalance = await RPS.balances(player2);
            let loserBalance = await RPS.balances(player1);
            assert.strictEqual(winnerBalance.toString(), '0');
            assert.strictEqual(loserBalance.toString(), '0');
            expect(RPS.submitMove(gameId, playerSecretMove, {from: player2})).to.be.fulfilled;
            expect(RPS.revealMove(gameId, secret, 1, {from: player1})).to.be.fulfilled;
            expect(RPS.revealMove(gameId, secret2, 1, {from: player2})).to.be.fulfilled;

            await timeMachine.advanceTimeAndBlock(500);
            await RPS.playGame(gameId);

            winnerBalance = await RPS.balances(player2);
            loserBalance = await RPS.balances(player1);
            expectedAmount = new BN(wager.toString()).sub(new BN(cost.toString()).div(new BN('2')));
            assert.strictEqual(winnerBalance.toString(), expectedAmount.toString());
            return assert.strictEqual(loserBalance.toString(), expectedAmount.toString());
        });

        it("Should give the wager to the player who submitted the move in the " +
            "case of a forfeit (other player didnt sumbit move in time)", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            const playerSecretMove = await RPS.generateGameId(secret2, 2, {from: player2})
            let winnerBalance = await RPS.balances(player2);
            let loserBalance = await RPS.balances(player1);
            assert.strictEqual(winnerBalance.toString(), '0');
            assert.strictEqual(loserBalance.toString(), '0');
            expect(RPS.submitMove(gameId, playerSecretMove, {from: player2})).to.be.fulfilled;
            expect(RPS.revealMove(gameId, secret2, 2, {from: player2})).to.be.fulfilled;

            await timeMachine.advanceTimeAndBlock(500);
            await RPS.playGame(gameId);

            winnerBalance = await RPS.balances(player2);
            loserBalance = await RPS.balances(player1);
            expectedAmount = new BN(wager.toString()).mul(new BN('2')).sub(new BN(cost.toString()));
            assert.strictEqual(winnerBalance.toString(), expectedAmount.toString());
            return assert.strictEqual(loserBalance.toString(), '0');
        });

    });

    describe('event logic', function () {
        it("Should be possible to verify that a new game has been create", async function () {
            const gameId2 = await RPS.generateGameId(secret, 2, {from: player1})
            const trx = await RPS.newGame(gameId2, 5000, wager, {from: player1, value: wager});

            truffleAssert.eventEmitted(trx, 'LogNewGame', (ev) => {
                return ev.gameId === gameId2 && ev.host === player1 && ev.wager.toString() === '5000'
            });
        });

        it("Should be possible to verify that a player has joined a game", async function () {
            const trx = await RPS.joinGame(gameId, {from: player2, value: wager});

            truffleAssert.eventEmitted(trx, 'LogPlayerJoined', (ev) => {
                return ev.gameId === gameId && ev.player === player2 && ev.wager.toString() === '5000'
            });
        });

        it("Should be possible to verify that the game fee has been payed", async function () {
            const trx = await RPS.joinGame(gameId, {from: player2, value: wager});

            truffleAssert.eventEmitted(trx, 'LogFeePaid', (ev) => {
                return ev.gameId === gameId
                    && ev.player === player2
                    && ev.wager.toString() === '5000'
                    && ev.fee.toString() === '1000'
            });
        });

        it("Should be possible to verify that a player has sumbitted a move", async function () {
            await RPS.joinGame(gameId, {from: player2, value: wager});
            const playerSecretMove = await RPS.generateGameId(secret2, 2, {from: player2})
            const trx = await RPS.submitMove(gameId, playerSecretMove, {from: player2});

            truffleAssert.eventEmitted(trx, 'LogPlayerMoved', (ev) => {
                return ev.gameId === gameId && ev.player === player2
            });
        });

        it("Should be possible to verify the outcome of a game", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            const playerSecretMove = await RPS.generateGameId(secret2, 2, {from: player2})
            await RPS.submitMove(gameId, playerSecretMove, {from: player2});
            await RPS.revealMove(gameId, secret2, 2, {from: player2});

            await timeMachine.advanceTimeAndBlock(500);
            const trx = await RPS.playGame(gameId);

            truffleAssert.eventEmitted(trx, 'LogGameOutcome', (ev) => {
                return ev.gameId === gameId
                    && ev.host === player1
                    && ev.player === player2
                    && ev.outcome.toString() === '2'
                    && ev.price.toString() === '9000'
            });
        });
    });

    describe('other logic', function () {

        it("Should allow user to bet their previous winnings", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            const playerSecretMove = await RPS.generateGameId(secret2, 2, {from: player2})

            let winnerBalance = await RPS.balances(player2);
            let loserBalance = await RPS.balances(player1);
            assert.strictEqual(winnerBalance.toString(), '0');
            assert.strictEqual(loserBalance.toString(), '0');

            expect(RPS.submitMove(gameId, playerSecretMove, {from: player2})).to.be.fulfilled;
            expect(RPS.revealMove(gameId, secret, 1, {from: player1})).to.be.fulfilled;
            expect(RPS.revealMove(gameId, secret2, 2, {from: player2})).to.be.fulfilled;

            await timeMachine.advanceTimeAndBlock(500);
            await RPS.playGame(gameId);

            winnerBalance = await RPS.balances(player2);
            loserBalance = await RPS.balances(player1);
            expectedAmount = new BN(wager.toString()).mul(new BN('2')).sub(new BN(cost.toString()));
            assert.strictEqual(winnerBalance.toString(), expectedAmount.toString());
            assert.strictEqual(loserBalance.toString(), '0');
            const gameId2 = await RPS.generateGameId(secret, 3, {from: player2})
            expect(RPS.newGame(gameId2, 5000, wager, {from: player1, value: wager})).to.be.fulfilled;
            return expect(RPS.joinGame(gameId2, {from: player2})).to.be.fulfilled;
        });

        it("Should allow the user to host a game with previous winnings", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            const playerSecretMove = await RPS.generateGameId(secret2, 2, {from: player2})
            let winnerBalance = await RPS.balances(player2);
            let loserBalance = await RPS.balances(player1);
            assert.strictEqual(winnerBalance.toString(), '0');
            assert.strictEqual(loserBalance.toString(), '0');
            expect(RPS.submitMove(gameId, playerSecretMove, {from: player2})).to.be.fulfilled;
            expect(RPS.revealMove(gameId, secret, 1, {from: player1})).to.be.fulfilled;
            expect(RPS.revealMove(gameId, secret2, 2, {from: player2})).to.be.fulfilled;

            await timeMachine.advanceTimeAndBlock(500);
            await RPS.playGame(gameId);

            winnerBalance = await RPS.balances(player2);
            loserBalance = await RPS.balances(player1);
            expectedAmount = new BN(wager.toString()).mul(new BN('2')).sub(new BN(cost.toString()));
            assert.strictEqual(winnerBalance.toString(), expectedAmount.toString());
            assert.strictEqual(loserBalance.toString(), '0');
            const gameId2 = await RPS.generateGameId(secret, 3, {from: player2})
            return expect(RPS.newGame(gameId2, 5000, wager, {from: player2})).to.be.fulfilled;
        });

        it("Should allow user to withdraw their winnings", async function () {
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            const playerSecretMove = await RPS.generateGameId(secret2, 2, {from: player2})
            let winnerBalance = await RPS.balances(player2);
            let loserBalance = await RPS.balances(player1);
            assert.strictEqual(winnerBalance.toString(), '0');
            assert.strictEqual(loserBalance.toString(), '0');
            expect(RPS.submitMove(gameId, playerSecretMove, {from: player2})).to.be.fulfilled;
            expect(RPS.revealMove(gameId, secret, 1, {from: player1})).to.be.fulfilled;
            expect(RPS.revealMove(gameId, secret2, 2, {from: player2})).to.be.fulfilled;

            await timeMachine.advanceTimeAndBlock(500);
            await RPS.playGame(gameId);

            winnerBalance = await RPS.balances(player2);
            loserBalance = await RPS.balances(player1);
            expectedAmount = new BN(wager.toString()).mul(new BN('2')).sub(new BN(cost.toString()));
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
            return assert.strictEqual(winnerGameBalance.toString(), '0');
        });

        it("Should be able to cancel game if player doesnt join before deadline", async function () {
            hostBalance = await RPS.balances(player1);
            assert.strictEqual(hostBalance.toString(), '0');

            expect(RPS.revealMove(gameId, secret, 1, {from: player1})).to.be.rejected;
            await timeMachine.advanceTimeAndBlock(5005);
            expect(RPS.cancelGame(gameId, {from: player1})).to.be.fulfilled;

            hostBalance = await RPS.balances(player1);
            assert.strictEqual(hostBalance.toString(), wager.toString());
        });

        it("Should be able to cancel game if player doesnt submit move before deadline", async function () {
            hostBalance = await RPS.balances(player1);
            playerBalance = await RPS.balances(player2);
            assert.strictEqual(hostBalance.toString(), '0');
            assert.strictEqual(playerBalance.toString(), '0');
            expect(RPS.joinGame(gameId, {from: player2, value: wager})).to.be.fulfilled;
            await timeMachine.advanceTimeAndBlock(5005);
            expect(RPS.cancelGame(gameId, {from: player1})).to.be.fulfilled;

            hostBalance = await RPS.balances(player1);
            playerBalance = await RPS.balances(player2);

            expectedAmount = new BN(wager.toString()).sub(new BN(cost.toString()).div(new BN('2')));

            assert.strictEqual(hostBalance.toString(), expectedAmount.toString());
            return assert.strictEqual(playerBalance.toString(), expectedAmount.toString());
        });

        it("Should not be able to cancel game if deadline hasnt passed", async function () {
            expect(RPS.revealMove(gameId, secret, 1, {from: player1})).to.be.rejected;
            expect(RPS.cancelGame(gameId, {from: player1})).to.be.rejected;
        });
    });
});
