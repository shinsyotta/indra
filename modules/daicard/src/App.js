import * as connext from "@connext/client";
import { ConnextStore, PisaClientBackupAPI } from "@connext/store";
import { ConnextClientStorePrefix, EventNames, StoreTypes } from "@connext/types";
import { Currency, minBN, toBN, tokenToWei, weiToToken } from "@connext/utils";
import WalletConnectChannelProvider from "@walletconnect/channel-provider";
import { Paper, withStyles, Grid, Button } from "@material-ui/core";
import { Contract, ethers as eth } from "ethers";
import { AddressZero, Zero } from "ethers/constants";
import { formatEther } from "ethers/utils";
import interval from "interval-promise";
import { PisaClient } from "pisa-client";
import React from "react";
import { BrowserRouter as Router, Route } from "react-router-dom";
import { interpret } from "xstate";
import tokenAbi from "human-standard-token-abi";

import "./App.css";

// Pages
import { AppBarComponent } from "./components/AppBar";
import { CashoutCard } from "./components/cashOutCard";
import { Confirmations } from "./components/Confirmations";
import { DepositCard } from "./components/depositCard";
import { Home } from "./components/Home";
import { MySnackbar } from "./components/snackBar";
import { RequestCard } from "./components/requestCard";
import { RedeemCard } from "./components/redeemCard";
import { SendCard } from "./components/sendCard";
import { SettingsCard } from "./components/settingsCard";
import { SetupCard } from "./components/setupCard";
import { SupportCard } from "./components/supportCard";
import { WithdrawSaiDialog } from "./components/withdrawSai";
import { rootMachine } from "./state";
import { cleanWalletConnect, migrate, initWalletConnect } from "./utils";

const urls = {
  ethProviderUrl:
    process.env.REACT_APP_ETH_URL_OVERRIDE || `${window.location.origin}/api/ethprovider`,
  nodeUrl: process.env.REACT_APP_NODE_URL_OVERRIDE || `${window.location.origin}/api`,
  legacyUrl: chainId =>
    chainId.toString() === "1"
      ? "https://hub.connext.network/api/hub"
      : chainId.toString() === "4"
      ? "https://rinkeby.hub.connext.network/api/hub"
      : undefined,
  // pisaUrl: chainId =>
  //   chainId.toString() === "1"
  //     ? "https://connext.pisa.watch"
  //     : chainId.toString() === "4"
  //     ? "https://connext-rinkeby.pisa.watch"
  //     : undefined,
  pisaUrl: chainId => undefined,
};

// LogLevel for testing ChannelProvider
const LOG_LEVEL = 5;

// Constants for channel max/min - this is also enforced on the hub
const WITHDRAW_ESTIMATED_GAS = toBN("300000");
const DEPOSIT_ESTIMATED_GAS = toBN("25000");
const MAX_CHANNEL_VALUE = Currency.DAI("30");

// it is important to add a default payment
// profile on initial load in the case the
// user is being paid without depositing, or
// in the case where the user is redeeming a link

const style = withStyles(theme => ({
  paper: {
    width: "100%",
    padding: `0px ${theme.spacing(1)}px 0 ${theme.spacing(1)}px`,
    [theme.breakpoints.up("sm")]: {
      width: "450px",
      height: "650px",
      marginTop: "5%",
      borderRadius: "4px",
    },
    [theme.breakpoints.down(600)]: {
      "box-shadow": "0px 0px",
    },
  },
  app: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexGrow: 1,
    fontFamily: ["proxima-nova", "sans-serif"],
    backgroundColor: "#FFF",
    width: "100%",
    margin: "0px",
  },
  zIndex: 1000,
  grid: {},
}));

const ethProvider = new eth.providers.JsonRpcProvider(urls.ethProviderUrl);

class App extends React.Component {
  constructor(props) {
    super(props);
    const swapRate = "100.00";
    const machine = interpret(rootMachine);
    this.state = {
      balance: {
        channel: {
          ether: Currency.ETH("0", swapRate),
          token: Currency.DAI("0", swapRate),
          total: Currency.ETH("0", swapRate),
        },
        onChain: {
          ether: Currency.ETH("0", swapRate),
          token: Currency.DAI("0", swapRate),
          total: Currency.ETH("0", swapRate),
        },
      },
      ethProvider: new eth.providers.JsonRpcProvider(urls.ethProviderUrl),
      channel: null,
      machine,
      maxDeposit: null,
      minDeposit: null,
      network: {},
      useWalletConnext: false,
      saiBalance: Currency.DAI("0", swapRate),
      state: machine.initialState,
      swapRate,
      token: null,
    };
    this.refreshBalances.bind(this);
    this.autoDeposit.bind(this);
    this.autoSwap.bind(this);
    this.parseQRCode.bind(this);
    this.setWalletConnext.bind(this);
    this.getWalletConnext.bind(this);
  }

