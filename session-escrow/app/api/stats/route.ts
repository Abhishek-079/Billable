import { NextRequest, NextResponse } from "next/server";
import { listAllDeals } from "@/lib/db";
import { limited } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

// Public, aggregate-only numbers. No names, addresses or deal links are exposed.
export async function GET(req: NextRequest) {
  if (limited(req, "stats", 60)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const deals = await listAllDeals();
  let milestones = 0, released = 0, resolved = 0, disputed = 0, usdcReleased = 0, usdcFunded = 0;
  const parties = new Set<string>();
  const recent: { at: number; amount: number; tx?: string }[] = [];
  for (const d of deals) {
    parties.add(d.contractorAddress);
    if (d.clientAddress) parties.add(d.clientAddress);
    for (const m of d.milestones) {
      milestones++;
      if (d.fundedAt) usdcFunded += m.amount;
      if (m.status === "disputed") disputed++;
      if (m.status === "released") {
        released++;
        usdcReleased += m.amount;
        recent.push({ at: m.releasedAt || 0, amount: m.amount, tx: m.releaseTx });
      }
      if (m.status === "resolved") {
        resolved++;
        usdcReleased += m.resolution?.toContractor || 0;
      }
    }
  }
  recent.sort((a, b) => b.at - a.at);
  return NextResponse.json({
    deals: deals.length,
    fundedDeals: deals.filter((d) => d.fundedAt).length,
    completedDeals: deals.filter((d) => d.status === "completed").length,
    milestones, released, resolved, disputed,
    usdcFunded: Math.round(usdcFunded * 100) / 100,
    usdcPaidToContractors: Math.round(usdcReleased * 100) / 100,
    users: parties.size,
    recent: recent.slice(0, 10),
  });
}
