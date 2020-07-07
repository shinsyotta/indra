import {
  ConditionalTransferTypes,
  CreatedHashLockTransferMeta,
  CreatedLinkedTransferMeta,
  CreatedSignedTransferMeta,
  DefaultApp,
  EventNames,
  HashLockTransferAppName,
  HashLockTransferAppState,
  IChannelProvider,
  ILoggerService,
  SimpleLinkedTransferAppName,
  SimpleLinkedTransferAppState,
  SimpleSignedTransferAppName,
  SimpleSignedTransferAppState,
  WithdrawAppName,
  WithdrawAppState,
  AppAction,
  AppState,
  SimpleSignedTransferAppAction,
  SimpleLinkedTransferAppAction,
  HashLockTransferAppAction,
  UnlockedLinkedTransferMeta,
  UnlockedHashLockTransferMeta,
  UnlockedSignedTransferMeta,
  EventPayload,
  EventPayloads,
  EventName,
  IBasicEventEmitter,
  ProtocolEventMessage,
  ProtocolParams,
  AppInstanceJson,
  GraphSignedTransferAppName,
  CreatedGraphSignedTransferMeta,
  GraphSignedTransferAppState,
  GraphSignedTransferAppAction,
  UnlockedGraphSignedTransferMeta,
} from "@connext/types";
import { bigNumberifyJson, stringify, TypedEmitter, toBN } from "@connext/utils";
import { constants } from "ethers";

import { ConnextClient } from "./connext";

const { HashZero } = constants;

const {
  CONDITIONAL_TRANSFER_CREATED_EVENT,
  CONDITIONAL_TRANSFER_UNLOCKED_EVENT,
  CONDITIONAL_TRANSFER_FAILED_EVENT,
  WITHDRAWAL_CONFIRMED_EVENT,
  WITHDRAWAL_FAILED_EVENT,
  WITHDRAWAL_STARTED_EVENT,
  CREATE_CHANNEL_EVENT,
  SETUP_FAILED_EVENT,
  DEPOSIT_CONFIRMED_EVENT,
  DEPOSIT_FAILED_EVENT,
  DEPOSIT_STARTED_EVENT,
  INSTALL_EVENT,
  INSTALL_FAILED_EVENT,
  PROPOSE_INSTALL_EVENT,
  PROPOSE_INSTALL_FAILED_EVENT,
  PROTOCOL_MESSAGE_EVENT,
  REJECT_INSTALL_EVENT,
  SYNC,
  SYNC_FAILED_EVENT,
  UNINSTALL_EVENT,
  UNINSTALL_FAILED_EVENT,
  UPDATE_STATE_EVENT,
  UPDATE_STATE_FAILED_EVENT,
} = EventNames;

type CallbackStruct = {
  [index in keyof typeof EventNames]: (data: ProtocolEventMessage<index>) => Promise<any> | void;
};

export class ConnextListener {
  private log: ILoggerService;
  private typedEmitter: IBasicEventEmitter;
  private channelProvider: IChannelProvider;
  private connext: ConnextClient;

