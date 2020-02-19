pragma solidity 0.5.11;
pragma experimental "ABIEncoderV2";

import "../libs/LibStateChannelApp.sol";
import "../libs/LibAppCaller.sol";
import "./MChallengeRegistryCore.sol";


contract MixinSetStateWithAction is LibStateChannelApp, LibAppCaller, MChallengeRegistryCore {

    /// @notice Create a challenge regarding the latest signed state and immediately after,
    /// performs a unilateral action to update it.
    /// @param appIdentity An AppIdentity pointing to the app having its challenge progressed
    /// @param req A struct with the signed state update in it
    /// @param action A struct with the signed action being taken
    /// @dev Note this function is only callable when the state channel is not in challenge
    function setStateWithAction(
        AppIdentity memory appIdentity,
        SignedAppChallengeUpdateWithAppState memory req,
        SignedAction memory action
    )
        public
    {
        bytes32 identityHash = appIdentityToHash(appIdentity);

        AppChallenge storage challenge = appChallenges[identityHash];

        require(
            correctKeysSignedAppChallengeUpdate(identityHash, appIdentity.participants, req),
            "Call to setStateWithAction included incorrectly signed state update"
        );

        // enforce that the challenge is either non existent or ready
        // to be reset, allows the same app to be challenged multiple
        // times in the case of long-lived applications
        require(
            challenge.status == ChallengeStatus.NO_CHALLENGE || challenge.status == ChallengeStatus.OUTCOME_SET
            "setStateWithAction was called on an app that already has an active challenge"
        );

        // will just enforce the req.versionNumber is gte zero
        // (can dispute the initial state) or whatever the state after
        // a dispute completes can be re-disputed
        require(
            req.versionNumber >= challenge.versionNumber,
            "setStateWithAction was called with outdated state"
        );

        require(
            correctKeySignedTheAction(
                appIdentity.appDefinition,
                appIdentity.participants,
                req,
                action
            ),
            "setStateWithAction called with action signed by incorrect turn taker"
        );

        require(req.timeout > 0, "Timeout must be greater than 0");

        bytes memory newState = LibAppCaller.applyAction(
            appIdentity.appDefinition,
            req.appState,
            action.encodedAction
        );


        // do not apply the timeout of the challenge update
        // to the resultant state, instead use the default timeout.
        // Doing otherwise could violate the signers intention. For
        // example:
        // Signer may be fine signing a very small timeout for a state considered
        // favorable. ("I made the last move in this state, so I'll win if it gets
        // finalized!"). Then counterparty applies an action to it, and now signer
        // has very little time to react to this potentially unfavorable state.
        // ("Now they made the last move and will win!")

        // instead use the default timeout.
        uint256 finalizesAt = block.number + appIdentity.defaultTimeout;
        require(finalizesAt >= appIdentity.defaultTimeout, "uint248 addition overflow");

        challenge.finalizesAt = finalizesAt;
        challenge.status = ChallengeStatus.FINALIZES_AFTER_DEADLINE;
        challenge.appStateHash = keccak256(newState);
        challenge.versionNumber = req.versionNumber;
        challenge.challengeCounter += 1;
        challenge.latestSubmitter = msg.sender;
    }

    function correctKeysSignedAppChallengeUpdate(
        bytes32 identityHash,
        address[] memory participants,
        SignedAppChallengeUpdateWithAppState memory req
    )
        private
        pure
        returns (bool)
    {
        bytes32 digest = computeAppChallengeHash(
            identityHash,
            keccak256(req.appState),
            req.versionNumber,
            req.timeout
        );
        return verifySignatures(req.signatures, digest, participants);
    }

    function correctKeySignedTheAction(
        address appDefinition,
        address[] memory participants,
        SignedAppChallengeUpdateWithAppState memory req,
        SignedAction memory action
    )
        private
        pure
        returns (bool)
    {
        address turnTaker = LibAppCaller.getTurnTaker(
            appDefinition,
            participants,
            req.appState
        );

        address signer = computeActionHash(
            turnTaker,
            keccak256(req.appState),
            action.encodedAction,
            req.versionNumber
        ).recover(action.signature);

        return turnTaker == signer;
    }

}
