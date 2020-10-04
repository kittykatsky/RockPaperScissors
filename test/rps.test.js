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
const timeMachine = require('ganache-time-traveler');

require("dotenv").config({path: "./.env"});

contract('RockPaperScissor', function(accounts) {

    beforeEach('Setup new Remittance before each test', async function () {
        snapshotId = (await timeMachine.takeSnapshot())['result'];
    });

    afterEach(async() => {
        await timeMachine.revertToSnapshot(snapshotId);
    });

    describe('deployment', function () {

    });

    describe('Pausable', function () {

        it("Should be owned by the deployer", async function () {
            return expect(await remittance.getOwner()).to.equal(aliceAccount)
        });

        it("Should not be possible to withdraw when paused", async function () {
            await remittance.pause({from: aliceAccount})
            return expect(remittance.releaseFunds(puzzle, {from: converter})).to.be.rejected;
        });

        it("Should be possible to kill a paused contract", async function () {
            await remittance.pause({from: aliceAccount});
            const tx = await remittance.kill({from: aliceAccount});
            return assert.strictEqual(tx.receipt.status, true);
        });

        it("Should no be possible to run a killed contract", async function () {
            await remittance.pause({from: aliceAccount});
            return expect(remittance.releaseFunds(puzzle, {from: converter})).to.be.rejected;
        });

        it("Should not be possible to unpause a killed contract", async function () {
            await remittance.pause({from: aliceAccount});
            await remittance.kill({from: aliceAccount});
            return expect(remittance.resume({from: aliceAccount})).to.be.rejected;
        });

        it("Should not be possible to empty a live contract", async function () {
            return expect(remittance.emptyAccount(aliceAccount, {from: aliceAccount})).to.be.rejected;
        });

        it("Should be possible to empty a killed contract", async function () {
            await remittance.pause({from: aliceAccount});
            await remittance.kill({from: aliceAccount});
            return expect(remittance.emptyAccount(aliceAccount, {from: aliceAccount})).to.be.fulfilled;
        });
    });

});
