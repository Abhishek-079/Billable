import Link from "next/link";
import { LiveStrip } from "@/components/LiveStrip";

const steps = [
  ["Create the deal", "The contractor lists milestones and amounts, then sends the client a link."],
  ["Lock the money", "The client pays the full amount into a Trustless Work escrow on Stellar. Neither side can move it alone."],
  ["Deliver and approve", "Each milestone pays out as soon as the client approves it."],
  ["Get the paperwork", "Every payment produces an invoice and a CSV row with the rupee value that day."],
];

export default function Landing() {
  return (
    <>
      <section className="hero">
        <div>
          <h1>Get paid in USDC without chasing anyone.</h1>
          <p>
            The client locks the full amount in escrow before work starts. You deliver milestone by milestone, and each one
            pays out when it is approved. Invoices and tax-friendly records come with every payment.
          </p>
          <div className="row cta">
            <Link href="/app"><button className="primary">Start a deal</button></Link>
            <Link href="/docs"><button>Read how it works</button></Link>
          </div>
          <div className="fine">Runs on Stellar testnet with test money. Open source.</div>
        </div>

        <div className="card ladder" aria-label="Example deal">
          <div className="head">
            <span className="title">Brand video package</span>
            <span className="tag">Example deal</span>
          </div>
          <div className="rung paid"><span className="dot">✓</span><span>Script and storyboard</span><span className="amt">150 USDC</span></div>
          <div className="rung now"><span className="dot" /><span>First cut, waiting for approval</span><span className="amt">250 USDC</span></div>
          <div className="rung"><span className="dot" /><span>Final delivery</span><span className="amt">200 USDC</span></div>
          <div className="bar"><i /></div>
          <div className="fine">600 USDC locked. 150 paid. Nothing else can move until you deliver.</div>
        </div>
      </section>

      <LiveStrip />

      <section className="split">
        <h2>Freelancing across borders runs on trust. Most of it is one-sided.</h2>
        <div className="facts">
          <div><span className="title">Clients pay first and hope.</span><p>There are no chargebacks in crypto, so a missed delivery means the money is gone.</p></div>
          <div><span className="title">Contractors work first and hope.</span><p>A client who goes quiet after the work is done leaves nothing to fall back on.</p></div>
          <div><span className="title">Records don't exist.</span><p>Crypto income is taxed in India, yet wallet transfers come with no invoice and no rupee value.</p></div>
          <div><span className="title">Disputes have no referee.</span><p>Billable lets an admin split a disputed milestone, and the split is recorded on the network.</p></div>
        </div>
      </section>

      <h2>How a deal runs</h2>
      <div className="steps">
        {steps.map(([t, d]) => (
          <div className="card" key={t}><div className="title">{t}</div><p>{d}</p></div>
        ))}
      </div>

      <section className="split">
        <h2>Checked on the network before it counts.</h2>
        <div className="facts">
          <div><span className="title">Real transactions only.</span><p>Before any step is saved, we look the transaction up on Stellar. It must have succeeded, be recent, and be signed by the right wallet.</p></div>
          <div><span className="title">Right escrow, used once.</span><p>It must touch this deal's escrow contract, and the same transaction can never be replayed.</p></div>
          <div><span className="title">Non-custodial.</span><p>Funds sit in a <a href="https://docs.trustlesswork.com" target="_blank" rel="noreferrer">Trustless Work</a> contract, not in our account.</p></div>
        </div>
      </section>

      <section className="final">
        <h2>Try a full deal in five minutes.</h2>
        <p className="sub" style={{ marginBottom: 18 }}>Open it in two browsers, one as contractor and one as client. Test funds only. Email login and a rupee cash-out partner are next.</p>
        <div className="row">
          <Link href="/app"><button className="primary">Open the app</button></Link>
          <Link href="/stats"><button>See live stats</button></Link>
        </div>
      </section>
    </>
  );
}
