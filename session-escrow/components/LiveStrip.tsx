"use client";

import { useEffect, useState } from "react";

type S = { fundedDeals: number; released: number; resolved: number; usdcFunded: number; usdcPaidToContractors: number };

export function LiveStrip() {
  const [s, setS] = useState<S | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then((j) => (j.error ? setFailed(true) : setS(j))).catch(() => setFailed(true));
  }, []);
  const v = (n?: number) => (s && n !== undefined ? String(n) : failed ? "n/a" : "…");
  return (
    <div className="strip" aria-label="Live testnet numbers">
      <div><b>{v(s?.fundedDeals)}</b><span>Deals funded</span></div>
      <div><b>{s ? String(s.released + s.resolved) : v()}</b><span>Milestones paid</span></div>
      <div><b>{v(s?.usdcFunded)}</b><span>USDC locked in escrow</span></div>
      <div><b>{v(s?.usdcPaidToContractors)}</b><span>USDC paid out</span></div>
    </div>
  );
}
