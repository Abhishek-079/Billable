// One-shot testnet setup for the platform account (fee receiver + dispute resolver):
// creates it, funds it with test XLM, adds the USDC trustline, and writes
// NEXT_PUBLIC_PLATFORM_ADDRESS into .env.local (replacing any existing line).
// The secret is saved to .platform-secret. Keep it private and never commit it.
// Run again any time: it reuses the saved secret, so the address stays the same.
import fs from "fs";
import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const ENV = ".env.local";
const SECRET_FILE = ".platform-secret";

let env = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : "";
const issuer = (env.match(/^NEXT_PUBLIC_USDC_ISSUER=(\S+)/m) || [])[1];
if (!issuer) throw new Error("NEXT_PUBLIC_USDC_ISSUER is missing from .env.local. Run: cp .env.example .env.local");

const kp = fs.existsSync(SECRET_FILE)
  ? Keypair.fromSecret(fs.readFileSync(SECRET_FILE, "utf8").trim())
  : Keypair.random();
fs.writeFileSync(SECRET_FILE, kp.secret() + "\n", { mode: 0o600 });
const address = kp.publicKey();

const fb = await fetch("https://friendbot.stellar.org?addr=" + address);
if (!fb.ok && fb.status !== 400) throw new Error("Friendbot failed with status " + fb.status);

const server = new Horizon.Server("https://horizon-testnet.stellar.org");
let account;
for (let i = 0; i < 10 && !account; i++) {
  try {
    account = await server.loadAccount(address);
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
  }
}
if (!account) throw new Error("The account isn't visible on the network yet. Run this script again.");

const hasUsdc = account.balances.some((b) => b.asset_code === "USDC" && b.asset_issuer === issuer);
if (!hasUsdc) {
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.changeTrust({ asset: new Asset("USDC", issuer) }))
    .setTimeout(60)
    .build();
  tx.sign(kp);
  await server.submitTransaction(tx);
}

env = env
  .split("\n")
  .filter((l) => !l.startsWith("NEXT_PUBLIC_PLATFORM_ADDRESS="))
  .join("\n")
  .replace(/\n*$/, "\n");
env += "NEXT_PUBLIC_PLATFORM_ADDRESS=" + address + "\n";
fs.writeFileSync(ENV, env);

console.log("Platform account ready: " + address);
console.log("USDC trustline: " + (hasUsdc ? "already there" : "added"));
console.log("Secret saved in .platform-secret (keep it private).");
