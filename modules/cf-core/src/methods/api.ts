import { EventNames } from "@connext/types";

import { handleRejectProposalMessage, handleReceivedProtocolMessage } from "../message-handling";
import { RequestHandler } from "../request-handler";
import RpcRouter from "../rpc-router";

import {
  GetInstalledAppInstancesController,
  GetAppInstanceController,
  GetFreeBalanceStateController,
  GetTokenIndexedFreeBalancesController,
  InstallAppInstanceController,
  ProposeInstallAppInstanceController,
  RejectInstallController,
  TakeActionController,
  UninstallController,
} from "./app-instance";
import {
  GetProposedAppInstancesController,
  GetProposedAppInstanceController,
} from "./proposed-app-instance";
import {
  CreateChannelController,
  GetAllChannelAddressesController,
  GetStateChannelController,
  GetStateDepositHolderAddressController,
} from "./state-channel";

const controllers = [
  /**
   * Stateful / interactive methods
   */
  CreateChannelController,
  InstallAppInstanceController,
  ProposeInstallAppInstanceController,
  RejectInstallController,
  TakeActionController,
  UninstallController,

  /**
   * Constant methods
   */
  GetAllChannelAddressesController,
  GetAppInstanceController,
  GetFreeBalanceStateController,
  GetTokenIndexedFreeBalancesController,
  GetInstalledAppInstancesController,
  GetProposedAppInstanceController,
  GetProposedAppInstancesController,
  GetStateDepositHolderAddressController,
  GetStateChannelController,
];

/**
 * Converts the array of connected controllers into a map of
 * MethodNames to the _executeMethod_ method of a controller.
 *
 * Throws a runtime error when package is imported if multiple
 * controllers overlap (should be caught by compiler anyway).
 */
export const methodNameToImplementation = controllers.reduce((acc, controller) => {
  if (!controller.methodName) {
    return acc;
  }

  if (acc[controller.methodName]) {
    throw new Error(`Fatal: Multiple controllers connected to ${controller.methodName}`);
  }

  const handler = new controller();

  acc[controller.methodName] = handler.executeMethod.bind(handler);

  return acc;
}, {});

export const createRpcRouter = (requestHandler: RequestHandler) =>
  new RpcRouter({ controllers, requestHandler });

export const eventNameToImplementation = {
  [EventNames.PROTOCOL_MESSAGE_EVENT]: handleReceivedProtocolMessage,
  [EventNames.REJECT_INSTALL_EVENT]: handleRejectProposalMessage,
};
