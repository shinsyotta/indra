import { Zero } from "ethers/constants";
import { BigNumber } from "ethers/utils";
import { jsonRpcMethod } from "rpc-server";

import { CONVENTION_FOR_ETH_TOKEN_ADDRESS } from "../../../constants";
import { Protocol, xkeyKthAddress } from "../../../machine";
import { StateChannel } from "../../../models";
import { RequestHandler } from "../../../request-handler";
import { Node } from "../../../types";
import { NodeController } from "../../controller";
import {
  INSUFFICIENT_FUNDS_IN_FREE_BALANCE_FOR_ASSET,
  NULL_INITIAL_STATE_FOR_PROPOSAL
} from "../../errors";

/**
 * This creates an entry of a proposed AppInstance while sending the proposal
 * to the peer with whom this AppInstance is specified to be installed.
 *
 * @returns The AppInstanceId for the proposed AppInstance
 */
export default class ProposeInstallController extends NodeController {
  @jsonRpcMethod(Node.RpcMethodName.PROPOSE_INSTALL)
  public executeMethod: (
    requestHandler: RequestHandler,
    params: Node.MethodParams,
  ) => Promise<Node.MethodResult> = super.executeMethod;

  protected async getRequiredLockNames(
    requestHandler: RequestHandler,
    params: Node.ProposeInstallParams,
  ): Promise<string[]> {
    const { networkContext, publicIdentifier, store } = requestHandler;
    const { proposedToIdentifier } = params;

    // TODO: no way to determine if this is a virtual or regular app being
    // proposed. because it may be a virtual app, and the function defaults
    // to pulling from the store, assume it is okay to use a generated
    // multisig
    const multisigAddress = await store.getMultisigAddressWithCounterparty(
      [publicIdentifier, proposedToIdentifier],
      networkContext.ProxyFactory,
      networkContext.MinimumViableMultisig,
      networkContext.provider
    );

    return [multisigAddress];
  }

  protected async beforeExecution(
    requestHandler: RequestHandler,
    params: Node.ProposeInstallParams,
  ): Promise<void> {
    const { networkContext, publicIdentifier, store } = requestHandler;
    const { initialState } = params;

    if (!initialState) {
      throw Error(NULL_INITIAL_STATE_FOR_PROPOSAL);
    }

    const {
      proposedToIdentifier,
      initiatorDeposit,
      responderDeposit,
      initiatorDepositTokenAddress: initiatorDepositTokenAddressParam,
      responderDepositTokenAddress: responderDepositTokenAddressParam,
    } = params;

    const myIdentifier = publicIdentifier;

    // TODO: no way to determine if this is a virtual or regular app being
    // proposed. because it may be a virtual app, and the function defaults
    // to pulling from the store, assume it is okay to use a generated
    // multisig
    const multisigAddress = await store.getMultisigAddressWithCounterparty(
      [publicIdentifier, proposedToIdentifier],
      networkContext.ProxyFactory,
      networkContext.MinimumViableMultisig,
      networkContext.provider
    );

    const initiatorDepositTokenAddress =
      initiatorDepositTokenAddressParam || CONVENTION_FOR_ETH_TOKEN_ADDRESS;

    const responderDepositTokenAddress =
      responderDepositTokenAddressParam || CONVENTION_FOR_ETH_TOKEN_ADDRESS;

    const stateChannel = await store.getOrCreateStateChannelBetweenVirtualAppParticipants(
      multisigAddress,
      networkContext.ProxyFactory,
      myIdentifier,
      proposedToIdentifier,
    );

    assertSufficientFundsWithinFreeBalance(
      stateChannel,
      myIdentifier,
      initiatorDepositTokenAddress,
      initiatorDeposit,
    );

    assertSufficientFundsWithinFreeBalance(
      stateChannel,
      proposedToIdentifier,
      responderDepositTokenAddress,
      responderDeposit,
    );

    params.initiatorDepositTokenAddress = initiatorDepositTokenAddress;
    params.responderDepositTokenAddress = responderDepositTokenAddress;
  }

  protected async executeMethodImplementation(
    requestHandler: RequestHandler,
    params: Node.ProposeInstallParams,
  ): Promise<Node.ProposeInstallResult> {
    const {
      networkContext,
      protocolRunner,
      publicIdentifier,
      store
    } = requestHandler;

    const { proposedToIdentifier } = params;

    // TODO: no way to determine if this is a virtual or regular app being
    // proposed. because it may be a virtual app, and the function defaults
    // to pulling from the store, assume it is okay to use a generated
    // multisig
    const multisigAddress = await store.getMultisigAddressWithCounterparty(
      [publicIdentifier, proposedToIdentifier],
      networkContext.ProxyFactory,
      networkContext.MinimumViableMultisig,
      networkContext.provider
    );

    await protocolRunner.initiateProtocol(
      Protocol.Propose,
      await store.getStateChannelsMap(),
      {
        ...params,
        multisigAddress,
        initiatorXpub: publicIdentifier,
        responderXpub: proposedToIdentifier
      }
    );

    return {
      appInstanceId: (
        await store.getStateChannel(multisigAddress)
      ).mostRecentlyProposedAppInstance().identityHash,
    };
  }
}

function assertSufficientFundsWithinFreeBalance(
  channel: StateChannel,
  publicIdentifier: string,
  tokenAddress: string,
  depositAmount: BigNumber,
): void {
  if (!channel.hasFreeBalance) return;

  const freeBalanceForToken =
    channel.getFreeBalanceClass().getBalance(tokenAddress, xkeyKthAddress(publicIdentifier, 0)) ||
    Zero;

  if (freeBalanceForToken.lt(depositAmount)) {
    throw Error(
      INSUFFICIENT_FUNDS_IN_FREE_BALANCE_FOR_ASSET(
        publicIdentifier,
        channel.multisigAddress,
        tokenAddress,
        freeBalanceForToken,
        depositAmount,
      ),
    );
  }
}
