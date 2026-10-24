import { NextRequest, NextResponse } from "next/server";
import { getDeal } from "@/lib/db";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; index: string }> }) {
  const { id, index } = await ctx.params;
  const deal = await getDeal(id);
  const i = Number(index);
  const m = deal && Number.isInteger(i) ? deal.milestones[i] : undefined;
  if (!deal || !m || m.status !== "released")
    return new NextResponse("Invoice is available once the milestone has been paid.", { status: 404 });

  const date = new Date(m.releasedAt!).toISOString().slice(0, 10);
  const no = `INV-${deal.id.slice(0, 6).toUpperCase()}-${i + 1}`;
  const inr = m.inrRate ? (m.amount * m.inrRate).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : null;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(no)}</title>
<style>
  body{font:15px/1.5 system-ui,sans-serif;color:#1b1b18;max-width:680px;margin:40px auto;padding:0 20px}
  h1{font-size:22px;margin:0}.muted{color:#6b6b63}.row{display:flex;justify-content:space-between;gap:24px;margin:24px 0}
  table{width:100%;border-collapse:collapse;margin-top:8px}td,th{padding:10px 0;border-bottom:1px solid #e4e3dc;text-align:left}
  td:last-child,th:last-child{text-align:right}.mono{font:12px ui-monospace,monospace;word-break:break-all}
  .total td{font-weight:600;border-bottom:none}.note{font-size:12.5px;color:#6b6b63;margin-top:32px}
  button{margin-top:24px;padding:8px 14px;font:inherit}@media print{button{display:none}}
</style></head><body>
<h1>Invoice ${esc(no)}</h1><div class="muted">Date paid: ${esc(date)}</div>
<div class="row">
  <div><div class="muted">From</div><strong>${esc(deal.contractorName)}</strong><div class="mono">${esc(deal.contractorAddress)}</div></div>
  <div><div class="muted">To</div><strong>${esc(deal.clientName || "Client")}</strong><div class="mono">${esc(deal.clientAddress || "")}</div></div>
</div>
<table>
  <tr><th>Description</th><th>Amount (USDC)</th></tr>
  <tr><td>${esc(deal.title)}: ${esc(m.title)}</td><td>${m.amount.toFixed(2)}</td></tr>
  <tr class="total"><td>Total paid</td><td>${m.amount.toFixed(2)} USDC</td></tr>
</table>
<p>${inr ? `Value in INR on ${esc(date)}: <strong>₹${inr}</strong> <span class="muted">(rate ₹${m.inrRate!.toFixed(2)} per USDC)</span>` : `<span class="muted">INR rate was unavailable when this payment was recorded.</span>`}</p>
<p class="muted">Paid in USDC on the Stellar network.<br>Transaction: <span class="mono">${esc(m.releaseTx || "n/a")}</span><br>Escrow contract: <span class="mono">${esc(deal.contractId || "n/a")}</span></p>
<p class="note">This is a payment record, not a GST tax invoice. Check with your accountant how to report crypto income.</p>
<button onclick="window.print()">Print or save as PDF</button>
</body></html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
