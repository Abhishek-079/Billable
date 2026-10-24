"use client";

// One testnet demo wallet per browser, kept in localStorage so the whole flow runs with no
// extension. The rest of the app only needs `address` and `signXdr`, so this file is the
// single place to swap in Privy (email login) or Freighter later.

import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { FRIENDBOT_URL, HORIZON_URL, USDC } from "./config";
import { signWithKeypair } from "./stellar";

export interface Wallet {
  address: string;
  signXdr: (xdr: string) => string;
}

const SECRET_KEY = "se_wallet_secret";
const NAME_KEY = "se_display_name";
const server = () => new Horizon.Server(HORIZON_URL);

function keypair(): Keypair {
  let secret: string | null = null;
  try {
    secret = localStorage.getItem(SECRET_KEY);
  } catch {}
  if (secret) return Keypair.fromSecret(secret);
  const kp = Keypair.random();
  try {
    localStorage.setItem(SECRET_KEY, kp.secret());
  } catch {}
  return kp;
}

export function getWallet(): Wallet {
  const kp = keypair();
  return { address: kp.publicKey(), signXdr: (xdr) => signWithKeypair(xdr, kp) };
}

export function resetWallet() {
  try {
    localStorage.removeItem(SECRET_KEY);
  } catch {}
}

export const getName = () => {
  try {
    return localStorage.getItem(NAME_KEY) || "";
  } catch {
    return "";
  }
};
export const setName = (n: string) => {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {}
};

export async function fundWithFriendbot(address: string) {
  const res = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(address)}`);
  if (!res.ok && res.status !== 400) throw new Error(`Friendbot failed (${res.status})`);
}

export async function addUsdcTrustline() {
  const kp = keypair();
  const s = server();
  const account = await s.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.changeTrust({ asset: new Asset(USDC.symbol, USDC.address) }))
    .setTimeout(60)
    .build();
  tx.sign(kp);
  await s.submitTransaction(tx);
}

export interface Balances {
  xlm: string;
  usdc: string | null; // null = no trustline yet
  exists: boolean;
}

export async function getBalances(address: string): Promise<Balances> {
  try {
    const acc = await server().loadAccount(address);
    const xlm = acc.balances.find((b) => b.asset_type === "native")?.balance ?? "0";
    const usdc =
      acc.balances.find(
        (b) => "asset_code" in b && b.asset_code === USDC.symbol && b.asset_issuer === USDC.address,
      )?.balance ?? null;
    return { xlm, usdc, exists: true };
  } catch {
    return { xlm: "0", usdc: null, exists: false };
  }
}
