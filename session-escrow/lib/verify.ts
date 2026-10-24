import "server-only";
import { Address, FeeBumpTransaction, Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { HASH_RE, NETWORK_PASSPHRASE } from "./stellar";

// Confirms on the network that a transaction the browser says happened really happened, was signed
// by the wallet making the claim, and touched this deal's escrow contract. Without this, anyone who
// knows a wallet address could send fake "approved" or "released" updates to our records.

const HORIZON = process.env.HORIZON_URL || "https://horizon-testnet.stellar.org";
const MAX_AGE_MS = Number(process.env.VERIFY_MAX_AGE_MS ?? 15 * 60_000);
const POLL_MS = Number(process.env.VERIFY_POLL_MS ?? 1500);
const POLL_TRIES = Number(process.env.VERIFY_POLL_TRIES ?? 8);

export class VerifyError extends Error {}

export type VerifyMode = "strict" | "warn" | "off";

// strict: reject anything we can't confirm (default in production)
// warn:   record it, flag it as unverified and log why (default in development)
// off:    skip checks entirely
export function verifyMode(): VerifyMode {
  const v = process.env.VERIFY_TX;
  if (v === "strict" || v === "warn" || v === "off") return v;
  return process.env.NODE_ENV === "production" ? "strict" : "warn";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchTx(hash: string): Promise<any> {
  for (let i = 0; i < POLL_TRIES; i++) {
    let res: Response | null = null;
    try {
      res = await fetch(`${HORIZON}/transactions/${hash}`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    } catch {}
    if (res?.ok) return res.json();
    if (res && res.status !== 404) throw new VerifyError(`Network lookup failed (${res.status})`);
    if (i < POLL_TRIES - 1) await sleep(POLL_MS); // the network can take a few seconds to show a new transaction
  }
  throw new VerifyError("Transaction not found on the network");
}

function invokedContract(op: any): string | null {
  if (op?.type !== "invokeHostFunction") return null;
  try {
    const fn = op.func;
    if (fn.switch().name !== "hostFunctionTypeInvokeContract") return null;
    return Address.fromScAddress(fn.invokeContract().contractAddress()).toString();
  } catch {
    return null;
  }
}

export async function verifyTx(hash: string, address: string, contractId?: string): Promise<void> {
  if (!HASH_RE.test(hash)) throw new VerifyError("Invalid transaction hash");
  const tx = await fetchTx(hash);
  if (tx.successful !== true) throw new VerifyError("That transaction failed on the network");

  const age = Date.now() - Date.parse(tx.created_at);
  if (!(age <= MAX_AGE_MS && age >= -5 * 60_000)) throw new VerifyError("That transaction is too old to count for this step");

  const parsed = TransactionBuilder.fromXDR(tx.envelope_xdr, NETWORK_PASSPHRASE);
  const inner = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed;
  const kp = Keypair.fromPublicKey(address);
  const digest = inner.hash();
  const signed = inner.signatures.some((sig) => {
    try {
      return kp.verify(digest, sig.signature());
    } catch {
      return false;
    }
  });
  if (!signed) throw new VerifyError("That transaction wasn't signed by this wallet");

  if (contractId && !inner.operations.some((op) => invokedContract(op) === contractId))
    throw new VerifyError("That transaction isn't for this deal's escrow contract");
}

// Applies the configured mode. Returns { unverified } or throws VerifyError (strict mode only).
export async function checkTx(opts: { hash?: string; address: string; contractId?: string }): Promise<{ unverified: boolean }> {
  const mode = verifyMode();
  if (mode === "off") return { unverified: true };
  try {
    if (!opts.hash) throw new VerifyError("Transaction hash required");
    await verifyTx(opts.hash, opts.address, opts.contractId);
    return { unverified: false };
  } catch (e: any) {
    if (mode === "strict") throw e instanceof VerifyError ? e : new VerifyError("Could not verify the transaction");
    console.warn(`[verify] accepted unverified transaction (${opts.hash ?? "no hash"}): ${e?.message}`);
    return { unverified: true };
  }
}
