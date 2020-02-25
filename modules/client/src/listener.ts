import { bigNumberify, formatEther } from "ethers/utils";

import { ConnextClient } from "./connext";
import { Logger, stringify } from "./lib";
import {
  CFCoreTypes,
  CreateChannelMessage,
  ConnextEventEmitter,
  DefaultApp,
  DepositConfirmationMessage,
  DepositFailedMessage,
  DepositStartedMessage,
  IChannelProvider,
  InstallMessage,
  InstallVirtualMessage,
  MatchAppInstanceResponse,
  NodeMessageWrappedProtocolMessage,
  ProposeMessage,
  RejectProposalMessage,
  UninstallMessage,
  UninstallVirtualMessage,
  UpdateStateMessage,
  WithdrawConfirmationMessage,
  WithdrawFailedMessage,
  WithdrawStartedMessage,
} from "./types";
import { appProposalValidation } from "./validation/appProposals";
import {
  ProtocolTypes,
  CHALLENGE_INITIATED_EVENT,
  CHALLENGE_INITIATION_FAILED_EVENT,
  CHALLENGE_INITIATION_STARTED_EVENT,
  ChallengeInitiatedMessage,
  ChallengeInitiationFailedMessage,
  ChallengeInitiationStartedMessage,
  CREATE_CHANNEL_EVENT,
  DEPOSIT_CONFIRMED_EVENT,
  DEPOSIT_FAILED_EVENT,
  DEPOSIT_STARTED_EVENT,
  INSTALL_EVENT,
  INSTALL_VIRTUAL_EVENT,
  PROPOSE_INSTALL_EVENT,
  PROTOCOL_MESSAGE_EVENT,
  REJECT_INSTALL_EVENT,
  UNINSTALL_EVENT,
  UNINSTALL_VIRTUAL_EVENT,
  UPDATE_STATE_EVENT,
  WITHDRAWAL_CONFIRMED_EVENT,
  WITHDRAWAL_FAILED_EVENT,
  WITHDRAWAL_STARTED_EVENT,
  CoinBalanceRefundApp,
  SimpleTwoPartySwapApp,
} from "@connext/types";

// TODO: index of connext events only?
type CallbackStruct = {
  [index in CFCoreTypes.EventName]: (data: any) => Promise<any> | void;
};

export class ConnextListener extends ConnextEventEmitter {
  private log: Logger;
  private channelProvider: IChannelProvider;
  private connext: ConnextClient;

