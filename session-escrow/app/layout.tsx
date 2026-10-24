import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Billable: get paid in USDC with escrow",
  description: "Milestone escrow, invoices and payment records for freelancers paid in USDC.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          <header className="top">
            <Link href="/" className="brand">Billable</Link>
            <nav className="row" style={{ marginLeft: "auto" }}>
              <Link href="/app">App</Link>
              <Link href="/docs">Docs</Link>
              <Link href="/stats">Stats</Link>
              <span className="badge">testnet</span>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
