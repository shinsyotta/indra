export const env = {
  ethProviderUrl: process.env.INDRA_ETH_RPC_URL!,
  nodeUrl: process.env.INDRA_NODE_URL!,
};

if (!env.ethProviderUrl) {
  throw new Error(`An INDRA_ETH_RPC_URL is required but was not provided.`);
}

if (!env.nodeUrl) {
  throw new Error(`An INDRA_NODE_URL is required but was not provided.`);
}
