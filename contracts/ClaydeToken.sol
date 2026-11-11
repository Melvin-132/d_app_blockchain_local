// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ClaydeToken is ERC20 {
    constructor() ERC20("Clayde", "CYD") {
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }
}
