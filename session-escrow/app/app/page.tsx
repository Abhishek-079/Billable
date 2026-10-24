"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WalletPanel } from "@/components/WalletPanel";
import { dealsApi } from "@/lib/client-api";
import { dealTotal, isSettled, type Deal } from "@/lib/types";
import { useWallet } from "@/lib/useWallet";
import { CASHOUT_NAME, CASHOUT_URL } from "@/lib/config";

export default function Home() {
  const w = useWallet();
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const address = w.wallet?.address;

  useEffect(() => {
    if (!address) return;
    dealsApi.list(address).then(setDeals).catch((e) => setErr(e.message));
  }, [address]);

  return (
    <>
      <h1>Get paid for milestone work, safely</h1>
      <p className="sub">
        Create a deal, send the link to your client, and they lock the payment in escrow. Each milestone pays out
        when they approve it, and every payment gets an invoice and a record with the rupee value that day.
      </p>

      <h2>Wallet</h2>
      <WalletPanel w={w} />

      <h2>Your name</h2>
      <div className="card row">
        <input
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Shown on deals and invoices"
          value={w.name}
          onChange={(e) => w.setName(e.target.value)}
        />
        <Link href="/new"><button className="primary">Create a deal</button></Link>
      </div>

      <h2>Your deals</h2>
      {err && <p className="err">{err}</p>}
      {deals && deals.length === 0 && <p className="muted">No deals yet. Create one and share the link with your client.</p>}
      <div className="grid" style={{ gridTemplateColumns: "1fr" }}>
        {deals?.map((d) => {
          const paid = d.milestones.filter(isSettled).length;
          const mine = d.contractorAddress === address ? "You're the contractor" : "You're the client";
          return (
            <Link key={d.id} href={`/deal/${d.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="title">{d.title}</span>
                  <span className={`badge ${d.status === "completed" ? "released" : ""}`}>{d.status}</span>
                </div>
                <div className="muted">
                  {mine} · {dealTotal(d)} USDC · {paid}/{d.milestones.length} milestones paid
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <h2>Cash out to rupees</h2>
      <div className="card">
        {CASHOUT_URL ? (
          <p style={{ margin: 0 }}>
            Turn your USDC into rupees with <strong>{CASHOUT_NAME}</strong>.{" "}
            <a href={CASHOUT_URL} target="_blank" rel="noreferrer">Open {CASHOUT_NAME}</a>
          </p>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Converting USDC to rupees isn't built into this app yet. For now, send your USDC to an exchange or service
            you trust that pays out in India, and keep the CSV records below for tax time. Crypto income is taxed in
            India, so check the rules with an accountant.
          </p>
        )}
      </div>

      {address && (
        <>
          <h2>Records</h2>
          <div className="card row">
            <a href={`/api/records?address=${address}&role=contractor`}>Download income records (CSV)</a>
            <span className="muted">·</span>
            <a href={`/api/records?address=${address}&role=client`}>Download payments made (CSV)</a>
          </div>
        </>
      )}
    </>
  );
}
