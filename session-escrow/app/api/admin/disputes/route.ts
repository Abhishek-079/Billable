import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { listAllDeals } from "@/lib/db";
import { limited } from "@/lib/ratelimit";

export async function GET(req: NextRequest) {
  if (limited(req, "admin", 20)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const deals = await listAllDeals();
  const disputes = deals.flatMap((d) =>
    d.milestones.flatMap((m, index) =>
      m.status === "disputed"
        ? [{
            dealId: d.id,
            index,
            dealTitle: d.title,
            milestoneTitle: m.title,
            amount: m.amount,
            contractorName: d.contractorName,
            clientName: d.clientName ?? "Client",
            evidence: m.evidence ?? "",
            contractId: d.contractId,
          }]
        : [],
    ),
  );
  return NextResponse.json({ disputes });
}
