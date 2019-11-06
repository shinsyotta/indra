import { Node as CFCoreTypes } from "@counterfactual/types";
import { BigNumber } from "ethers/utils";

import { AppState } from "./app";
import { Address } from "./basic";

////////////////////////////////////
////// CHANNEL TYPES

// used to verify channel is in sequence
export type ChannelAppSequences = {
  userSequenceNumber: number;
  nodeSequenceNumber: number;
};

// payment setups
export type PaymentProfile<T = string> = {
  assetId: string;
  minimumMaintainedCollateral: T;
  amountToCollateralize: T;
};
export type PaymentProfileBigNumber = PaymentProfile<BigNumber>;

// asset types
export interface AssetAmount<T = string> {
  amount: T;
  assetId: Address; // empty address if eth
}
export type AssetAmountBigNumber = AssetAmount<BigNumber>;

export type CFCoreChannel = {
  id: number;
  nodePublicIdentifier: string;
  userPublicIdentifier: string;
  multisigAddress: string;
  available: boolean;
};

export type ChannelState<T = string> = {
  apps: AppState<T>[];
  // TODO: CF types should all be generic, this will be
  // a BigNumber
  freeBalance: CFCoreTypes.GetFreeBalanceStateResult;
};
export type ChannelStateBigNumber = ChannelState<BigNumber>;

export type TransferAction = {
  finalize: boolean;
  transferAmount: BigNumber;
};