  // ************************************************* //
  //                     Hooks                         //
  // ************************************************* //

  setWalletConnext = useWalletConnext => {
    // clear any pre-existing sessions
    localStorage.removeItem("wcUri");
    localStorage.removeItem("walletconnect");
    // set wallet connext
    localStorage.setItem("useWalletConnext", !!useWalletConnext);
    this.setState({ useWalletConnext });
    window.location.reload();
  };

  // converts string value in localStorage to boolean
  getWalletConnext = () => {
    const wc = localStorage.getItem("useWalletConnext");
    return wc === "true";
  };

  initWalletConnext = chainId => {
    // item set when you scan a wallet connect QR
    // if a wc qr code has been scanned before, make
    // sure to init the mapping and create new wc
    // connector
    const uri = localStorage.getItem(`wcUri`);
    const { channel } = this.state;
    if (!channel) return;
    if (!uri) return;
    initWalletConnect(uri, channel, chainId);
  };

  // Channel doesn't get set up until after provider is set
  async componentDidMount() {
    const { machine } = this.state;
    machine.start();
    machine.onTransition(state => {
      this.setState({ state });
      console.log(
        `=== Transitioning to ${JSON.stringify(state.value)} (context: ${JSON.stringify(
          state.context,
        )})`,
      );
    });

    // If no mnemonic, create one and save to local storage
    let mnemonic = localStorage.getItem("mnemonic");
    const useWalletConnext = this.getWalletConnext() || false;
    console.debug("useWalletConnext: ", useWalletConnext);
    if (!mnemonic) {
      mnemonic = eth.Wallet.createRandom().mnemonic;
      localStorage.setItem("mnemonic", mnemonic);
    }

    let wallet;
    await ethProvider.ready;
    const network = await ethProvider.getNetwork();
    if (!useWalletConnext) {
      wallet = eth.Wallet.fromMnemonic(mnemonic).connect(ethProvider);
      this.setState({ network, wallet });
    }

    // migrate if needed
    if (wallet && localStorage.getItem("rpc-prod")) {
      machine.send(["MIGRATE", "START_MIGRATE"]);
      await migrate(urls.legacyUrl(network.chainId), wallet, urls.ethProviderUrl);
      localStorage.removeItem("rpc-prod");
    }

    machine.send("START");
    machine.send(["START", "START_START"]);

    // if choose mnemonic
    let channel;
    if (!useWalletConnext) {
      let store;
      const pisaUrl = urls.pisaUrl(network.chainId);
      if (pisaUrl) {
        console.log(`Using external state backup service: ${pisaUrl}`);
        const backupService = new PisaClientBackupAPI({
          wallet,
          pisaClient: new PisaClient(
            pisaUrl,
            "0xa4121F89a36D1908F960C2c9F057150abDb5e1E3", // TODO: Don't hardcode
          ),
        });
        store = new ConnextStore(StoreTypes.LocalStorage, { backupService });
      } else {
        store = new ConnextStore(StoreTypes.LocalStorage);
      }

      // If store has double prefixes, flush and restore
      for (const k of Object.keys(localStorage)) {
        if (k.includes(`${ConnextClientStorePrefix}:${ConnextClientStorePrefix}/`)) {
          store && (await store.reset());
          window.location.reload();
        }
      }

      const { privateKey } = eth.Wallet.fromMnemonic(mnemonic);
      channel = await connext.connect({
        ethProviderUrl: urls.ethProviderUrl,
        signer: privateKey,
        logLevel: LOG_LEVEL,
        nodeUrl: urls.nodeUrl,
        store,
      });
      console.log(`mnemonic address: ${wallet.address} (path: ${wallet.path})`);
    } else if (useWalletConnext) {
      const channelProvider = new WalletConnectChannelProvider();
      console.log(`Using WalletConnect with provider: ${JSON.stringify(channelProvider, null, 2)}`);
      await channelProvider.enable();
      console.log(
        `ChannelProvider Enabled - config: ${JSON.stringify(channelProvider.config, null, 2)}`,
      );
      // register channel provider listener for logging
      channelProvider.on("error", data => {
        console.error(`Channel provider error: ${JSON.stringify(data, null, 2)}`);
      });
      channelProvider.on("disconnect", (error, payload) => {
        if (error) {
          throw error;
        }
        cleanWalletConnect();
      });
      channel = await connext.connect({
        ethProviderUrl: urls.ethProviderUrl,
        logLevel: LOG_LEVEL,
        channelProvider,
      });
    } else {
      console.error("Could not create channel.");
      return;
    }
    console.log(`Successfully connected channel`);

    const token = new Contract(channel.config.contractAddresses.Token, tokenAbi, ethProvider);
    const swapRate = await channel.getLatestSwapRate(AddressZero, token.address);

    console.log(`Client created successfully!`);
    console.log(` - Public Identifier: ${channel.publicIdentifier}`);
    console.log(` - Account multisig address: ${channel.multisigAddress}`);
    console.log(` - Free balance address: ${channel.signerAddress}`);
    console.log(` - Token address: ${token.address}`);
    console.log(` - Swap rate: ${swapRate}`);

    channel.subscribeToSwapRates(AddressZero, token.address, res => {
      if (!res || !res.swapRate) return;
      console.log(`Got swap rate upate: ${this.state.swapRate} -> ${res.swapRate}`);
      this.setState({ swapRate: res.swapRate });
    });

    channel.on(EventNames.RECEIVE_TRANSFER_STARTED_EVENT, data => {
      console.log(`Received ${EventNames.RECEIVE_TRANSFER_STARTED_EVENT} event: `, data);
      machine.send("START_RECEIVE");
    });

    channel.on(EventNames.RECEIVE_TRANSFER_FINISHED_EVENT, data => {
      console.log(`Received ${EventNames.RECEIVE_TRANSFER_FINISHED_EVENT} event: `, data);
      machine.send("SUCCESS_RECEIVE");
    });

    channel.on(EventNames.RECEIVE_TRANSFER_FAILED_EVENT, data => {
      console.log(`Received ${EventNames.RECEIVE_TRANSFER_FAILED_EVENT} event: `, data);
      machine.send("ERROR_RECEIVE");
    });

    this.setState({
      channel,
      useWalletConnext,
      swapRate,
      token,
    });

    const saiBalance = Currency.DEI(await this.getSaiBalance(ethProvider), swapRate);
    if (saiBalance && saiBalance.wad.gt(0)) {
      this.setState({ saiBalance });
      machine.send("SAI");
    } else {
      machine.send("READY");
    }
    this.initWalletConnext(network.chainId);
    await this.startPoller();
  }

