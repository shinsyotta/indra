// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.4;
pragma experimental ABIEncoderV2;

import "./MultisigData.sol";

/// @title MultisigTransfer - Inherit from this contract
/// for transfers out of the multisig.
/// It does some necessary internal bookkeeping.
contract MultisigTransfer is MultisigData {

    address constant CONVENTION_FOR_ETH_TOKEN_ADDRESS = address(0x0);

    /// @notice Use this function for transfers of assets out of
    /// the multisig. It does some necessary internal bookkeeping.
    /// @param recipient the recipient of the transfer
    /// @param assetId the asset to be transferred; token address for ERC20, 0 for Ether
    /// @param amount the amount to be transferred

    function multisigTransfer(
        address payable recipient,
        address assetId,
        uint256 amount
    ) public {
        // Note, explicitly do NOT use safemath here. See discussion in: TODO
        totalAmountWithdrawn[assetId] += amount;

        if (assetId == CONVENTION_FOR_ETH_TOKEN_ADDRESS) {
            // note: send() is deliberately used instead of transfer() here
            // so that a revert does not stop the rest of the sends
            // solium-disable-next-line security/no-send
            recipient.send(amount);
        } else {
            safeTransfer(assetId, recipient, amount);
        }
    }

    // uses uniswap transfer helper for non-confirming ERC20 tokens
    // https://github.com/Uniswap/uniswap-lib/blob/master/contracts/libraries/TransferHelper.sol
    function safeTransfer(address token, address to, uint value) internal {
        // bytes4(keccak256(bytes('transfer(address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), 'TransferHelper: TRANSFER_FAILED');
    }

}
