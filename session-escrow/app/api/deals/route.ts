import { NextRequest, NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { createDeal, listDealsFor, newId } from "@/lib/db";
import { limited } from "@/lib/ratelimit";
import type { Deal } from "@/lib/types";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const clean = (s: unknown, max: number) => String(s ?? "").trim().slice(0, max);

export async function GET(req: NextRequest) {
  if (limited(req, "deals-list", 60)) return bad("Too many requests", 429);
  const address = req.nextUrl.searchParams.get("address") || "";
  if (!StrKey.isValidEd25519PublicKey(address)) return bad("Valid address required");
  return NextResponse.json({ deals: await listDealsFor(address) });
}

export async function POST(req: NextRequest) {
  if (limited(req, "deals-create", 15)) return bad("Too many requests, try again in a minute", 429);
  const b = await req.json().catch(() => null);
  if (!b) return bad("Invalid JSON");
  const contractorAddress = clean(b.contractorAddress, 80);
  if (!StrKey.isValidEd25519PublicKey(contractorAddress)) return bad("Valid contractor address required");
  const title = clean(b.title, 120);
  if (!title) return bad("Title required");
  if (!Array.isArray(b.milestones) || b.milestones.length < 1 || b.milestones.length > 20)
    return bad("Add between 1 and 20 milestones");

  const milestones = [];
  for (const m of b.milestones) {
    const mt = clean(m?.title, 120);
    const amount = Number(m?.amount);
    if (!mt) return bad("Every milestone needs a title");
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return bad("Every milestone needs an amount above 0");
    milestones.push({ title: mt, amount: Math.round(amount * 1e7) / 1e7, status: "pending" as const });
  }

  const deal: Deal = {
    id: newId(),
    title,
    description: clean(b.description, 1000),
    contractorName: clean(b.contractorName, 80) || "Contractor",
    contractorAddress,
    milestones,
    status: "draft",
    createdAt: Date.now(),
    log: [{ at: Date.now(), text: "Deal created" }],
  };
  await createDeal(deal);
  return NextResponse.json({ deal }, { status: 201 });
}