  // TODO: add custom parsing functions here to convert event data
  // to something more usable? -- OR JUST FIX THE EVENT DATA! :p
  private protocolCallbacks: CallbackStruct = {
    CREATE_CHANNEL_EVENT: (msg): void => {
      this.emitAndLog(CREATE_CHANNEL_EVENT, msg.data);
    },
    SETUP_FAILED_EVENT: (msg): void => {
      this.emitAndLog(SETUP_FAILED_EVENT, msg.data);
    },
    CONDITIONAL_TRANSFER_CREATED_EVENT: (msg): void => {
      this.emitAndLog(CONDITIONAL_TRANSFER_CREATED_EVENT, msg.data);
    },
    CONDITIONAL_TRANSFER_UNLOCKED_EVENT: (msg): void => {
      this.emitAndLog(CONDITIONAL_TRANSFER_UNLOCKED_EVENT, msg.data);
    },
    CONDITIONAL_TRANSFER_FAILED_EVENT: (msg: any): void => {
      this.emitAndLog(CONDITIONAL_TRANSFER_FAILED_EVENT, msg.data);
    },
    DEPOSIT_CONFIRMED_EVENT: (msg): void => {
      this.emitAndLog(DEPOSIT_CONFIRMED_EVENT, msg.data);
    },
    DEPOSIT_FAILED_EVENT: (msg): void => {
      this.emitAndLog(DEPOSIT_FAILED_EVENT, msg.data);
    },
    DEPOSIT_STARTED_EVENT: (msg): void => {
      this.log.info(`Deposit started: ${msg.data.hash}`);
      this.emitAndLog(DEPOSIT_STARTED_EVENT, msg.data);
    },
    INSTALL_EVENT: (msg): void => {
      this.emitAndLog(INSTALL_EVENT, msg.data);
    },
    INSTALL_FAILED_EVENT: (msg): void => {
      this.emitAndLog(INSTALL_FAILED_EVENT, msg.data);
    },
    PROPOSE_INSTALL_EVENT: async (msg): Promise<void> => {
      const {
        data: { params, appInstanceId },
        from,
      } = msg;
      // return if its from us
      const start = Date.now();
      const time = () => `in ${Date.now() - start} ms`;
      if (from === this.connext.publicIdentifier) {
        this.log.debug(`Received proposal from our own node, doing nothing ${time()}`);
        return;
      }
      this.log.info(`Processing proposal for ${appInstanceId}`);
      await this.handleAppProposal(params, appInstanceId);
      this.log.info(`Done processing propose install event ${time()}`);
      // validate and automatically install for the known and supported
      // applications
      this.emitAndLog(PROPOSE_INSTALL_EVENT, msg.data);
    },
    PROPOSE_INSTALL_FAILED_EVENT: (msg): void => {
      this.emitAndLog(PROPOSE_INSTALL_FAILED_EVENT, msg.data);
    },
    PROTOCOL_MESSAGE_EVENT: (msg): void => {
      this.emitAndLog(PROTOCOL_MESSAGE_EVENT, msg.data);
    },
    REJECT_INSTALL_EVENT: (msg): void => {
      this.emitAndLog(REJECT_INSTALL_EVENT, msg.data);
    },
    SYNC: (msg): void => {
      this.emitAndLog(SYNC, msg.data);
    },
    SYNC_FAILED_EVENT: (msg): void => {
      this.emitAndLog(SYNC_FAILED_EVENT, msg.data);
    },
    UNINSTALL_EVENT: async (msg): Promise<void> => {
      const { latestState } = msg.data.uninstalledApp;
      await this.handleAppUninstall(
        msg.data.appIdentityHash,
        latestState as AppState,
        msg.data.action as AppAction,
        msg.data.uninstalledApp,
      );
      this.emitAndLog(UNINSTALL_EVENT, msg.data);
    },
    UNINSTALL_FAILED_EVENT: (msg): void => {
      this.emitAndLog(UNINSTALL_FAILED_EVENT, msg.data);
    },
    UPDATE_STATE_EVENT: async (msg): Promise<void> => {
      await this.handleAppUpdate(
        msg.data.appIdentityHash,
        msg.data.newState as AppState,
        msg.data.action as AppAction,
      );
      this.emitAndLog(UPDATE_STATE_EVENT, msg.data);
    },
    UPDATE_STATE_FAILED_EVENT: (msg): void => {
      this.emitAndLog(UPDATE_STATE_FAILED_EVENT, msg.data);
    },
    WITHDRAWAL_FAILED_EVENT: (msg): void => {
      this.emitAndLog(WITHDRAWAL_FAILED_EVENT, msg.data);
    },
    WITHDRAWAL_CONFIRMED_EVENT: (msg): void => {
      this.emitAndLog(WITHDRAWAL_CONFIRMED_EVENT, msg.data);
    },
    WITHDRAWAL_STARTED_EVENT: (msg): void => {
      this.emitAndLog(WITHDRAWAL_STARTED_EVENT, msg.data);
    },
  };

