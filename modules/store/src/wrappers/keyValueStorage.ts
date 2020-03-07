import {
  IStoreService,
  WrappedStorage,
  StateChannelJSON,
  AppInstanceJson,
  SetStateCommitmentJSON,
  ProtocolTypes,
  ConditionalTransactionCommitmentJSON,
  STORE_SCHEMA_VERSION,
  WithdrawalMonitorObject,
} from "@connext/types";
import {
  safeJsonParse,
  CHANNEL_KEY,
  safeJsonStringify,
  SET_STATE_COMMITMENT_KEY,
  WITHDRAWAL_COMMITMENT_KEY,
  CONDITIONAL_COMMITMENT_KEY,
} from "../helpers";

/**
 * This class wraps a general key value storage service to become an `IStoreService`
 */
export class KeyValueStorage implements WrappedStorage, IStoreService {
  private schemaVersion: number = STORE_SCHEMA_VERSION;
  constructor(private readonly storage: WrappedStorage) {}

  getSchemaVersion(): number {
    return this.schemaVersion;
  }

  getKeys(): Promise<string[]> {
    return this.storage.getKeys();
  }

  getItem(key: string): Promise<string | undefined> {
    return this.storage.getItem(key);
  }

  setItem(key: string, value: string): Promise<void> {
    return this.storage.setItem(key, value);
  }

  removeItem(key: string): Promise<void> {
    return this.storage.removeItem(key);
  }

  getEntries(): Promise<[string, any][]> {
    return this.storage.getEntries();
  }

  clear(): Promise<void> {
    return this.storage.clear();
  }

  restore(): Promise<void> {
    return this.storage.restore();
  }

  joinWithSeparator(...args: string[]): string {
    return this.storage.joinWithSeparator(...args);
  }

  async getAllChannels(): Promise<StateChannelJSON[]> {
    const channelKeys = (await this.getKeys()).filter(key => key.includes(CHANNEL_KEY));
    const channels = [];
    for (const key of channelKeys) {
      const record = safeJsonParse(await this.getItem(key));
      channels.push(record);
    }
    return channels.filter(x => !!x);
  }

  async getStateChannelByOwners(owners: string[]): Promise<StateChannelJSON | undefined> {
    const channels = await this.getAllChannels();
    return channels.find(
      channel => channel.userNeuteredExtendedKeys.sort().toString() === owners.sort().toString(),
    );
  }

  async getStateChannelByAppInstanceId(
    appInstanceId: string,
  ): Promise<StateChannelJSON | undefined> {
    const channels = await this.getAllChannels();
    return channels.find(channel => {
      return (
        channel.proposedAppInstances.find(([app]) => app === appInstanceId) ||
        channel.appInstances.find(([app]) => app === appInstanceId) ||
        channel.freeBalanceAppInstance.identityHash === appInstanceId
      );
    });
  }

  async getStateChannel(multisigAddress: string): Promise<StateChannelJSON | undefined> {
    const channelKey = this.joinWithSeparator(CHANNEL_KEY, multisigAddress);
    return safeJsonParse(await this.getItem(channelKey));
  }

  async saveStateChannel(stateChannel: StateChannelJSON): Promise<void> {
    const channelKey = this.joinWithSeparator(CHANNEL_KEY, stateChannel.multisigAddress);
    return this.setItem(channelKey, safeJsonStringify(stateChannel));
  }

  async getAppInstance(appInstanceId: string): Promise<AppInstanceJson | undefined> {
    const channel = await this.getStateChannelByAppInstanceId(appInstanceId);
    if (!channel) {
      return undefined;
    }
    return channel.appInstances[appInstanceId];
  }

  async saveAppInstance(multisigAddress: string, appInstance: AppInstanceJson): Promise<void> {
    const channel = await this.getStateChannel(multisigAddress);
    const existsIndex = channel.appInstances.findIndex(([app]) => app === appInstance.identityHash);

    if (existsIndex > 0) {
      channel.appInstances[existsIndex] = [appInstance.identityHash, appInstance];
    } else {
      channel.appInstances.push([appInstance.identityHash, appInstance]);
    }

    return this.saveStateChannel(channel);
  }

  async getLatestSetStateCommitment(
    appIdentityHash: string,
  ): Promise<SetStateCommitmentJSON | undefined> {
    const setStateKey = this.joinWithSeparator(SET_STATE_COMMITMENT_KEY, appIdentityHash);
    return safeJsonParse(await this.getItem(setStateKey));
  }

  async saveLatestSetStateCommitment(
    appIdentityHash: string,
    commitment: SetStateCommitmentJSON,
  ): Promise<void> {
    const setStateKey = this.joinWithSeparator(SET_STATE_COMMITMENT_KEY, appIdentityHash);
    return this.setItem(setStateKey, safeJsonStringify(commitment));
  }

  async getWithdrawalCommitment(
    multisigAddress: string,
  ): Promise<ProtocolTypes.MinimalTransaction | undefined> {
    const withdrawalKey = this.joinWithSeparator(WITHDRAWAL_COMMITMENT_KEY, multisigAddress);
    return safeJsonParse(await this.getItem(withdrawalKey));
  }

  async saveWithdrawalCommitment(
    multisigAddress: string,
    commitment: ProtocolTypes.MinimalTransaction,
  ): Promise<void> {
    const withdrawalKey = this.joinWithSeparator(WITHDRAWAL_COMMITMENT_KEY, multisigAddress);
    return this.setItem(withdrawalKey, safeJsonStringify(commitment));
  }

  async getConditionalTransactionCommitment(
    appIdentityHash: string,
  ): Promise<ConditionalTransactionCommitmentJSON | undefined> {
    const conditionalCommitmentKey = this.joinWithSeparator(
      CONDITIONAL_COMMITMENT_KEY,
      appIdentityHash,
    );
    return safeJsonParse(await this.getItem(conditionalCommitmentKey));
  }

  async saveConditionalTransactionCommitment(
    appIdentityHash: string,
    commitment: ConditionalTransactionCommitmentJSON,
  ): Promise<void> {
    const conditionalCommitmentKey = this.joinWithSeparator(
      CONDITIONAL_COMMITMENT_KEY,
      appIdentityHash,
    );
    return this.setItem(conditionalCommitmentKey, safeJsonStringify(commitment));
  }

  async getUserWithdrawal(): Promise<WithdrawalMonitorObject> {
    const withdrawalKey = this.joinWithSeparator(WITHDRAWAL_COMMITMENT_KEY, `monitor`);
    return safeJsonParse(await this.getItem(withdrawalKey));
  }

  async setUserWithdrawal(withdrawalObject: WithdrawalMonitorObject): Promise<void> {
    const withdrawalKey = this.joinWithSeparator(WITHDRAWAL_COMMITMENT_KEY, `monitor`);
    return this.setItem(withdrawalKey, safeJsonStringify(withdrawalObject));
  }

  // TODO: delete
  getExtendedPrvKey(): Promise<string> {
    throw new Error("Method not implemented.");
  }

  // TODO: delete
  saveExtendedPrvKey(extendedPrvKey: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
}

export default KeyValueStorage;