  getSaiBalance = async wallet => {
    const { channel } = this.state;
    if (!channel.config.contractAddresses.SAIToken) {
      return Zero;
    }
    const saiToken = new Contract(channel.config.contractAddresses.SAIToken, tokenAbi, wallet);
    const freeSaiBalance = await channel.getFreeBalance(saiToken.address);
    const mySaiBalance = freeSaiBalance[channel.signerAddress];
    return mySaiBalance;
  };


  requestDepositRights = async param =>  {
	console.log(">>> requestDepositRights called")
	const { channel } = this.state;
	let assetId = channel.config.contractAddresses.Token
	console.log(">>> requestDepositRights assetId", assetId)
	// to deposit ERC-20
	const requestRes = await channel.requestDepositRights({ assetId });

	// to deposit ETH
	//const requestRes = await channel.requestDepositRights({ AddressZero });
	console.log(">>> requestDepositRights res: ", requestRes)
  }

  //rescind deposit rights
  rescindDepositRights = async param =>  {
	console.log(">>> rescindDepositRights called")
	const { channel } = this.state;
	let assetId = channel.config.contractAddresses.Token
	console.log(">>> rescindDepositRights assetId", assetId)
	// to deposit ERC-20
	const rescindRes = await channel.rescindDepositRights({ assetId });

	// to deposit ETH
	//const rescindRes = await channel.rescindDepositRights({ AddressZero });
	console.log(">>> rescindDepositRights res: ", rescindRes)
  }
  // ************************************************* //
  //                    Pollers                        //
  // ************************************************* //

