"use client";

// Trustless Work REST client (multi-release escrow: every milestone pays out on its own),
// called through our /api/tw proxy. Each write returns an unsigned XDR, the wallet signs it,
// and /helper/send-transaction submits it. Shapes follow the Swagger examples.
// Spots still unconfirmed against a live call are marked VERIFY.

import { PLATFORM_ADDRESS, PLATFORM_FEE, USDC } from "./config";
import { HASH_RE, txHashFromXdr } from "./stellar";
import { dealTotal, type Deal } from "./types";
import type { Wallet } from "./wallet";

async function api<T = any>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/tw/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || json?.raw || res.statusText;
    throw new Error(`${path}: ${Array.isArray(msg) ? msg.join(", ") : msg}`);
  }
  return json as T;
}

const unsignedOf = (r: any): string => {
  const x = r?.unsignedTransaction ?? r?.unsigned_transaction ?? r?.xdr; // confirmed: unsignedTransaction
  if (typeof x !== "string") throw new Error(`No unsigned XDR in response: ${JSON.stringify(r).slice(0, 200)}`);
  return x;
};

export interface SendResult {
  contractId?: string;
  hash?: string;
  raw: any;
}

async function signAndSend(unsignedResponse: any, wallet: Wallet): Promise<SendResult> {
  const signedXdr = wallet.signXdr(unsignedOf(unsignedResponse));
  const raw = await api("POST", "helper/send-transaction", { signedXdr });
  // The hash is computed from what we signed, so it doesn't depend on the API's response shape.
  // If the API reports a (valid) hash of its own, prefer that.
  const reported = [raw?.hash, raw?.txHash, raw?.transactionHash].find((h) => typeof h === "string" && HASH_RE.test(h));
  return {
    // VERIFY: where contractId lives in the send response.
    contractId: raw?.contractId ?? raw?.escrow?.contractId,
    hash: reported ?? txHashFromXdr(signedXdr),
    raw,
  };
}

// Client deploys the escrow, then funds it with the full deal amount (two signatures).
export async function deployAndFund(client: Wallet, deal: Deal) {
  if (!PLATFORM_ADDRESS)
    throw new Error("NEXT_PUBLIC_PLATFORM_ADDRESS is not set. Run `npm run platform-key` and add it to .env.local.");

  const deployed = await signAndSend(
    await api("POST", "deployer/multi-release", {
      signer: client.address,
      engagementId: `deal-${deal.id}`,
      title: deal.title,
      description: deal.description || deal.title,
      roles: {
        approver: client.address,
        serviceProvider: deal.contractorAddress,
        platformAddress: PLATFORM_ADDRESS,
        releaseSigner: client.address,
        disputeResolver: PLATFORM_ADDRESS,
      },
      platformFee: PLATFORM_FEE,
      milestones: deal.milestones.map((m) => ({
        description: m.title,
        amount: m.amount,
        receiver: deal.contractorAddress,
      })),
      trustline: { symbol: USDC.symbol, address: USDC.address },
    }),
    client,
  );
  if (!deployed.contractId)
    throw new Error(`Escrow deployed but no contractId was returned: ${JSON.stringify(deployed.raw).slice(0, 200)}`);

  const funded = await signAndSend(
    await api("POST", "escrow/multi-release/fund-escrow", {
      contractId: deployed.contractId,
      signer: client.address,
      amount: dealTotal(deal),
    }),
    client,
  );
  return { contractId: deployed.contractId, hash: funded.hash ?? deployed.hash };
}

export async function markDelivered(contractor: Wallet, deal: Deal, index: number, evidence: string) {
  return signAndSend(
    await api("POST", "escrow/multi-release/change-milestone-status", {
      contractId: deal.contractId,
      milestoneIndex: String(index),
      newStatus: "Completed",
      newEvidence: evidence || "Delivered",
      serviceProvider: contractor.address,
    }),
    contractor,
  );
}

export async function approveMilestone(client: Wallet, deal: Deal, index: number) {
  return signAndSend(
    await api("POST", "escrow/multi-release/approve-milestone", {
      contractId: deal.contractId,
      milestoneIndex: String(index),
      approver: client.address,
    }),
    client,
  );
}

export async function releaseMilestone(client: Wallet, deal: Deal, index: number) {
  return signAndSend(
    await api("POST", "escrow/multi-release/release-milestone-funds", {
      contractId: deal.contractId,
      releaseSigner: client.address,
      milestoneIndex: String(index),
    }),
    client,
  );
}

export async function disputeMilestone(party: Wallet, deal: Deal, index: number) {
  return signAndSend(
    await api("POST", "escrow/multi-release/dispute-milestone", {
      contractId: deal.contractId,
      milestoneIndex: String(index),
      signer: party.address,
    }),
    party,
  );
}
