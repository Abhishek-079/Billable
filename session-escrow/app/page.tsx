import Link from "next/link";

const steps = [
  ["Contractor creates a deal", "Add milestones and amounts, then send the link to the client."],
  ["Client locks the money", "The full amount goes into a Trustless Work escrow on Stellar. Nobody, including us, can move it alone."],
  ["Deliver, approve, get paid", "Each milestone pays out the moment the client approves it. Not delivered means not paid, and no delivery means a refund path."],
  ["Invoice and record, automatically", "Every payment produces an invoice and a CSV line with the rupee value on that day."],
];

export default function Landing() {
  return (
    <>
      <h1 style={{ fontSize: 38, lineHeight: 1.15, marginTop: 24 }}>Freelancers paid in USDC lose money to one problem: trust.</h1>
      <p className="sub" style={{ fontSize: 18, maxWidth: 680 }}>
        Clients fear paying upfront and never getting the work. Contractors fear doing the work and never getting paid.
        Billable puts the money in escrow on Stellar and pays out milestone by milestone, with invoices and tax-friendly
        records included.
      </p>
      <div className="row" style={{ margin: "20px 0 8px" }}>
        <Link href="/app"><button className="primary">Open the app (testnet)</button></Link>
        <Link href="/docs"><button>How it works</button></Link>
        <Link href="/stats"><button>Live stats</button></Link>
      </div>
      <p className="muted">Testnet only. No real money. Open source.</p>

      <h2>The problem</h2>
      <div className="grid">
        <div className="card"><div className="title">Web3 contractors in India</div>
          <p className="muted">Many are paid in USDC by overseas teams, often on a handshake. Chargebacks do not exist, and neither does recourse.</p></div>
        <div className="card"><div className="title">Paperwork is a mess</div>
          <p className="muted">Crypto income is taxed in India. Most freelancers have wallet transfers and no invoices or rupee values to show.</p></div>
        <div className="card"><div className="title">Disputes have no referee</div>
          <p className="muted">When a client goes quiet, there is no neutral party and no way to split funds fairly.</p></div>
      </div>

      <h2>How it works</h2>
      <div className="grid">
        {steps.map(([t, d], i) => (
          <div className="card" key={t}><div className="muted">Step {i + 1}</div><div className="title">{t}</div><p className="muted">{d}</p></div>
        ))}
      </div>

      <h2>Built on</h2>
      <div className="card">
        <p style={{ margin: 0 }}>
          Stellar and Soroban for settlement, <a href="https://docs.trustlesswork.com" target="_blank" rel="noreferrer">Trustless Work</a> for
          non-custodial escrow contracts, and USDC for payments. Every action is checked on the network before it is
          recorded: it must have succeeded, be recent, be signed by the right wallet, touch the right escrow, and never
          have been used before.
        </p>
      </div>

      <h2>Where we are</h2>
      <div className="card">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Working on testnet: escrow, milestone payouts, invoices, CSV records, disputes with an admin split</li>
          <li>Automated end-to-end tests: 20 checks on file and Postgres storage</li>
          <li>Next: email login, rupee cash-out partner, mainnet pilot with real freelancers</li>
        </ul>
      </div>
    </>
  );
}
