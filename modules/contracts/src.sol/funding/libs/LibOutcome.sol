// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.4;
pragma experimental "ABIEncoderV2";


library LibOutcome {

    struct CoinTransfer {
        address payable to;
        uint256 amount;
    }

    enum TwoPartyFixedOutcome {
        SEND_TO_ADDR_ONE,
        SEND_TO_ADDR_TWO,
        SPLIT_AND_SEND_TO_BOTH_ADDRS
    }

}
