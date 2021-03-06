import { SetupCommitment } from "../ethereum";
import { Opcode, Protocol, xkeyKthAddress } from "../machine";
import { StateChannel } from "../models";
import { Context, ProtocolMessage, ProtocolExecutionFlow, SetupProtocolParams } from "../types";
import { logTime } from "../utils";

import { assertIsValidSignature, UNASSIGNED_SEQ_NO } from "./utils";

const protocol = Protocol.Setup;
const { OP_SIGN, IO_SEND, IO_SEND_AND_WAIT, PERSIST_STATE_CHANNEL } = Opcode;

/**
 * @description This exchange is described at the following URL:
 *
 * specs.counterfactual.com/04-setup-protocol
 */
export const SETUP_PROTOCOL: ProtocolExecutionFlow = {
  0 /* Initiating */: async function*(context: Context) {
    const { message, network } = context;
    const log = context.log.newContext("CF-SetupProtocol");
    const start = Date.now();
    let substart;
    log.debug(`Initiation started`);

    const { processID, params } = message;

    const { multisigAddress, responderXpub, initiatorXpub } = params as SetupProtocolParams;

    // 56 ms
    const stateChannel = StateChannel.setupChannel(
      network.IdentityApp,
      { proxyFactory: network.ProxyFactory, multisigMastercopy: network.MinimumViableMultisig },
      multisigAddress,
      [initiatorXpub, responderXpub],
    );

    const setupCommitment = new SetupCommitment(
      network,
      stateChannel.multisigAddress,
      stateChannel.multisigOwners,
      stateChannel.freeBalance.identity,
    );

    // setup installs the free balance app, and on creation the state channel
    // will have nonce 1, so use hardcoded 0th key
    // 32 ms
    const initiatorSignature = yield [OP_SIGN, setupCommitment];

    // 201 ms (waits for responder to respond)
    substart = Date.now();
    const {
      customData: { signature: responderSignature },
    } = yield [
      IO_SEND_AND_WAIT,
      {
        protocol,
        processID,
        params,
        seq: 1,
        toXpub: responderXpub,
        customData: {
          signature: initiatorSignature,
        },
      } as ProtocolMessage,
    ];
    logTime(log, substart, `Received responder's sig`);

    // setup installs the free balance app, and on creation the state channel
    // will have nonce 1, so use hardcoded 0th key
    // 34 ms
    substart = Date.now();
    assertIsValidSignature(xkeyKthAddress(responderXpub, 0), setupCommitment, responderSignature);
    logTime(log, substart, `Verified responder's sig`);

    // 33 ms
    yield [PERSIST_STATE_CHANNEL, [stateChannel]];

    context.stateChannelsMap.set(stateChannel.multisigAddress, stateChannel);
    logTime(log, start, `Finished initiating`);
  },

  1 /* Responding */: async function*(context: Context) {
    const { message, network } = context;
    const log = context.log.newContext("CF-SetupProtocol");
    const start = Date.now();
    let substart;
    log.debug(`Response started`);

    const {
      processID,
      params,
      customData: { signature: initiatorSignature },
    } = message;

    const { multisigAddress, initiatorXpub, responderXpub } = params as SetupProtocolParams;

    // 73 ms
    const stateChannel = StateChannel.setupChannel(
      network.IdentityApp,
      { proxyFactory: network.ProxyFactory, multisigMastercopy: network.MinimumViableMultisig },
      multisigAddress,
      [initiatorXpub, responderXpub],
    );

    const setupCommitment = new SetupCommitment(
      network,
      stateChannel.multisigAddress,
      stateChannel.multisigOwners,
      stateChannel.freeBalance.identity,
    );

    // setup installs the free balance app, and on creation the state channel
    // will have nonce 1, so use hardcoded 0th key
    // 94 ms
    substart = Date.now();
    assertIsValidSignature(xkeyKthAddress(initiatorXpub, 0), setupCommitment, initiatorSignature);
    logTime(log, substart, `Verified initator's sig`);

    // 49 ms
    const responderSignature = yield [OP_SIGN, setupCommitment];

    yield [PERSIST_STATE_CHANNEL, [stateChannel]];

    yield [
      IO_SEND,
      {
        protocol,
        processID,
        toXpub: initiatorXpub,
        seq: UNASSIGNED_SEQ_NO,
        customData: {
          signature: responderSignature,
        },
      } as ProtocolMessage,
    ];

    context.stateChannelsMap.set(stateChannel.multisigAddress, stateChannel);
    logTime(log, start, `Finished responding`);
  },
};
