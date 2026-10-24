import { NextRequest, NextResponse } from "next/server";
import { isAdmin, platformKeypair } from "@/lib/admin";
import { getDeal, mutateDeal } from "@/lib/db";
import { limited } from "@/lib/ratelimit";
import { getUsdcInr } from "@/lib/rate";
import { signWithKeypair, txHashFromXdr } from "@/lib/stellar";
import { twPost } from "@/lib/tw-server";
import { isSettled } from "@/lib/types";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const amountOf = (v: unknown) => Math.round(Number(v) * 1e7) / 1e7;

// Splits a disputed milestone's funds between contractor and client. The platform account signs.
export async function POST(req: NextRequest) {
  if (limited(req, "admin", 20)) return bad("Too many requests", 429);
  if (!isAdmin(req)) return bad("Unauthorized", 401);

  const b = await req.json().catch(() => null);
  if (!b) return bad("Invalid JSON");
  const index = Number(b.index);
  const toContractor = amountOf(b.toContractor);
  const toClient = amountOf(b.toClient);
  if (![toContractor, toClient].every((n) => Number.isFinite(n) && n >= 0) || toContractor + toClient <= 0)
    return bad("Enter amounts of 0 or more that add up to more than 0");

  const deal = await getDeal(String(b.dealId || ""));
  if (!deal || !deal.contractId || !deal.clientAddress) return bad("Deal not found", 404);
  const m = Number.isInteger(index) ? deal.milestones[index] : undefined;
  if (!m || m.status !== "disputed") return bad("That milestone isn't in dispute", 409);
  if (toContractor + toClient > m.amount + 1e-7) return bad(`Amounts can't add up to more than the milestone (${m.amount} USDC)`);

  try {
    const kp = platformKeypair();
    const distributions = [
      { address: deal.contractorAddress, amount: toContractor },
      { address: deal.clientAddress, amount: toClient },
    ].filter((x) => x.amount > 0);

    const unsigned = await twPost("escrow/multi-release/resolve-milestone-dispute", {
      contractId: deal.contractId,
      disputeResolver: kp.publicKey(),
      milestoneIndex: String(index),
      distributions,
    });
    const unsignedXdr = unsigned?.unsignedTransaction ?? unsigned?.xdr;
    if (typeof unsignedXdr !== "string") throw new Error("The escrow service returned no transaction to sign");
    const signedXdr = signWithKeypair(unsignedXdr, kp);
    await twPost("helper/send-transaction", { signedXdr });
    const hash = txHashFromXdr(signedXdr);
    const rate = toContractor > 0 ? await getUsdcInr() : null;

    const updated = await mutateDeal(deal.id, (d) => {
      const mm = d.milestones[index];
      if (!mm || mm.status !== "disputed") throw new Error("That milestone isn't in dispute");
      mm.status = "resolved";
      mm.resolution = { toContractor, toClient, at: Date.now(), tx: hash, inrRate: rate };
      d.log.push({
        at: Date.now(),
        text: `Dispute on milestone ${index + 1} resolved: ${toContractor} USDC to ${d.contractorName}, ${toClient} USDC back to ${d.clientName ?? "client"}`,
        hash,
      });
      if (d.milestones.every(isSettled)) d.status = "completed";
    });
    return NextResponse.json({ deal: updated, hash });
  } catch (e: any) {
    return bad(e?.message || "Could not resolve the dispute", 502);
  }
}
