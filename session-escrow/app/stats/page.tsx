"use client";

import { useEffect, useState } from "react";
import { EXPLORER_TX } from "@/lib/config";

type Stats = {
  deals: number; fundedDeals: number; completedDeals: number; milestones: number; released: number;
  resolved: number; disputed: number; usdcFunded: number; usdcPaidToContractors: number; users: number;
  recent: { at: number; amount: number; tx?: string }[];
};

export default function StatsPage() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const load = () => fetch("/api/stats").then((r) => r.json()).then((j) => (j.error ? setErr(j.error) : setS(j))).catch((e) => setErr(e.message));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  const tile = (label: string, v: number | string) => (
    <div className="card"><div className="muted">{label}</div><div style={{ fontSize: 28, fontWeight: 700 }}>{v}</div></div>
  );
  return (
    <>
      <h1>Live stats</h1>
      <p className="sub">Testnet activity, updated every 15 seconds. Totals only, no personal details.</p>
      {err && <p className="err">{err}</p>}
      {!s && !err && <p className="muted">Loading…</p>}
      {s && (
        <>
          <div className="grid" style={{ marginTop: 16 }}>
            {tile("Deals created", s.deals)}
            {tile("Deals funded", s.fundedDeals)}
            {tile("Deals completed", s.completedDeals)}
            {tile("Wallets involved", s.users)}
            {tile("Milestones paid", s.released + s.resolved)}
            {tile("Disputes open", s.disputed)}
            {tile("USDC locked in escrow", s.usdcFunded)}
            {tile("USDC paid to contractors", s.usdcPaidToContractors)}
          </div>
          <h2>Latest payouts</h2>
          {s.recent.length === 0 && <p className="muted">No payouts yet.</p>}
          <div className="card">
            {s.recent.map((r, i) => (
              <div className="row" key={i} style={{ justifyContent: "space-between" }}>
                <span>{new Date(r.at).toISOString().slice(0, 16).replace("T", " ")} UTC · {r.amount} USDC</span>
                {r.tx && <a href={EXPLORER_TX + r.tx} target="_blank" rel="noreferrer">View on explorer</a>}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
