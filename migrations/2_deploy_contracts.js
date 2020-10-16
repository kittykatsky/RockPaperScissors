var RPS = artifacts.require("./RockPaperScissors.sol");

require("dotenv").config({path: "./.env"});

module.exports = async function(deployer, network, accounts) {
    await deployer.deploy(RPS, false, 1000, {from: accounts[0]});
};
