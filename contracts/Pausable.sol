pragma solidity ^0.6.0;

import "./Ownable.sol";

/// @author Kat
/// @title A contract for controlling the flow of another contract 
contract Pausable is Ownable {

    bool private paused;
    bool private dead;

    event LogPaused(address indexed sender, bool indexed state);
    event LogResumed(address indexed sender, bool indexed state);
    event LogKilled(address indexed sender);
    event LogEmptied(address beneficiary, uint amount);

    constructor(bool _paused) public {
        paused = _paused;
    }

    modifier whenRunning() {
        require(!paused, "contract not running");
        _;
    }

    modifier whenPaused() {
        require(paused, "contract not paused");
        _;
    }

    modifier whenAlive() {
        require(!dead, "contract terminated");
        _;
    }

    /// returns state of contract
	/// @dev possible states are Running/Paused
	/// @return returns paused state
	function isPaused() public view returns (bool) {
	    return paused;
	}    

    /// set contract state to paused
    /// @dev emits event containing address of caller and new state
	/// @return true if succesfull
    function pause() public onlyOwner whenRunning returns(bool) {
        paused = true;
        emit LogPaused(msg.sender, paused);

        return true;
    }

    /// set contract state to running
    /// @dev emits event containing address of caller and new state
	/// @return true if succesfull
    function resume() public onlyOwner whenPaused whenAlive returns(bool) {
        paused = false;
        emit LogResumed(msg.sender, paused);

        return true;
    }

    /// permanently turning off the contract
    /// @dev emits event containing address of account that triggered kill
	/// @return true if succesfull
    function kill() public onlyOwner whenPaused whenAlive returns(bool) {
        dead = true;
        emit LogKilled(msg.sender);
        return true;
    }

    /// empty contract of ether
    /// @dev emits event containing address of beneficiary of remaining funds and amount of funds forwarded
	/// @param beneficiary beneficiary of remaining contract funds
	function emptyAccount(address payable beneficiary) public onlyOwner {
        require(dead, "Contract needs to be terminated");
        require(beneficiary != address(0x0), "Incorrect account specified");
        address splitterAddress = address(this);
        emit LogEmptied(beneficiary, splitterAddress.balance);
        (bool success,) = beneficiary.call{value: splitterAddress.balance}("");
        require(success, 'Transfer failed!');
	}
}