  constructor(connext: ConnextClient) {
    this.typedEmitter = new TypedEmitter();
    this.channelProvider = connext.channelProvider;
    this.connext = connext;
    this.log = connext.log.newContext("ConnextListener");
  }

  ////////////////////////////////////////////////
  ////// Emitter events
  public post<T extends EventName>(event: T, payload: EventPayload[T]): void {
    this.typedEmitter.post(event, payload);
  }

  public attachOnce<T extends EventName>(
    event: T,
    callback: (payload: EventPayload[T]) => void | Promise<void>,
    filter?: (payload: EventPayload[T]) => boolean,
  ): void {
    this.typedEmitter.attachOnce(event, callback, filter);
  }

  public attach<T extends EventName>(
    event: T,
    callback: (payload: EventPayload[T]) => void | Promise<void>,
    filter?: (payload: EventPayload[T]) => boolean,
  ): void {
    this.typedEmitter.attach(event, callback, filter);
  }

  public waitFor<T extends EventName>(
    event: T,
    timeout: number,
    filter?: (payload: EventPayload[T]) => boolean,
  ): Promise<EventPayload[T]> {
    return this.typedEmitter.waitFor(event, timeout, filter);
  }

  public detach(): void {
    this.typedEmitter.detach();
  }

  public register = async (): Promise<void> => {
    this.detach();
    this.log.debug(`Registering default listeners`);
    this.registerProtocolCallbacks();
    this.registerLinkedTranferSubscription();
    this.log.debug(`Registered default listeners`);
    return;
  };

  private registerProtocolCallbacks = (): void => {
    Object.entries(this.protocolCallbacks).forEach(([event, callback]: any): any => {
      this.channelProvider.off(event);
      this.channelProvider.on(event, callback);
    });
  };

  private emitAndLog<T extends EventName>(event: T, data: EventPayload[T]): void {
    const protocol =
      event === PROTOCOL_MESSAGE_EVENT
        ? (data as EventPayload[typeof PROTOCOL_MESSAGE_EVENT]).protocol
        : "";
    this.log.debug(`Received ${event}${protocol ? ` for ${protocol} protocol` : ""}`);
    this.post(event, bigNumberifyJson(data));
  }

  private registerLinkedTranferSubscription = async (): Promise<void> => {
    this.attach(EventNames.CONDITIONAL_TRANSFER_CREATED_EVENT, async (payload) => {
      this.log.info(`Received event CONDITIONAL_TRANSFER_CREATED_EVENT: ${stringify(payload)}`);
      const start = Date.now();
      const time = () => `in ${Date.now() - start} ms`;

      if (payload.type === ConditionalTransferTypes.LinkedTransfer) {
        if (
          (payload as EventPayloads.LinkedTransferCreated).recipient !==
          this.connext.publicIdentifier
        ) {
          return;
        }
        try {
          const {
            paymentId,
            transferMeta: { encryptedPreImage },
            amount,
            assetId,
          } = payload as EventPayloads.LinkedTransferCreated;
          if (!paymentId || !encryptedPreImage || !amount || !assetId) {
            throw new Error(`Unable to parse transfer details from message ${stringify(payload)}`);
          }
          this.log.info(`Unlocking transfer with paymentId: ${paymentId}`);
          await this.connext.reclaimPendingAsyncTransfer(paymentId, encryptedPreImage);
          this.log.info(`Successfully unlocked transfer with paymentId: ${paymentId}`);
        } catch (e) {
          this.log.error(
            `Error in event handler for CONDITIONAL_TRANSFER_CREATED_EVENT: ${e.message}`,
          );
        }
      }
      this.log.info(`Finished processing CONDITIONAL_TRANSFER_CREATED_EVENT ${time()}`);
    });
  };

