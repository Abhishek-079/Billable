// Stellar helpers shared by browser and server code (no "use client" / "server-only").
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";

export const NETWORK_PASSPHRASE = Networks.TESTNET;

export function signWithKeypair(xdr: string, kp: Keypair): string {
  const tx = TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE);
  tx.sign(kp);
  return tx.toXDR();
}

// The transaction hash is a pure function of the transaction, so we can compute it from the
// signed XDR instead of relying on the shape of the escrow API's response.
export function txHashFromXdr(xdr: string): string {
  return TransactionBuilder.fromXDR(xdr, NETWORK_PASSPHRASE).hash().toString("hex");
}

export const HASH_RE = /^[0-9a-f]{64}$/;
