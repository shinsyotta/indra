import { BigNumber, bigNumberify, parseEther, formatEther } from "ethers/utils";
import { Zero, MaxUint256 } from "ethers/constants";

export const isBN = BigNumber.isBigNumber;

export const toBN = (n: any) => bigNumberify(n.toString());

export const toWei = (n: any) => parseEther(n.toString());

export const fromWei = formatEther;

export const weiToToken = (wei: any, tokenPerEth: any) =>
  toBN(formatEther(toWei(tokenPerEth).mul(wei)).replace(/\.[0-9]*$/, ``));

export const tokenToWei = (token: any, tokenPerEth: any) => toWei(token).div(toWei(tokenPerEth));

export const maxBN = (lobn: any) =>
  lobn.reduce((max: any, current: any) => (max.gt(current) ? max : current), Zero);

export const minBN = (lobn: any) =>
  lobn.reduce((min: any, current: any) => (min.lt(current) ? min : current), MaxUint256);

export const inverse = (bn: any) => formatEther(toWei(toWei(`1`)).div(toWei(bn)));

export const calculateExchange = (amount: BigNumber, swapRate: string): BigNumber => {
  const [integer, fractional] = swapRate.split(".");
  const safeSwapRate = [integer, fractional.substring(0, 18)].join(".");
  return bigNumberify(formatEther(amount.mul(parseEther(safeSwapRate))).replace(/\.[0-9]*$/, ""));
};
