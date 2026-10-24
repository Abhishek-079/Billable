import { NextRequest, NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { listDealsFor } from "@/lib/db";
import { limited } from "@/lib/ratelimit";

// Spreadsheet formulas in user-supplied text can run when a CSV is opened, so neutralise them.
const cell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

export async function GET(req: NextRequest) {
  if (limited(req, "records", 30)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const address = req.nextUrl.searchParams.get("address") || "";
  const role = req.nextUrl.searchParams.get("role") === "client" ? "client" : "contractor";
  if (!StrKey.isValidEd25519PublicKey(address)) return NextResponse.json({ error: "Valid address required" }, { status: 400 });

  const deals = await listDealsFor(address);
  const rows: string[][] = [];
  for (const d of deals) {
    if ((role === "contractor" ? d.contractorAddress : d.clientAddress) !== address) continue;
    const other = role === "contractor" ? d.clientName || "" : d.contractorName;
    const inv = (i: number) => `INV-${d.id.slice(0, 6).toUpperCase()}-${i + 1}`;
    const row = (at: number, i: number, label: string, amount: number, rate: number | null | undefined, tx?: string) =>
      rows.push([
        new Date(at).toISOString().slice(0, 10),
        inv(i),
        d.title,
        label,
        other,
        amount.toFixed(2),
        rate ? rate.toFixed(2) : "rate unavailable",
        rate ? (amount * rate).toFixed(2) : "",
        tx || "",
      ]);

    d.milestones.forEach((m, i) => {
      if (m.status === "released") row(m.releasedAt!, i, m.title, m.amount, m.inrRate, m.releaseTx);
      // A dispute settlement pays the contractor part of the milestone. The refunded part isn't income.
      if (m.status === "resolved" && m.resolution && m.resolution.toContractor > 0)
        row(m.resolution.at, i, `${m.title} (dispute settlement)`, m.resolution.toContractor, m.resolution.inrRate, m.resolution.tx);
    });
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));

  const header = ["Date", "Invoice", "Deal", "Milestone", role === "contractor" ? "Client" : "Contractor", "USDC", "INR per USDC", "INR value", "Transaction"];
  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payments-${role}.csv"`,
    },
  });
}
