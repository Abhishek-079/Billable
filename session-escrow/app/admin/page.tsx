"use client";

import { useCallback, useEffect, useState } from "react";

interface Dispute {
  dealId: string;
  index: number;
  dealTitle: string;
  milestoneTitle: string;
  amount: number;
  contractorName: string;
  clientName: string;
  evidence: string;
}

const TOKEN_KEY = "se_admin_token";

export default function Admin() {
  const [token, setToken] = useState("");
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [split, setSplit] = useState<Record<string, { c: string; k: string }>>({});

  const load = useCallback(async (t: string) => {
    setError(null);
    const res = await fetch("/api/admin/disputes", { headers: { "x-admin-token": t }, cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDisputes(null);
      setError(body.error || res.statusText);
      return;
    }
    setDisputes(body.disputes);
    try {
      sessionStorage.setItem(TOKEN_KEY, t);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const t = sessionStorage.getItem(TOKEN_KEY);
      if (t) {
        setToken(t);
        load(t);
      }
    } catch {}
  }, [load]);

  const key = (d: Dispute) => `${d.dealId}:${d.index}`;
  const get = (d: Dispute) => split[key(d)] ?? { c: "", k: "" };
  const set = (d: Dispute, patch: Partial<{ c: string; k: string }>) =>
    setSplit((s) => ({ ...s, [key(d)]: { ...get(d), ...patch } }));

  const resolve = async (d: Dispute) => {
    const v = get(d);
    if (!confirm(`Send ${v.c || 0} USDC to ${d.contractorName} and ${v.k || 0} USDC to ${d.clientName}? This can't be undone.`)) return;
    setBusy(key(d));
    setError(null);
    try {
      const res = await fetch("/api/admin/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ dealId: d.dealId, index: d.index, toContractor: Number(v.c || 0), toClient: Number(v.k || 0) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || res.statusText);
      await load(token);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <h1>Dispute resolution</h1>
      <p className="sub">Platform admins only. Decide how a disputed milestone's funds are split.</p>

      <h2>Admin token</h2>
      <div className="card row">
        <input
          type="password"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="ADMIN_TOKEN from the server settings"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <button className="primary" onClick={() => load(token)}>Load disputes</button>
      </div>
      {error && <p className="err">{error}</p>}

      {disputes && (
        <>
          <h2>Open disputes ({disputes.length})</h2>
          {disputes.length === 0 && <p className="muted">Nothing to resolve.</p>}
          {disputes.map((d) => (
            <div className="card" key={key(d)} style={{ marginBottom: 12 }}>
              <div className="title">{d.dealTitle}: {d.milestoneTitle}</div>
              <div className="muted">
                {d.amount} USDC · {d.contractorName} (contractor) vs {d.clientName} (client)
              </div>
              {d.evidence && <div className="muted" style={{ fontSize: 13 }}>Delivery note: {d.evidence}</div>}
              <div className="row" style={{ marginTop: 10 }}>
                <input style={{ width: 110 }} inputMode="decimal" placeholder="to contractor" value={get(d).c} onChange={(e) => set(d, { c: e.target.value })} />
                <input style={{ width: 110 }} inputMode="decimal" placeholder="to client" value={get(d).k} onChange={(e) => set(d, { k: e.target.value })} />
                <button onClick={() => setSplit((s) => ({ ...s, [key(d)]: { c: "0", k: String(d.amount) } }))}>Refund client</button>
                <button onClick={() => setSplit((s) => ({ ...s, [key(d)]: { c: String(d.amount), k: "0" } }))}>Pay contractor</button>
                <button onClick={() => setSplit((s) => ({ ...s, [key(d)]: { c: String(d.amount / 2), k: String(d.amount / 2) } }))}>50/50</button>
                <button className="primary" disabled={busy === key(d)} onClick={() => resolve(d)}>
                  {busy === key(d) ? "Working…" : "Resolve"}
                </button>
              </div>
              <p className="muted" style={{ fontSize: 12.5, margin: "8px 0 0" }}>
                The two amounts must add up to what the escrow still holds for this milestone after fees. If the escrow
                service rejects the split, lower the amounts slightly and try again.
              </p>
            </div>
          ))}
        </>
      )}
    </>
  );
}