  private handleAppProposal = async (
    params: ProtocolParams.Propose,
    appIdentityHash: string,
  ): Promise<void> => {
    // get supported apps
    const registryAppInfo = this.connext.appRegistry.find((app: DefaultApp): boolean => {
      return app.appDefinitionAddress === params.appDefinition;
    });
    this.log.info(
      `handleAppProposal for app ${registryAppInfo.name} ${appIdentityHash} started: ${stringify(
        params,
      )}`,
    );
    if (!registryAppInfo) {
      throw new Error(`Could not find registry info for app ${params.appDefinition}`);
    }
    // install or reject app
    try {
      // NOTE: by trying to install here, if the installation fails,
      // the proposal is automatically removed from the store
      this.log.info(`Installing ${registryAppInfo.name} with id: ${appIdentityHash}`);
      await this.connext.installApp(appIdentityHash);
      this.log.info(`App ${appIdentityHash} installed`);
    } catch (e) {
      // TODO: first proposal after reset is responded to
      // twice
      if (e.message.includes("No proposed AppInstance exists")) {
        return;
      } else {
        this.log.error(`Caught error, rejecting install of ${appIdentityHash}: ${e.message}`);
        await this.connext.rejectInstallApp(appIdentityHash, e.message);
        return;
      }
    }
    // install and run post-install tasks
    await this.runPostInstallTasks(appIdentityHash, registryAppInfo, params);
    this.log.info(`handleAppProposal for app ${registryAppInfo.name} ${appIdentityHash} completed`);
    const { appInstance } = await this.connext.getAppInstance(appIdentityHash);
    await this.connext.node.messaging.publish(
      `${this.connext.publicIdentifier}.channel.${this.connext.multisigAddress}.app-instance.${appIdentityHash}.install`,
      stringify(appInstance),
    );
  };

  private runPostInstallTasks = async (
    appIdentityHash: string,
    registryAppInfo: DefaultApp,
    params: ProtocolParams.Propose,
  ): Promise<void> => {
    this.log.info(
      `runPostInstallTasks for app ${registryAppInfo.name} ${appIdentityHash} started: ${stringify(
        params,
        true,
        0,
      )}`,
    );
    switch (registryAppInfo.name) {
      case WithdrawAppName: {
        const { appInstance } = (await this.connext.getAppInstance(appIdentityHash)) || {};
        if (!appInstance) {
          this.log.warn(`Could not fund app instance for node withdraw to respond to, ignoring.`);
        }
        await this.connext.respondToNodeWithdraw(appInstance);
        break;
      }
      case GraphSignedTransferAppName: {
        const initialState = params.initialState as GraphSignedTransferAppState;
        const { initiatorDepositAssetId: assetId, meta } = params;
        const amount = initialState.coinTransfers[0].amount;
        this.connext.emit(EventNames.CONDITIONAL_TRANSFER_CREATED_EVENT, {
          amount,
          appIdentityHash,
          assetId,
          meta,
          sender: meta["sender"],
          transferMeta: {
            signerAddress: initialState.signerAddress,
            chainId: initialState.chainId,
            verifyingContract: initialState.verifyingContract,
            requestCID: initialState.requestCID,
            subgraphDeploymentID: initialState.subgraphDeploymentID,
          } as CreatedGraphSignedTransferMeta,
          type: ConditionalTransferTypes.GraphTransfer,
          paymentId: initialState.paymentId,
          recipient: meta["recipient"],
        } as EventPayloads.GraphTransferCreated);
        break;
      }
      case SimpleSignedTransferAppName: {
        const initialState = params.initialState as SimpleSignedTransferAppState;
        const { initiatorDepositAssetId: assetId, meta } = params;
        const amount = initialState.coinTransfers[0].amount;
        this.connext.emit(EventNames.CONDITIONAL_TRANSFER_CREATED_EVENT, {
          amount,
          appIdentityHash,
          assetId,
          meta,
          sender: meta["sender"],
          transferMeta: {
            signerAddress: initialState.signerAddress,
            chainId: initialState.chainId,
            verifyingContract: initialState.verifyingContract,
          } as CreatedSignedTransferMeta,
          type: ConditionalTransferTypes.SignedTransfer,
          paymentId: initialState.paymentId,
          recipient: meta["recipient"],
        } as EventPayloads.SignedTransferCreated);
        break;
      }
      case HashLockTransferAppName: {
        const initialState = params.initialState as HashLockTransferAppState;
        const { initiatorDepositAssetId: assetId, meta } = params;
        const amount = initialState.coinTransfers[0].amount;
        this.connext.emit(EventNames.CONDITIONAL_TRANSFER_CREATED_EVENT, {
          amount,
          appIdentityHash,
          assetId,
          meta,
          sender: meta["sender"],
          transferMeta: {
            lockHash: initialState.lockHash,
            expiry: initialState.expiry,
            timelock: meta["timelock"],
          } as CreatedHashLockTransferMeta,
          type: ConditionalTransferTypes.HashLockTransfer,
          paymentId: initialState.lockHash,
          recipient: meta["recipient"],
        } as EventPayloads.HashLockTransferCreated);
        break;
      }
      case SimpleLinkedTransferAppName: {
        const initialState = params.initialState as SimpleLinkedTransferAppState;
        const { initiatorDepositAssetId: assetId, meta } = params;
        const amount = initialState.coinTransfers[0].amount;
        this.log.info(
          `Emitting event CONDITIONAL_TRANSFER_CREATED_EVENT for paymentId ${meta["paymentId"]}`,
        );
        this.connext.emit(EventNames.CONDITIONAL_TRANSFER_CREATED_EVENT, {
          amount,
          appIdentityHash,
          assetId,
          meta,
          sender: meta["sender"],
          transferMeta: {
            encryptedPreImage: meta["encryptedPreImage"],
          } as CreatedLinkedTransferMeta,
          type: ConditionalTransferTypes.LinkedTransfer,
          paymentId: meta["paymentId"],
          recipient: meta["recipient"],
        } as EventPayloads.LinkedTransferCreated);
        break;
      }
    }
    this.log.info(
      `runPostInstallTasks for app ${registryAppInfo.name} ${appIdentityHash} complete`,
    );
  };