  // TODO: add custom parsing functions here to convert event data
  // to something more usable?
  private defaultCallbacks: CallbackStruct = {
    CHALLENGE_INITIATED_EVENT: (data: ChallengeInitiatedMessage): void => {
      this.emitAndLog(CHALLENGE_INITIATED_EVENT, data);
    },
    CHALLENGE_INITIATION_FAILED_EVENT: (data: ChallengeInitiationFailedMessage): void => {
      this.emitAndLog(CHALLENGE_INITIATION_FAILED_EVENT, data);
    },
    CHALLENGE_INITIATION_STARTED_EVENT: (data: ChallengeInitiationStartedMessage): void => {
      this.emitAndLog(CHALLENGE_INITIATION_STARTED_EVENT, data);
    },
    CREATE_CHANNEL_EVENT: (msg: CreateChannelMessage): void => {
      this.emitAndLog(CREATE_CHANNEL_EVENT, msg.data);
    },
    DEPOSIT_CONFIRMED_EVENT: async (msg: DepositConfirmationMessage): Promise<void> => {
      this.emitAndLog(DEPOSIT_CONFIRMED_EVENT, msg.data);
    },
    DEPOSIT_FAILED_EVENT: (msg: DepositFailedMessage): void => {
      this.emitAndLog(DEPOSIT_FAILED_EVENT, msg.data);
    },
    DEPOSIT_STARTED_EVENT: (msg: DepositStartedMessage): void => {
      const { value, txHash } = msg.data;
      this.log.info(`Deposit transaction: ${txHash}`);
      this.emitAndLog(DEPOSIT_STARTED_EVENT, msg.data);
    },
    INSTALL_EVENT: (msg: InstallMessage): void => {
      this.emitAndLog(INSTALL_EVENT, msg.data);
    },
    // TODO: make cf return app instance id and app def?
    INSTALL_VIRTUAL_EVENT: (msg: InstallVirtualMessage): void => {
      this.emitAndLog(INSTALL_VIRTUAL_EVENT, msg.data);
    },
    PROPOSE_INSTALL_EVENT: async (msg: ProposeMessage): Promise<void> => {
      // validate and automatically install for the known and supported
      // applications
      this.emitAndLog(PROPOSE_INSTALL_EVENT, msg.data);
      // check based on supported applications
      // matched app, take appropriate default actions
      const matchedResult = await this.matchAppInstance(msg);
      if (!matchedResult) {
        this.log.warn(`No matched app, doing nothing, ${stringify(msg)}`);
        return;
      }
      const {
        data: { params },
        from,
      } = msg;
      // return if its from us
      if (from === this.connext.publicIdentifier) {
        this.log.info(`Received proposal from our own node, doing nothing`);
        return;
      }
      // matched app, take appropriate default actions
      const { matchedApp } = matchedResult;
      await this.verifyAndInstallKnownApp(msg, matchedApp);
      // only publish for coin balance refund app
      const coinBalanceDef = this.connext.appRegistry.filter(
        (app: DefaultApp) => app.name === CoinBalanceRefundApp,
      )[0];
      if (params.appDefinition !== coinBalanceDef.appDefinitionAddress) {
        this.log.debug("Not sending propose message, not the coinbalance refund app");
        return;
      }
      this.log.info(`Sending proposal acceptance message`);
      this.log.debug(
        `Sending acceptance message to: indra.client.${this.connext.publicIdentifier}.proposalAccepted.${this.connext.multisigAddress}`,
      );
      await this.connext.messaging.publish(
        `indra.client.${this.connext.publicIdentifier}.proposalAccepted.${this.connext.multisigAddress}`,
        stringify(params),
      );
      return;
    },
    PROTOCOL_MESSAGE_EVENT: (msg: NodeMessageWrappedProtocolMessage): void => {
      this.emitAndLog(PROTOCOL_MESSAGE_EVENT, msg.data);
    },
    REJECT_INSTALL_EVENT: (msg: RejectProposalMessage): void => {
      this.emitAndLog(REJECT_INSTALL_EVENT, msg.data);
    },
    UNINSTALL_EVENT: (msg: UninstallMessage): void => {
      this.emitAndLog(UNINSTALL_EVENT, msg.data);
    },
    UNINSTALL_VIRTUAL_EVENT: (msg: UninstallVirtualMessage): void => {
      this.emitAndLog(UNINSTALL_VIRTUAL_EVENT, msg.data);
    },
    UPDATE_STATE_EVENT: (msg: UpdateStateMessage): void => {
      this.emitAndLog(UPDATE_STATE_EVENT, msg.data);
    },
    WITHDRAWAL_CONFIRMED_EVENT: (msg: WithdrawConfirmationMessage): void => {
      this.emitAndLog(WITHDRAWAL_CONFIRMED_EVENT, msg.data);
    },
    WITHDRAWAL_FAILED_EVENT: (msg: WithdrawFailedMessage): void => {
      this.emitAndLog(WITHDRAWAL_FAILED_EVENT, msg.data);
    },
    WITHDRAWAL_STARTED_EVENT: (msg: WithdrawStartedMessage): void => {
      const {
        params: { amount },
        txHash,
      } = msg.data;
      this.log.info(`Withdrawal transaction: ${txHash}`);
      this.emitAndLog(WITHDRAWAL_STARTED_EVENT, msg.data);
    },
  };

  constructor(channelProvider: IChannelProvider, connext: ConnextClient) {
    super();
    this.channelProvider = channelProvider;
    this.connext = connext;
    this.log = new Logger("ConnextListener", connext.log.logLevel);
  }

  public register = async (): Promise<void> => {
    await this.registerAvailabilitySubscription();
    this.registerDefaultListeners();
    await this.registerLinkedTransferSubscription();
    return;
  };

  public registerCfListener = (event: CFCoreTypes.EventName, cb: Function): void => {
    // replace with new fn
    this.log.debug(`Registering listener for ${event}`);
    this.channelProvider.on(
      event,
      async (res: any): Promise<void> => {
        await cb(res);
        this.emit(event, res);
      },
    );
  };

  public removeCfListener = (event: CFCoreTypes.EventName, cb: Function): boolean => {
    this.log.debug(`Removing listener for ${event}`);
    try {
      this.removeListener(event, cb as any);
      return true;
    } catch (e) {
      this.log.error(
        `Error trying to remove registered listener from event ${event}: ${e.stack || e.message}`,
      );
      return false;
    }
  };

  public registerDefaultListeners = (): void => {
    Object.entries(this.defaultCallbacks).forEach(([event, callback]: any): any => {
      this.channelProvider.on(event, callback);
    });

    this.channelProvider.on(
      ProtocolTypes.chan_install,
      async (msg: any): Promise<void> => {
        const {
          result: {
            result: { appInstance },
          },
        } = msg;
        await this.connext.messaging.publish(
          `indra.client.${this.connext.publicIdentifier}.install.${appInstance.identityHash}`,
          stringify(appInstance),
        );
      },
    );

    this.channelProvider.on(ProtocolTypes.chan_uninstall, (data: any): any => {
      const result = data.result.result;
      this.log.debug(`Emitting ProtocolTypes.chan_uninstall event: ${stringify(result)}`);
      this.connext.messaging.publish(
        `indra.client.${this.connext.publicIdentifier}.uninstall.${result.appInstanceId}`,
        stringify(result),
      );
    });
  };

