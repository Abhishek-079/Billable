"use client";

import { EXPLORER_ACCOUNT } from "@/lib/config";
import type { WalletState } from "@/lib/useWallet";

export function WalletPanel({ w }: { w: WalletState }) {
  const { wallet, balances: bal, busy } = w;
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="title">Your wallet (testnet demo)</span>
        <span className="muted" style={{ fontSize: 13 }}>
          {bal?.exists ? `${Number(bal.xlm).toFixed(2)} XLM` : "Not activated"} ·{" "}
          {bal?.usdc != null ? `${Number(bal.usdc).toFixed(2)} USDC` : "no USDC yet"}
        </span>
      </div>
      {wallet && (
        <p className="mono" style={{ margin: "8px 0" }}>
          <a href={EXPLORER_ACCOUNT + wallet.address} target="_blank" rel="noreferrer">
            {wallet.address}
          </a>
        </p>
      )}
      <div className="row">
        <button disabled={!!busy || !wallet} onClick={w.getTestXlm}>
          {busy === "xlm" ? "…" : "1. Get test XLM"}
        </button>
        <button disabled={!!busy || !bal?.exists || bal.usdc != null} onClick={w.addUsdc}>
          {busy === "usdc" ? "…" : "2. Add USDC"}
        </button>
        <button
          disabled={!!busy}
          title="Throws away this wallet and makes a new one"
          onClick={() => {
            if (confirm("Make a new wallet? The current one is lost from this browser.")) w.newWallet();
          }}
        >
          New wallet
        </button>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>
        Clients also need test USDC: use the{" "}
        <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">Circle faucet</a> (Stellar testnet) and
        paste the address above.
      </p>
      {w.error && <p className="err">{w.error}</p>}
    </div>
  );
}
