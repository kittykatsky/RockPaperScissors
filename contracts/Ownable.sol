pragma solidity ^0.6.0;

/// @author Kat
/// @title A contract for handling Ownership and access restrictions
contract Ownable {

    address private owner;
    event LogOwnershipChange(address indexed newOwner);

    constructor() public {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner is allowd to do this");
        _;
    }

    /// returns owner address
    /// @dev N/A
    function getOwner() public view returns (address) {
        return owner;    
    }

    /// change contract owner
    /// @param newOwner - address of new owner
    /// @dev emits address of new owner 
    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0x0));
        owner = newOwner;
        emit LogOwnershipChange(newOwner);
    }
}