  private emitAndLog = (event: CFCoreTypes.EventName, data: any): void => {
    const protocol =
      event === PROTOCOL_MESSAGE_EVENT ? (data.data ? data.data.protocol : data.protocol) : "";
    this.log.debug(`Received ${event}${protocol ? ` for ${protocol} protocol` : ""}`);
    this.log.debug(`Emitted ${event} with data ${stringify(data)} at ${Date.now()}`);
    this.emit(event, data);
  };

  private matchAppInstance = async (
    msg: ProposeMessage,
  ): Promise<MatchAppInstanceResponse | undefined> => {
    const filteredApps = this.connext.appRegistry.filter((app: DefaultApp): boolean => {
      return app.appDefinitionAddress === msg.data.params.appDefinition;
    });

    if (!filteredApps || filteredApps.length === 0) {
      this.log.info(`Proposed app not in registered applications.`);
      this.log.debug(`App: ${stringify(msg)}`);
      return undefined;
    }

    if (filteredApps.length > 1) {
      // TODO: throw error here?
      this.log.error(
        `Proposed app matched ${
          filteredApps.length
        } registered applications by definition address. App: ${stringify(msg)}`,
      );
      return undefined;
    }
    const { params, appInstanceId } = msg.data;
    const { initiatorDeposit, responderDeposit } = params;
    // matched app, take appropriate default actions
    return {
      appInstanceId,
      matchedApp: filteredApps[0],
      proposeParams: {
        ...params,
        initiatorDeposit: bigNumberify(initiatorDeposit),
        responderDeposit: bigNumberify(responderDeposit),
      },
    };
  };

  private verifyAndInstallKnownApp = async (
    msg: ProposeMessage,
    matchedApp: DefaultApp,
  ): Promise<void> => {
    const {
      data: { params, appInstanceId },
      from,
    } = msg;
    const invalidProposal = await appProposalValidation[matchedApp.name](
      params,
      from,
      matchedApp,
      this.connext,
    );

    if (invalidProposal) {
      // reject app installation
      this.log.error(`Proposed app is invalid. ${invalidProposal}`);
      await this.connext.rejectInstallApp(appInstanceId);
      return;
    }

    // proposal is valid, automatically install known app, but
    // do not ever automatically install swap app since theres no
    // way to validate the exchange in app against the rate input
    // to controller
    // this means the hub can only install apps, and cannot propose a swap
    // and there cant easily be an automatic install swap app between users
    if (matchedApp.name === SimpleTwoPartySwapApp) {
      return;
    }

    // dont automatically install coin balance refund app
    if (matchedApp.name === CoinBalanceRefundApp) {
      return;
    }

    this.log.debug("Proposal for app install successful, attempting install now...");
    let res: CFCoreTypes.InstallResult;

    // TODO: determine virtual app in a more resilient way
    // for now only simple transfer apps are virtual apps
    const virtualAppDefs = [this.connext.config.contractAddresses["SimpleTransferApp"]];
    if (virtualAppDefs.includes(params.appDefinition)) {
      res = await this.connext.installVirtualApp(appInstanceId);
    } else {
      res = await this.connext.installApp(appInstanceId);
    }
    this.log.debug(`App installed, res: ${stringify(res)}`);
    return;
  };

  private registerAvailabilitySubscription = async (): Promise<void> => {
    const subject = `online.${this.connext.publicIdentifier}`;
    await this.connext.messaging.subscribe(
      subject,
      async (msg: any): Promise<any> => {
        if (!msg.reply) {
          this.log.warn(`No reply found for msg: ${msg}`);
          return;
        }

        const response = true;
        this.connext.messaging.publish(msg.reply, {
          err: null,
          response,
        });
      },
    );
    this.log.debug(`Connected message pattern "${subject}"`);
  };

  private registerLinkedTransferSubscription = async (): Promise<void> => {
    const subject = `transfer.send-async.${this.connext.publicIdentifier}`;
    await this.connext.messaging.subscribe(subject, async (msg: any) => {
      this.log.debug(`Received message for ${subject} subscription`);
      this.log.debug(`Message data: ${stringify(JSON.parse(msg.data))}`);
      if (!msg.paymentId && !msg.data) {
        throw new Error(`Could not parse data from message: ${stringify(msg)}`);
      }
      let data = msg.paymentId ? msg : msg.data;
      if (typeof data === `string`) {
        data = JSON.parse(data);
      }
      const { paymentId, encryptedPreImage, amount, assetId } = data;
      if (!paymentId || !encryptedPreImage || !amount || !assetId) {
        throw new Error(`Unable to parse transfer details from message ${stringify(data)}`);
      }
      await this.connext.reclaimPendingAsyncTransfer(amount, assetId, paymentId, encryptedPreImage);
      this.log.info(`Successfully redeemed transfer with paymentId: ${paymentId}`);
    });
  };
}
