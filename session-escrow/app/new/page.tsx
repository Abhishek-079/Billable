"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { dealsApi } from "@/lib/client-api";
import { useWallet } from "@/lib/useWallet";

interface Row {
  title: string;
  amount: string;
}

export default function NewDeal() {
  const router = useRouter();
  const w = useWallet();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>([{ title: "", amount: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setName(w.name), [w.name]);

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (!w.wallet) return;
    setBusy(true);
    setError(null);
    try {
      w.setName(name);
      const deal = await dealsApi.create({
        title,
        description,
        contractorName: name,
        contractorAddress: w.wallet.address,
        milestones: rows.map((r) => ({ title: r.title, amount: Number(r.amount) })),
      });
      router.push(`/deal/${deal.id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <>
      <h1>Create a deal</h1>
      <p className="sub">You'll get a link to send to your client. Nothing is locked until they fund it.</p>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="field">
          <label>Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riya Sharma" />
        </div>
        <div className="field">
          <label>What is the work?</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Edit 4 YouTube videos" />
        </div>
        <div className="field">
          <label>Details (optional)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Scope, deadlines, links" />
        </div>

        <div className="field" style={{ marginBottom: 4 }}>
          <label>Milestones and what each pays (USDC)</label>
        </div>
        {rows.map((r, i) => (
          <div className="ms-row" key={i}>
            <input value={r.title} onChange={(e) => setRow(i, { title: e.target.value })} placeholder={`Milestone ${i + 1}`} />
            <input value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value })} inputMode="decimal" placeholder="100" aria-label="Amount in USDC" />
            <button disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="Remove milestone">×</button>
          </div>
        ))}
        <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
          <button onClick={() => setRows((rs) => [...rs, { title: "", amount: "" }])} disabled={rows.length >= 20}>+ Add milestone</button>
          <span className="title">Total: {total.toFixed(2)} USDC</span>
        </div>

        {error && <p className="err">{error}</p>}
        <div style={{ marginTop: 16 }}>
          <button className="primary" disabled={busy || !w.wallet} onClick={submit}>
            {busy ? "Creating…" : "Create deal and get link"}
          </button>
        </div>
      </div>
    </>
  );
}
