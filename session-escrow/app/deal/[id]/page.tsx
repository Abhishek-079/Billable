"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { WalletPanel } from "@/components/WalletPanel";
import { dealsApi } from "@/lib/client-api";
import { EXPLORER_TX } from "@/lib/config";
import * as tw from "@/lib/tw";
import { dealTotal, type Deal, type Milestone } from "@/lib/types";
import { useWallet } from "@/lib/useWallet";

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const w = useWallet();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Record<number, string>>({});
  const [link, setLink] = useState("");

  const load = useCallback(async () => {
    try {
      setDeal(await dealsApi.get(id));
      setLoadErr(null);
    } catch (e: any) {
      setLoadErr(e.message);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000); // pick up the other party's changes
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => setLink(window.location.href), []);

  const me = w.wallet;
  const isContractor = !!deal && me?.address === deal.contractorAddress;
  const isClient = !!deal && !!deal.clientAddress && me?.address === deal.clientAddress;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      await w.refresh();
    } catch (e: any) {
      setError(e?.message || String(e));
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (loadErr) return <p className="err">{loadErr}</p>;
  if (!deal) return <p className="muted">Loading…</p>;
  const d = deal;
  const total = dealTotal(d);
  const enough = Number(w.balances?.usdc ?? 0) >= total;

  const fund = () =>
    run("fund", async () => {
      if (!me) return;
      const r = await tw.deployAndFund(me, d);
      try {
        await dealsApi.patch(d.id, { action: "accept", address: me.address, name: w.name, contractId: r.contractId, hash: r.hash });
      } catch (e: any) {
        throw new Error(`Funds are locked on-chain (contract ${r.contractId}) but saving failed: ${e.message}. Don't fund again; contact support with this contract ID.`);
      }
    });

  const deliver = (i: number) =>
    run(`d${i}`, async () => {
      if (!me) return;
      const r = await tw.markDelivered(me, d, i, evidence[i] || "");
      await dealsApi.patch(d.id, { action: "deliver", address: me.address, index: i, evidence: evidence[i] || "", hash: r.hash });
    });

  // Approve and release are two signatures but one click. If the second fails, the milestone
  // stays "approved" and the button turns into "Release payment".
  const approveAndRelease = (i: number, m: Milestone) =>
    run(`r${i}`, async () => {
      if (!me) return;
      if (m.status === "delivered") {
        const a = await tw.approveMilestone(me, d, i);
        await dealsApi.patch(d.id, { action: "approve", address: me.address, index: i, hash: a.hash });
      }
      const r = await tw.releaseMilestone(me, d, i);
      await dealsApi.patch(d.id, { action: "release", address: me.address, index: i, hash: r.hash });
    });

  const dispute = (i: number) =>
    run(`x${i}`, async () => {
      if (!me) return;
      if (!confirm("Open a dispute? The platform will review and decide how the milestone's funds are split.")) return;
      const r = await tw.disputeMilestone(me, d, i);
      await dealsApi.patch(d.id, { action: "dispute", address: me.address, index: i, hash: r.hash });
    });

  const role = isContractor ? "You're the contractor" : isClient ? "You're the client" : "You're viewing this deal";

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{d.title}</h1>
        <span className={`badge ${d.status === "completed" ? "released" : ""}`}>{d.status}</span>
      </div>
      <p className="sub">
        {role} · {d.contractorName} ({short(d.contractorAddress)})
        {d.clientAddress && <> → {d.clientName} ({short(d.clientAddress)})</>} · {total} USDC total
      </p>
      {d.description && <p>{d.description}</p>}

      {d.status === "draft" && isContractor && (
        <>
          <h2>Send this link to your client</h2>
          <div className="card copybox">
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <button onClick={() => navigator.clipboard?.writeText(link)}>Copy</button>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            Nothing is locked yet. Once your client funds the deal, you can start work, and each milestone is paid when they approve it.
          </p>
        </>
      )}

      {d.status === "draft" && !isContractor && (
        <>
          <h2>Fund this deal</h2>
          <div className="card">
            <p style={{ marginTop: 0 }}>
              Lock <strong>{total} USDC</strong> in escrow. {d.contractorName} gets paid milestone by milestone, only when you approve each one.
            </p>
            <div className="field">
              <label>Your name (shown on invoices)</label>
              <input value={w.name} onChange={(e) => w.setName(e.target.value)} placeholder="Your name or company" />
            </div>
            {!enough && w.balances && (
              <p className="err">You need {total} USDC in your wallet (you have {Number(w.balances.usdc ?? 0).toFixed(2)}). Set up your wallet below.</p>
            )}
            <button className="primary" disabled={!!busy || !me || !enough} onClick={fund}>
              {busy === "fund" ? "Locking funds… (2 signatures)" : `Pay ${total} USDC into escrow`}
            </button>
          </div>
          <h2>Your wallet</h2>
          <WalletPanel w={w} />
        </>
      )}

      {error && <p className="err">{error}</p>}

      {d.status !== "draft" && (
        <>
          <h2>Milestones</h2>
          <div className="card">
            {d.milestones.map((m, i) => (
              <div className="ms" key={i}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="title">{i + 1}. {m.title}</span>
                  <span>
                    {m.amount} USDC <span className={`badge ${m.status}`}>{m.status}</span>
                  </span>
                </div>
                {m.evidence && <div className="muted" style={{ fontSize: 13 }}>Delivery note: {m.evidence}</div>}
                <div className="row" style={{ marginTop: 8 }}>
                  {isContractor && m.status === "pending" && (
                    <>
                      <input
                        style={{ flex: 1, minWidth: 180 }}
                        placeholder="Link or note for your client (optional)"
                        value={evidence[i] || ""}
                        onChange={(e) => setEvidence((x) => ({ ...x, [i]: e.target.value }))}
                      />
                      <button className="primary" disabled={!!busy} onClick={() => deliver(i)}>
                        {busy === `d${i}` ? "Working…" : "Mark delivered"}
                      </button>
                    </>
                  )}
                  {isClient && (m.status === "delivered" || m.status === "approved") && (
                    <button className="primary" disabled={!!busy} onClick={() => approveAndRelease(i, m)}>
                      {busy === `r${i}` ? "Working… (2 signatures)" : m.status === "approved" ? "Release payment" : `Approve and pay ${m.amount} USDC`}
                    </button>
                  )}
                  {(isClient || isContractor) && ["pending", "delivered", "approved"].includes(m.status) && (
                    <button className="danger" disabled={!!busy} onClick={() => dispute(i)}>
                      {busy === `x${i}` ? "…" : "Dispute"}
                    </button>
                  )}
                  {m.status === "released" && (
                    <>
                      <a href={`/api/deals/${d.id}/invoice/${i}`} target="_blank" rel="noreferrer">Invoice</a>
                      {m.releaseTx && <a href={EXPLORER_TX + m.releaseTx} target="_blank" rel="noreferrer">Transaction</a>}
                      {m.inrRate ? (
                        <span className="muted">≈ ₹{(m.amount * m.inrRate).toLocaleString("en-IN", { maximumFractionDigits: 0 })} that day</span>
                      ) : (
                        <span className="muted">INR rate unavailable</span>
                      )}
                    </>
                  )}
                  {m.status === "disputed" && <span className="muted">Waiting for the platform to resolve this dispute.</span>}
                  {m.status === "resolved" && m.resolution && (
                    <span className="muted">
                      Dispute resolved: {m.resolution.toContractor} USDC to {d.contractorName}, {m.resolution.toClient} USDC back to {d.clientName}
                      {m.resolution.tx && (<> · <a href={EXPLORER_TX + m.resolution.tx} target="_blank" rel="noreferrer">Transaction</a></>)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!isContractor && !isClient && (
            <p className="muted">Open this link in the wallet that is part of this deal to take actions.</p>
          )}

          <h2>Activity</h2>
          <ul className="log">
            {d.log.map((l, i) => (
              <li key={i}>
                {new Date(l.at).toLocaleString()} · {l.text}
                {l.hash && (<> · <a href={EXPLORER_TX + l.hash} target="_blank" rel="noreferrer">tx</a></>)}
                {l.unverified && <> · <span title="We couldn't confirm this transaction on the network when it was recorded">unverified</span></>}
              </li>
            ))}
          </ul>
          {d.contractId && <p className="muted mono">Escrow contract: {d.contractId}</p>}
        </>
      )}
    </>
  );
}
