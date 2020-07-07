import { MessagingService } from "@connext/messaging";
import { AllowedSwap, PriceOracleTypes, SwapRate } from "@connext/types";
import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { getMarketDetails, getTokenReserves } from "@uniswap/sdk";
import { constants, utils, providers } from "ethers";

import { ConfigService } from "../config/config.service";
import { LoggerService } from "../logger/logger.service";
import { MessagingProviderId } from "../constants";

const { AddressZero } = constants;
const { parseEther } = utils;

@Injectable()
export class SwapRateService implements OnModuleInit {
  private latestSwapRates: SwapRate[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly log: LoggerService,
    @Inject(MessagingProviderId) private readonly messaging: MessagingService,
  ) {
    this.log.setContext("SwapRateService");
  }

  async getOrFetchRate(from: string, to: string): Promise<string> {
    const swap = this.latestSwapRates.find((s: SwapRate) => s.from === from && s.to === to);
    let rate: string;
    if (swap) {
      rate = swap.rate;
    } else {
      const targetSwap = this.config.getAllowedSwaps().find((s) => s.from === from && s.to === to);
      if (targetSwap) {
        rate = await this.fetchSwapRate(from, to, targetSwap.priceOracleType);
      } else {
        throw new Error(`No valid swap exists for ${from} to ${to}`);
      }
    }
    return rate;
  }

  async fetchSwapRate(
    from: string,
    to: string,
    priceOracleType: PriceOracleTypes,
    blockNumber: number = 0,
  ): Promise<string | undefined> {
    if (!this.config.getAllowedSwaps().find((s: AllowedSwap) => s.from === from && s.to === to)) {
      throw new Error(`No valid swap exists for ${from} to ${to}`);
    }
    const rateIndex = this.latestSwapRates.findIndex(
      (s: SwapRate) => s.from === from && s.to === to,
    );
    let oldRate: string | undefined;
    if (rateIndex !== -1) {
      oldRate = this.latestSwapRates[rateIndex].rate;
    }

    if (
      this.latestSwapRates[rateIndex] &&
      this.latestSwapRates[rateIndex].blockNumber === blockNumber
    ) {
      // already have rates for this block
      return undefined;
    }

    // check rate based on configured price oracle
    let newRate: string;
    try {
      newRate = (await Promise.race([
        new Promise(
          async (resolve, reject): Promise<void> => {
            switch (priceOracleType) {
              case PriceOracleTypes.UNISWAP:
                resolve(await this.getUniswapRate(from, to));
                break;
              case PriceOracleTypes.HARDCODED:
                resolve(await this.config.getHardcodedRate(from, to));
                break;
              default:
                throw new Error(`Price oracle not configured for swap ${from} -> ${to}`);
            }
          },
        ),
        new Promise((res: any, rej: any): void => {
          const timeout = 15_000;
          setTimeout((): void => rej(new Error(`Took longer than ${timeout / 1000}s`)), timeout);
        }),
      ])) as string;
    } catch (e) {
      this.log.warn(
        `Failed to fetch swap rate from ${priceOracleType} for ${from} to ${to}: ${e.message}`,
      );
      if (process.env.NODE_ENV === "development") {
        newRate = await this.config.getDefaultSwapRate(from, to);
        if (!newRate) {
          this.log.warn(`No default rate for swap from ${from} to ${to}, returning zero.`);
          return "0";
        }
      }
    }

    const newSwap: SwapRate = { from, to, rate: newRate, priceOracleType, blockNumber };
    if (rateIndex !== -1) {
      oldRate = this.latestSwapRates[rateIndex].rate;
      this.latestSwapRates[rateIndex] = newSwap;
    } else {
      this.latestSwapRates.push(newSwap);
    }
    const oldRateBn = parseEther(oldRate || "0");
    const newRateBn = parseEther(newRate);
    if (!oldRateBn.eq(newRateBn)) {
      this.log.info(`Got swap rate from Uniswap at block ${blockNumber}: ${newRate}`);
      this.broadcastRate(from, to); // Only broadcast the rate if it's changed
    }
    return newRate;
  }

  async getUniswapRate(from: string, to: string): Promise<string> {
    const fromReserves =
      from !== AddressZero
        ? await getTokenReserves(await this.config.getTokenAddressForSwap(from))
        : undefined;
    const toReserves =
      to !== AddressZero
        ? await getTokenReserves(await this.config.getTokenAddressForSwap(to))
        : undefined;
    return getMarketDetails(fromReserves, toReserves).marketRate.rate.toString();
  }

  async broadcastRate(from: string, to: string): Promise<void> {
    const swap = this.latestSwapRates.find((s: SwapRate) => s.from === from && s.to === to);
    if (!swap) {
      throw new Error(`No rate exists for ${from} to ${to}`);
    }
    this.messaging.publish(`swap-rate.${from}.${to}`, {
      swapRate: swap.rate,
    });
  }

  async onModuleInit(): Promise<void> {
    const provider = this.config.getEthProvider();
    const swaps = this.config.getAllowedSwaps();

    const handler = async () => {
      const blockNumber = await provider.getBlockNumber();
      for (const swap of swaps) {
        if (swap.priceOracleType === PriceOracleTypes.UNISWAP) {
          this.log.debug(`Querying chain listener for swaps from ${swap.from} to ${swap.to}`);
          this.fetchSwapRate(swap.from, swap.to, swap.priceOracleType, blockNumber);
        } else if (swap.priceOracleType === PriceOracleTypes.HARDCODED) {
          this.log.debug(`Using hardcoded value for swaps from ${swap.from} to ${swap.to}`);
        }
      }
    };

    // setup interval for swaps
    setInterval(() => handler(), 15_000);
  }
}
