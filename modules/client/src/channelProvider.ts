import {
  ChannelMethods,
  ConnextEventEmitter,
  EventNames,
  IChannelProvider,
  IClientStore,
  MethodName,
  StateChannelJSON,
  WithdrawalMonitorObject,
  deBigNumberifyJson,
  SetStateCommitmentJSON,
  MinimalTransaction,
  ConditionalTransactionCommitmentJSON,
} from "@connext/types";
import { ChannelProvider } from "@connext/channel-provider";
import { signChannelMessage } from "@connext/crypto";

import { CFCore, xpubToAddress } from "./lib";
import {
  CFChannelProviderOptions,
  ChannelProviderConfig,
  IRpcConnection,
  JsonRpcRequest,
} from "./types";

export const createCFChannelProvider = async ({
  ethProvider,
  keyGen,
  lockService,
  messaging,
  networkContext,
  nodeConfig,
  nodeUrl,
  store,
  xpub,
  logger,
}: CFChannelProviderOptions): Promise<IChannelProvider> => {
  const cfCore = await CFCore.create(
    messaging,
    store,
    networkContext,
    nodeConfig,
    ethProvider,
    lockService,
    xpub,
    keyGen,
    undefined,
    logger,
  );
  const channelProviderConfig: ChannelProviderConfig = {
    freeBalanceAddress: xpubToAddress(xpub),
    nodeUrl,
    signerAddress: xpubToAddress(xpub),
    userPublicIdentifier: xpub,
  };
  const connection = new CFCoreRpcConnection(cfCore, store, await keyGen("0"));
  const channelProvider = new ChannelProvider(connection, channelProviderConfig);
  return channelProvider;
};

export class CFCoreRpcConnection extends ConnextEventEmitter implements IRpcConnection {
  public connected: boolean = true;
  public cfCore: CFCore;
  public store: IClientStore;

  // TODO: replace this when signing keys are added!
  public authKey: string;

  constructor(cfCore: CFCore, store: IClientStore, authKey: string) {
    super();
    this.cfCore = cfCore;
    this.authKey = authKey;
    this.store = store;
  }

  public async send(payload: JsonRpcRequest): Promise<any> {
    const { method, params } = payload;
    let result;
    switch (method) {
      case ChannelMethods.chan_setUserWithdrawal:
        result = await this.storeSetUserWithdrawal(params.withdrawalObject);
        break;
      case ChannelMethods.chan_getUserWithdrawal:
        result = await this.storeGetUserWithdrawal();
        break;
      case ChannelMethods.chan_signMessage:
        result = await this.signMessage(params.message);
        break;
      case ChannelMethods.chan_restoreState:
        result = await this.restoreState();
        break;
      case ChannelMethods.chan_setStateChannel:
        result = await this.setStateChannel(params.state);
        break;
      case ChannelMethods.chan_createSetupCommitment:
        result = await this.createSetupCommitment(params.multisigAddress, params.commitment);
        break;
      case ChannelMethods.chan_createSetStateCommitment:
        result = await this.createSetStateCommitment(params.appIdentityHash, params.commitment);
        break;
      case ChannelMethods.chan_createConditionalCommitment:
        result = await this.createConditionalCommitment(params.appIdentityHash, params.commitment);
        break;
      default:
        result = await this.routerDispatch(method, params);
        break;
    }
    return result;
  }

  public on = (
    event: string | EventNames | MethodName,
    listener: (...args: any[]) => void,
  ): any => {
    this.cfCore.on(event as any, listener);
    return this.cfCore;
  };

  public once = (
    event: string | EventNames | MethodName,
    listener: (...args: any[]) => void,
  ): any => {
    this.cfCore.once(event as any, listener);
    return this.cfCore;
  };

  public open(): Promise<void> {
    return Promise.resolve();
  }

  public close(): Promise<void> {
    return Promise.resolve();
  }

  ///////////////////////////////////////////////
  ///// PRIVATE METHODS
  private signMessage = async (message: string): Promise<string> => {
    return signChannelMessage(this.authKey, message);
  };

  private storeGetUserWithdrawal = async (): Promise<WithdrawalMonitorObject | undefined> => {
    return this.store.getUserWithdrawal();
  };

  private storeSetUserWithdrawal = async (
    value: WithdrawalMonitorObject | undefined,
  ): Promise<void> => {
    if (!value) {
      return this.store.removeUserWithdrawal();
    }
    const existing = await this.store.getUserWithdrawal();
    if (!existing) {
      return this.store.createUserWithdrawal(value);
    }
    return this.store.updateUserWithdrawal(value);
  };

  private setStateChannel = async (channel: StateChannelJSON): Promise<void> => {
    return this.store.createStateChannel(channel);
  };

  private restoreState = async (): Promise<void> => {
    await this.store.restore();
  };

  public createSetupCommitment = async (
    multisigAddress: string,
    commitment: MinimalTransaction,
  ): Promise<void> => {
    await this.store.createSetupCommitment(multisigAddress, commitment);
    // may be called on restore, if this is ever called assume the schema
    // should be updated (either on start or restart)
    await this.store.updateSchemaVersion();
  };

  public createSetStateCommitment = async (
    appIdentityHash: string,
    commitment: SetStateCommitmentJSON,
  ): Promise<void> => {
    await this.store.createSetStateCommitment(appIdentityHash, commitment);
  };

  public createConditionalCommitment = async (
    appIdentityHash: string,
    commitment: ConditionalTransactionCommitmentJSON,
  ): Promise<void> => {
    await this.store.createConditionalTransactionCommitment(appIdentityHash, commitment);
  };

  private routerDispatch = async (method: string, params: any = {}) => {
    const ret = await this.cfCore.rpcRouter.dispatch({
      id: Date.now(),
      methodName: method,
      parameters: deBigNumberifyJson(params),
    });
    return ret.result.result;
  };
}
