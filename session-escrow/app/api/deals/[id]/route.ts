import { NextRequest, NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { getDeal, isHashUsed, mutateDeal } from "@/lib/db";
import { limited } from "@/lib/ratelimit";
import { getUsdcInr } from "@/lib/rate";
import { HASH_RE } from "@/lib/stellar";
import { isSettled, type Deal } from "@/lib/types";
import { checkTx, verifyMode, VerifyError } from "@/lib/verify";

type Ctx = { params: Promise<{ id: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const clean = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);

export async function GET(req: NextRequest, ctx: Ctx) {
  if (limited(req, "deal-get", 120)) return bad("Too many requests", 429);
  const { id } = await ctx.params;
  const deal = await getDeal(id);
  return deal ? NextResponse.json({ deal }) : bad("Deal not found", 404);
}

interface Step {
  action: string;
  address: string;
  index: number;
  hash?: string;
  unverified: boolean;
  evidence: string;
  name: string;
  contractId: string;
  rate: number | null;
}

// Who may do what, and how a deal changes. Throws to reject. Runs twice: once on a copy
// (before we spend a network call on verification) and once for real under the database lock.
function apply(d: Deal, s: Step) {
  const now = Date.now();
  const m = Number.isInteger(s.index) ? d.milestones[s.index] : undefined;
  const log = (text: string) => d.log.push({ at: now, text, hash: s.hash, ...(s.unverified ? { unverified: true } : {}) });
  switch (s.action) {
    case "accept": {
      if (d.status !== "draft") throw new Error("Deal already accepted");
      if (s.address === d.contractorAddress) throw new Error("The contractor can't fund their own deal");
      if (!s.contractId) throw new Error("contractId required");
      d.clientAddress = s.address;
      d.clientName = s.name || "Client";
      d.contractId = s.contractId;
      d.fundTx = s.hash;
      d.fundedAt = now;
      d.status = "active";
      log(`${d.clientName} funded the escrow`);
      break;
    }
    case "deliver": {
      if (s.address !== d.contractorAddress) throw new Error("Only the contractor can mark work delivered");
      if (!m || m.status !== "pending") throw new Error("Milestone can't be delivered now");
      m.status = "delivered";
      m.evidence = s.evidence;
      m.deliveredAt = now;
      log(`Milestone ${s.index + 1} delivered`);
      break;
    }
    case "approve": {
      if (s.address !== d.clientAddress) throw new Error("Only the client can approve");
      if (!m || m.status !== "delivered") throw new Error("Milestone isn't awaiting approval");
      m.status = "approved";
      m.approvedAt = now;
      log(`Milestone ${s.index + 1} approved`);
      break;
    }
    case "release": {
      if (s.address !== d.clientAddress) throw new Error("Only the client can release");
      if (!m || m.status !== "approved") throw new Error("Milestone isn't approved yet");
      m.status = "released";
      m.releasedAt = now;
      m.releaseTx = s.hash;
      m.inrRate = s.rate;
      log(`Milestone ${s.index + 1} paid: ${m.amount} USDC`);
      if (d.milestones.every(isSettled)) d.status = "completed";
      break;
    }
    case "dispute": {
      if (s.address !== d.clientAddress && s.address !== d.contractorAddress) throw new Error("Not a party to this deal");
      if (!m || !["pending", "delivered", "approved"].includes(m.status)) throw new Error("Milestone can't be disputed now");
      m.status = "disputed";
      log(`Milestone ${s.index + 1} disputed`);
      break;
    }
    default:
      throw new Error("Unknown action");
  }
}

// Mirrors an on-chain step into our records. The chain holds the money; this stores who did what.
// Each step must carry the hash of a real transaction, which we check on the network (see lib/verify.ts).
export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (limited(req, "deal-patch", 60)) return bad("Too many requests", 429);
  const { id } = await ctx.params;
  const b = await req.json().catch(() => null);
  if (!b) return bad("Invalid JSON");
  const address = clean(b.address, 80);
  if (!StrKey.isValidEd25519PublicKey(address)) return bad("Valid address required");

  const rawHash = b.hash ? clean(b.hash, 80).toLowerCase() : undefined;
  if (rawHash && !HASH_RE.test(rawHash)) return bad("Invalid transaction hash");

  const deal = await getDeal(id);
  if (!deal) return bad("Deal not found", 404);

  const step: Step = {
    action: clean(b.action, 20),
    address,
    index: Number(b.index),
    hash: rawHash,
    unverified: false,
    evidence: clean(b.evidence, 500),
    name: clean(b.name, 80),
    contractId: clean(b.contractId, 80),
    rate: null,
  };

  try {
    apply(structuredClone(deal), step); // cheap permission check before any network call

    if (rawHash && verifyMode() !== "off" && (await isHashUsed(rawHash)))
      return bad("That transaction was already recorded", 409);
    const { unverified } = await checkTx({
      hash: rawHash,
      address,
      contractId: step.action === "accept" ? step.contractId : deal.contractId,
    });
    step.unverified = unverified;
    if (step.action === "release") step.rate = await getUsdcInr();

    const updated = await mutateDeal(id, (d) => apply(d, step));
    return updated ? NextResponse.json({ deal: updated }) : bad("Deal not found", 404);
  } catch (e: any) {
    return bad(e?.message || "Update failed", e instanceof VerifyError ? 422 : 409);
  }
}
