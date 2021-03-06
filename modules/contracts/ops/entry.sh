#!/bin/bash
set -e

echo "Ethprovider entrypoint activated!"

dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )/.."
ganache="$dir/node_modules/.bin/ganache-cli"

mkdir -p /data

if [[ "$1" == "start" ]]
then
  echo "Starting Ganache.."
  exec $ganache \
    --db="/data" \
    --gasPrice="10000000000" \
    --host="0.0.0.0" \
    --mnemonic="$ETH_MNEMONIC" \
    --networkId="4447" \
    --port="8545" \
    --defaultBalanceEther="1000000000" # default 1bil ETH to each account $$$
elif [[ "$1" == "deploy" ]]
then
  echo "Deploying contracts.."
  if [[ "${ETH_PROVIDER#*://}" == "localhost"* ]]
  then
    echo "Starting Ganache.."
    $ganache \
      --db="/data" \
      --gasPrice="10000000000" \
      --host="0.0.0.0" \
      --mnemonic="$ETH_MNEMONIC" \
      --networkId="4447" \
      --port="8545" \
      --defaultBalanceEther="1000000000" \
       > $dir/.ganache.log &
    bash /wait-for.sh localhost:8545
  fi
  touch $dir/address-book.json
  node $dir/ops/migrate-contracts.js
else
  echo "Exiting. No command given, expected: start or deploy"
fi