  private handleAppUninstall = async (
    appIdentityHash: string,
    state: AppState,
    action?: AppAction,
    appContext?: AppInstanceJson,
  ): Promise<void> => {
    const appInstance =
      appContext || (await this.connext.getAppInstance(appIdentityHash)).appInstance;
    if (!appInstance) {
      this.log.info(
        `Could not find app instance, this likely means the app has been uninstalled, doing nothing`,
      );
      return;
    }
    const registryAppInfo = this.connext.appRegistry.find((app: DefaultApp): boolean => {
      return app.appDefinitionAddress === appInstance.appDefinition;
    });

    switch (registryAppInfo.name) {
      case SimpleLinkedTransferAppName: {
        const transferState = state as SimpleLinkedTransferAppState;
        const transferAction = action as SimpleLinkedTransferAppAction;
        const transferAmount = toBN(transferState.coinTransfers[0].amount).isZero()
          ? toBN(transferState.coinTransfers[1].amount)
          : toBN(transferState.coinTransfers[0].amount);
        this.connext.emit(EventNames.CONDITIONAL_TRANSFER_UNLOCKED_EVENT, {
          type: ConditionalTransferTypes.LinkedTransfer,
          amount: transferAmount,
          assetId: appInstance.outcomeInterpreterParameters["tokenAddress"],
          paymentId: appInstance.meta.paymentId,
          sender: appInstance.meta.sender,
          recipient: appInstance.meta.recipient,
          meta: appInstance.meta,
          transferMeta: {
            preImage: transferAction?.preImage,
          } as UnlockedLinkedTransferMeta,
        } as EventPayloads.LinkedTransferUnlocked);
        break;
      }
      case HashLockTransferAppName: {
        const transferState = state as HashLockTransferAppState;
        const transferAction = action as HashLockTransferAppAction;
        const transferAmount = toBN(transferState.coinTransfers[0].amount).isZero()
          ? toBN(transferState.coinTransfers[1].amount)
          : toBN(transferState.coinTransfers[0].amount);
        this.connext.emit(EventNames.CONDITIONAL_TRANSFER_UNLOCKED_EVENT, {
          type: ConditionalTransferTypes.HashLockTransfer,
          amount: transferAmount,
          assetId: appInstance.outcomeInterpreterParameters["tokenAddress"],
          paymentId: HashZero,
          sender: appInstance.meta.sender,
          recipient: appInstance.meta.recipient,
          meta: appInstance.meta,
          transferMeta: {
            preImage: transferAction?.preImage,
            lockHash: transferState.lockHash,
          } as UnlockedHashLockTransferMeta,
        } as EventPayloads.HashLockTransferUnlocked);
        break;
      }
      case GraphSignedTransferAppName: {
        const transferState = state as GraphSignedTransferAppState;
        const transferAction = action as GraphSignedTransferAppAction;
        const transferAmount = toBN(transferState.coinTransfers[0].amount).isZero()
          ? toBN(transferState.coinTransfers[1].amount)
          : toBN(transferState.coinTransfers[0].amount);
        this.connext.emit(EventNames.CONDITIONAL_TRANSFER_UNLOCKED_EVENT, {
          type: ConditionalTransferTypes.GraphTransfer,
          amount: transferAmount,
          assetId: appInstance.outcomeInterpreterParameters["tokenAddress"],
          paymentId: transferState.paymentId,
          sender: appInstance.meta.sender,
          recipient: appInstance.meta.recipient,
          meta: appInstance.meta,
          transferMeta: {
            signature: transferAction?.signature,
            responseCID: transferAction?.responseCID,
          } as UnlockedGraphSignedTransferMeta,
        } as EventPayloads.GraphTransferUnlocked);
        break;
      }
      case SimpleSignedTransferAppName: {
        const transferState = state as SimpleSignedTransferAppState;
        const transferAction = action as SimpleSignedTransferAppAction;
        const transferAmount = toBN(transferState.coinTransfers[0].amount).isZero()
          ? toBN(transferState.coinTransfers[1].amount)
          : toBN(transferState.coinTransfers[0].amount);
        this.connext.emit(EventNames.CONDITIONAL_TRANSFER_UNLOCKED_EVENT, {
          type: ConditionalTransferTypes.SignedTransfer,
          amount: transferAmount,
          assetId: appInstance.outcomeInterpreterParameters["tokenAddress"],
          paymentId: transferState.paymentId,
          sender: appInstance.meta.sender,
          recipient: appInstance.meta.recipient,
          meta: appInstance.meta,
          transferMeta: {
            signature: transferAction?.signature,
            data: transferAction?.data,
          } as UnlockedSignedTransferMeta,
        } as EventPayloads.SignedTransferUnlocked);
        break;
      }
      default: {
        this.log.info(
          `Received update state event for ${registryAppInfo.name}, not doing anything`,
        );
      }
    }
  };

  private handleAppUpdate = async (
    appIdentityHash: string,
    state: AppState,
    action: AppAction,
  ): Promise<void> => {
    const { appInstance } = (await this.connext.getAppInstance(appIdentityHash)) || {};
    if (!appInstance) {
      this.log.info(
        `Could not find app instance, this likely means the app has been uninstalled, doing nothing`,
      );
      return;
    }
    const registryAppInfo = this.connext.appRegistry.find((app: DefaultApp): boolean => {
      return app.appDefinitionAddress === appInstance.appDefinition;
    });

    switch (registryAppInfo.name) {
      case WithdrawAppName: {
        const withdrawState = state as WithdrawAppState;
        const params = {
          amount: withdrawState.transfers[0].amount,
          recipient: withdrawState.transfers[0].to,
          assetId: appInstance.outcomeInterpreterParameters["tokenAddress"],
          nonce: withdrawState.nonce,
        };
        await this.connext.saveWithdrawCommitmentToStore(params, withdrawState.signatures);
        break;
      }
      default: {
        this.log.info(
          `Received update state event for ${registryAppInfo.name}, not doing anything`,
        );
      }
    }
  };
}