  // What's the minimum I need to be polling for here?
  //  - on-chain balance to see if we need to deposit
  //  - channel messages to see if there anything to sign
  //  - channel eth to see if I need to swap?
  startPoller = async () => {
    const { useWalletConnext } = this.state;
    await this.refreshBalances();
    if (!useWalletConnext) {
      await this.autoDeposit();
      await this.autoSwap();
    } else {
      console.log("Using wallet connext, turning off autodeposit");
    }
    interval(async (iteration, stop) => {
      await this.refreshBalances();
      if (!useWalletConnext) {
        await this.autoDeposit();
        await this.autoSwap();
      }
    }, 3000);
  };

  refreshBalances = async () => {
    const { channel, swapRate } = this.state;
    const { maxDeposit, minDeposit } = await this.getDepositLimits();
    this.setState({ maxDeposit, minDeposit });
    if (!channel || !swapRate) {
      return;
    }
    const balance = await this.getChannelBalances();
    this.setState({ balance });
  };

  getDepositLimits = async () => {
    const { swapRate } = this.state;
    let gasPrice = await ethProvider.getGasPrice();
    let totalDepositGasWei = DEPOSIT_ESTIMATED_GAS.mul(toBN(2)).mul(gasPrice);
    let totalWithdrawalGasWei = WITHDRAW_ESTIMATED_GAS.mul(gasPrice);
    const minDeposit = Currency.WEI(
      totalDepositGasWei.add(totalWithdrawalGasWei),
      swapRate,
    ).toETH();
    const maxDeposit = MAX_CHANNEL_VALUE.toETH(swapRate); // Or get based on payment profile?
    return { maxDeposit, minDeposit };
  };

  getChannelBalances = async () => {
    const { balance, channel, swapRate, token } = this.state;
    const getTotal = (ether, token) => Currency.WEI(ether.wad.add(token.toETH().wad), swapRate);
    const freeEtherBalance = await channel.getFreeBalance();
    const freeTokenBalance = await channel.getFreeBalance(token.address);
    balance.onChain.ether = Currency.WEI(
      await ethProvider.getBalance(channel.signerAddress),
      swapRate,
    ).toETH();
    balance.onChain.token = Currency.DEI(
      await token.balanceOf(channel.signerAddress),
      swapRate,
    ).toDAI();
    balance.onChain.total = getTotal(balance.onChain.ether, balance.onChain.token).toETH();
    balance.channel.ether = Currency.WEI(freeEtherBalance[channel.signerAddress], swapRate).toETH();
    balance.channel.token = Currency.DEI(freeTokenBalance[channel.signerAddress], swapRate).toDAI();
    balance.channel.total = getTotal(balance.channel.ether, balance.channel.token).toETH();
    const logIfNotZero = (wad, prefix) => {
      if (wad.isZero()) {
        return;
      }
      console.debug(`${prefix}: ${wad.toString()}`);
    };
    logIfNotZero(balance.onChain.token.wad, `chain token balance`);
    logIfNotZero(balance.onChain.ether.wad, `chain ether balance`);
    logIfNotZero(balance.channel.token.wad, `channel token balance`);
    logIfNotZero(balance.channel.ether.wad, `channel ether balance`);
    return balance;
  };

