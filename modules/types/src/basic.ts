import { BigNumber as ethersBN, BigNumberish, Interface, ParamType } from "ethers/utils";

export { Contract } from "ethers";
export { BaseProvider, JsonRpcProvider, TransactionReceipt, TransactionResponse } from "ethers/providers";
export { BigNumberish, Network, Transaction } from "ethers/utils";

export type BigNumber = ethersBN;
export const BigNumber = ethersBN;

export type ABIEncoding = string;
export type Address = string;

export interface EthSignature {
  r: string;
  s: string;
  v: string;
}

// This is copied from the ethers definition of how an ABI is typed.
export type ContractABI = Array<string | ParamType> | string | Interface;

export type SolidityPrimitiveType = string | BigNumberish | boolean;

type SolidityABIEncoderV2Struct = {
  [x: string]: SolidityValueType;
};

// Ideally this should be a `type` not an `interface` but self-referencial
// types is not supported: github.com/Microsoft/TypeScript/issues/6230
interface SolidityABIEncoderV2SArray extends Array<SolidityValueType> {}

// The application-specific state of an app instance, to be interpreted by the
// app developer. We just treat it as an opaque blob; however since we pass this
// around in protocol messages and include this in transaction data in challenges,
// we impose some restrictions on the type; they must be serializable both as
// JSON and as solidity structs.
export type SolidityValueType = SolidityPrimitiveType | SolidityABIEncoderV2Struct | SolidityABIEncoderV2SArray;

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
