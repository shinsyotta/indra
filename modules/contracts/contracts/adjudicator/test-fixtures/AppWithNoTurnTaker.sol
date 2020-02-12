pragma solidity 0.5.11;
pragma experimental "ABIEncoderV2";

import "../interfaces/CounterfactualApp.sol";


/*
 * App with a counter
 * Only participants[1] is allowed to increment it
 */


contract AppWithNoTurnTaker is CounterfactualApp {

    enum TwoPartyFixedOutcome {
        SEND_TO_ADDR_ONE,
        SEND_TO_ADDR_TWO,
        SPLIT_AND_SEND_TO_BOTH_ADDRS
    }

    enum ActionType { SUBMIT_COUNTER_INCREMENT, ACCEPT_INCREMENT }

    struct State {
        uint256 counter;
    }

    struct Action {
        ActionType actionType;
        uint256 increment;
    }

    function computeOutcome(bytes calldata)
        external
        pure
        returns (bytes memory)
    {
        return abi.encode(TwoPartyFixedOutcome.SEND_TO_ADDR_ONE);
    }

    function applyAction(
        bytes calldata encodedState,
        bytes calldata encodedAction
    )
        external
        pure
        returns (bytes memory ret)
    {
        State memory state = abi.decode(encodedState, (State));
        Action memory action = abi.decode(encodedAction, (Action));

        if (action.actionType == ActionType.SUBMIT_COUNTER_INCREMENT) {
            require(action.increment > 0, "Increment must be nonzero");
            state.counter += action.increment;
        } else if (action.actionType != ActionType.ACCEPT_INCREMENT) {
            revert("Unknown actionType");
        }

        return abi.encode(state);
    }

    function isStateTerminal(bytes calldata encodedState)
        external
        pure
        returns (bool)
    {
        State memory state = abi.decode(encodedState, (State));
        return state.counter > 0;
    }

}