  autoDeposit = async () => {
    const {
      balance,
      channel,
      machine,
      maxDeposit,
      minDeposit,
      state,
      swapRate,
      token,
    } = this.state;
    if (!state.matches("ready")) {
      console.warn(`Channel not available yet.`);
      return;
    }
    if (
      state.matches("ready.deposit.pending") ||
      state.matches("ready.swap.pending") ||
      state.matches("ready.withdraw.pending")
    ) {
      console.warn(`Another operation is pending, waiting to autoswap`);
      return;
    }
    if (balance.onChain.ether.wad.eq(Zero)) {
      console.debug(`No on-chain eth to deposit`);
      return;
    }

    let nowMaxDeposit = maxDeposit.wad.sub(this.state.balance.channel.total.wad);
    if (nowMaxDeposit.lte(Zero)) {
      console.debug(
        `Channel balance (${balance.channel.total.toDAI().format()}) is at or above ` +
          `cap of ${maxDeposit.toDAI(swapRate).format()}`,
      );
      return;
    }

    if (balance.onChain.token.wad.gt(Zero) || balance.onChain.ether.wad.gt(minDeposit.wad)) {
      machine.send(["START_DEPOSIT"]);

      if (balance.onChain.token.wad.gt(Zero)) {
        const amount = minBN([
          Currency.WEI(nowMaxDeposit, swapRate).toDAI().wad,
          balance.onChain.token.wad,
        ]);
        const depositParams = {
          amount: amount.toString(),
          assetId: token.address,
        };
        console.log(
          `Depositing ${depositParams.amount} tokens into channel: ${channel.multisigAddress}`,
        );
        const result = await channel.deposit(depositParams);
        await this.refreshBalances();
        console.log(`Successfully deposited tokens! Result: ${JSON.stringify(result, null, 2)}`);
      } else {
        console.debug(`No tokens to deposit`);
      }

      nowMaxDeposit = maxDeposit.wad.sub(this.state.balance.channel.total.wad);
      if (nowMaxDeposit.lte(Zero)) {
        console.debug(
          `Channel balance (${balance.channel.total.toDAI().format()}) is at or above ` +
            `cap of ${maxDeposit.toDAI(swapRate).format()}`,
        );
        machine.send(["SUCCESS_DEPOSIT"]);
        return;
      }
      if (balance.onChain.ether.wad.lt(minDeposit.wad)) {
        console.debug(
          `Not enough on-chain eth to deposit: ${balance.onChain.ether.toETH().format()}`,
        );
        machine.send(["SUCCESS_DEPOSIT"]);
        return;
      }

      const amount = minBN([balance.onChain.ether.wad.sub(minDeposit.wad), nowMaxDeposit]);
      console.log(`Depositing ${amount} wei into channel: ${channel.multisigAddress}`);
      const result = await channel.deposit({ amount: amount.toString(), assetId: AddressZero });
      await this.refreshBalances();
      console.log(`Successfully deposited ether! Result: ${JSON.stringify(result, null, 2)}`);

      machine.send(["SUCCESS_DEPOSIT"]);
    }
  };

  autoSwap = async () => {
    const { balance, channel, machine, maxDeposit, state, swapRate, token } = this.state;
    if (!state.matches("ready")) {
      console.warn(`Channel not available yet.`);
      return;
    }
    if (
      state.matches("ready.deposit.pending") ||
      state.matches("ready.swap.pending") ||
      state.matches("ready.withdraw.pending")
    ) {
      console.warn(`Another operation is pending, waiting to autoswap`);
      return;
    }
    if (balance.channel.ether.wad.eq(Zero)) {
      console.debug(`No in-channel eth available to swap`);
      return;
    }
    if (balance.channel.token.wad.gte(maxDeposit.toDAI(swapRate).wad)) {
      console.debug(`Swap ceiling has been reached, no need to swap more`);
      return;
    }

    const maxSwap = tokenToWei(maxDeposit.toDAI().wad.sub(balance.channel.token.wad), swapRate);
    const availableWeiToSwap = minBN([balance.channel.ether.wad, maxSwap]);

    if (availableWeiToSwap.isZero()) {
      // can happen if the balance.channel.ether.wad is 1 due to rounding
      console.warn(`Will not exchange 0 wei. This is still weird, so here are some logs:`);
      console.warn(`   - maxSwap: ${maxSwap.toString()}`);
      console.warn(`   - swapRate: ${swapRate.toString()}`);
      console.warn(`   - balance.channel.ether.wad: ${balance.channel.ether.wad.toString()}`);
      return;
    }

    console.log(
      `Attempting to swap ${formatEther(availableWeiToSwap)} eth for ${formatEther(
        weiToToken(availableWeiToSwap, swapRate),
      )} dai at rate: ${swapRate}`,
    );
    machine.send(["START_SWAP"]);

    await channel.swap({
      amount: availableWeiToSwap,
      fromAssetId: AddressZero,
      swapRate,
      toAssetId: token.address,
    });
    await this.refreshBalances();
    machine.send(["SUCCESS_SWAP"]);
  };

  // ************************************************* //
  //                    Handlers                       //
  // ************************************************* //

