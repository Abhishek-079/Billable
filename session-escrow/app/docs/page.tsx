export const metadata = { title: "Docs: Billable" };

export default function Docs() {
  return (
    <>
      <h1>Docs</h1>
      <p className="sub">What Billable does, who can do what, and what is not built yet.</p>

      <h2>Roles</h2>
      <div className="card">
        <p><strong>Contractor:</strong> creates the deal, marks milestones delivered, can dispute.</p>
        <p><strong>Client:</strong> funds the escrow, approves and releases milestones, can dispute.</p>
        <p style={{ margin: 0 }}><strong>Platform admin:</strong> resolves disputes by splitting the disputed milestone. Cannot touch undisputed funds.</p>
      </div>

      <h2>A deal, start to finish</h2>
      <div className="card">
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li>Contractor creates a deal with milestones and shares the link.</li>
          <li>Client opens the link, adds test XLM and a USDC trustline, then pays into escrow (two signatures).</li>
          <li>Contractor marks a milestone delivered.</li>
          <li>Client approves and pays. The invoice and record appear.</li>
          <li>Repeat per milestone. The deal completes when all are paid or resolved.</li>
        </ol>
      </div>

      <h2>Disputes</h2>
      <div className="card">Either party can dispute a milestone. The admin sees it at /admin and chooses refund the client, pay the contractor, or split 50/50. The split is signed by the platform account and recorded on the network.</div>

      <h2>Records</h2>
      <div className="card">Each released milestone gets a printable invoice and a CSV row with the USDC amount, the INR per USDC rate from CoinGecko at release time, and the transaction hash. If the rate lookup fails, it says "rate unavailable" and never invents a number. Records are not tax advice and the invoice is not a GST invoice.</div>

      <h2>Security checks</h2>
      <div className="card">Before any step is saved, the transaction is looked up on Horizon. It must be successful, recent, signed by the claiming wallet, touch this deal's contract, and not reused. Writes are rate limited, the API key stays on the server, and CSV output is protected against formula injection.</div>

      <h2>Not built yet</h2>
      <div className="card">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Email login (today each browser gets a testnet demo wallet)</li>
          <li>Rupee cash-out inside the app</li>
          <li>Checking milestone numbers and amounts inside each transaction</li>
          <li>Mainnet. Everything here is testnet.</li>
        </ul>
      </div>
    </>
  );
}
