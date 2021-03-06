import { getAddress, recoverAddress, Signature } from "ethers/utils";

import { EthereumCommitment } from "../../types";

export function assertIsValidSignature(
  expectedSigner: string,
  commitment?: EthereumCommitment,
  signature?: Signature,
) {
  if (commitment === undefined) {
    throw Error("assertIsValidSignature received an undefined commitment");
  }

  if (signature === undefined) {
    throw Error("assertIsValidSignature received an undefined signature");
  }

  // recoverAddress: 83 ms, hashToSign: 7 ms
  const signer = recoverAddress(commitment.hashToSign(), signature);

  if (getAddress(expectedSigner) !== signer) {
    throw Error(
      `Validating a signature with expected signer ${expectedSigner} but recovered ${signer} for commitment hash ${commitment.hashToSign()}.`,
    );
  }
}
