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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="wrap">
          <header className="top">
            <Link href="/" className="brand">Billable</Link>
            <nav className="nav">
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