  parseQRCode = data => {
    // potential URLs to scan and their params
    const urls = {
      "/send?": ["recipient", "amount"],
      "/redeem?": ["secret", "amountToken"],
    };
    let args = {};
    let path = null;
    for (const [url, fields] of Object.entries(urls)) {
      const strArr = data.split(url);
      if (strArr.length === 1) {
        // incorrect entry
        continue;
      }
      if (strArr[0] !== window.location.origin) {
        throw new Error("incorrect site");
      }
      // add the chosen url to the path scanned
      path = url + strArr[1];
      // get the args
      const params = strArr[1].split("&");
      fields.forEach((field, i) => {
        args[field] = params[i].split("=")[1];
      });
    }
    if (args === {}) {
      console.log("could not detect params");
    }
    return path;
  };

  render() {
    const {
      balance,
      channel,
      swapRate,
      machine,
      maxDeposit,
      minDeposit,
      network,
      saiBalance,
      state,
      token,
      wallet,
    } = this.state;
    const address = wallet ? wallet.address : channel ? channel.signerAddress : AddressZero;
    const { classes } = this.props;
    return (
      <Router>
        <Grid className={classes.app}>
          <Paper elevation={1} className={classes.paper}>
            <AppBarComponent address={address} />

            <MySnackbar
              variant="warning"
              openWhen={state.matches("migrate.pending.show")}
              onClose={() => machine.send("DISMISS_MIGRATE")}
              message="Migrating legacy channel to 2.0..."
              duration={30 * 60 * 1000}
            />
            <MySnackbar
              variant="info"
              openWhen={state.matches("start.pending.show")}
              onClose={() => machine.send("DISMISS_START")}
              message="Starting Channel Controllers..."
              duration={30 * 60 * 1000}
            />
            {saiBalance.wad.gt(0) ? (
              <WithdrawSaiDialog
                channel={channel}
                ethProvider={ethProvider}
                machine={machine}
                state={state}
                saiBalance={saiBalance}
              />
            ) : (
              <></>
            )}

            <Route
              exact
              path="/"
              render={props => (
                <Grid>
                  <Home
                    {...props}
                    balance={balance}
                    swapRate={swapRate}
                    parseQRCode={this.parseQRCode}
                    channel={channel}
                  />
                  <SetupCard {...props} minDeposit={minDeposit} maxDeposit={maxDeposit} />
                </Grid>
              )}
            />
            <Route
              path="/deposit"
              render={props => (
                <DepositCard
                  {...props}
                  address={address}
                  maxDeposit={maxDeposit}
                  minDeposit={minDeposit}
                />
              )}
            />
            <Route
              path="/settings"
              render={props => (
                <SettingsCard
                  {...props}
                  setWalletConnext={this.setWalletConnext}
                  getWalletConnext={this.getWalletConnext}
                  store={channel ? channel.store : undefined}
                  address={channel ? channel.publicIdentifier : "Unknown"}
                />
              )}
            />
            <Route
              path="/request"
              render={props => (
                <RequestCard
                  {...props}
                  publicId={channel ? channel.publicIdentifier : "Unknown"}
                  maxDeposit={maxDeposit}
                />
              )}
            />
            <Route
              path="/send"
              render={props => (
                <SendCard
                  {...props}
                  balance={balance}
                  channel={channel}
                  ethProvider={ethProvider}
                  token={token}
                />
              )}
            />
            <Route
              path="/redeem"
              render={props => <RedeemCard {...props} channel={channel} token={token} />}
            />
            <Route
              path="/cashout"
              render={props => (
                <CashoutCard
                  {...props}
                  balance={balance}
                  channel={channel}
                  ethProvider={ethProvider}
                  swapRate={swapRate}
                  machine={machine}
                  network={network}
                  refreshBalances={this.refreshBalances.bind(this)}
                  token={token}
                />
              )}
            />
            <Route path="/support" render={props => <SupportCard {...props} channel={channel} />} />
            <Confirmations machine={machine} network={network} state={state} />
			<Button
				disableTouchRipple
				className={classes.button}
				disabled={ false }
				fullWidth
				onClick={() => {
					this.requestDepositRights();
				}}
				size="large"
				variant="contained"
				>
				{ `Request Deposit Rights (Lock)`}
			</Button>
			<br/>
			<br/>
			<br/>
			<Button
				disableTouchRipple
				className={classes.button}
				disabled={ false }
				fullWidth
				onClick={() => {
					this.rescindDepositRights();
				}}
				size="large"
				variant="contained"
				>
				{ `Rescind Deposit Rights (Unlock)`}
			</Button>
          </Paper>
        </Grid>
      </Router>
    );
  }
}

export default style(App);
