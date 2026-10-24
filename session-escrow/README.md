# Billable

Milestone escrow, invoices and payment records for freelancers who get paid in USDC.

A contractor creates a deal and sends the link. The client locks the full amount in a
[Trustless Work](https://docs.trustlesswork.com) escrow on Stellar. Each milestone is delivered, approved and
paid on its own. Every payment gets an invoice and a CSV record with the rupee value on the day. If there is a
disagreement, the platform admin splits the disputed milestone from the `/admin` page.

Testnet only for now. No real money.

## Run it locally

```bash
npm install
cp .env.example .env.local        # Windows: copy .env.example .env.local
# put your Trustless Work API key after TW_API_KEY= in .env.local   (https://dapp.trustlesswork.com/)
node scripts/platform-setup.mjs   # creates + funds the platform account, adds the USDC trustline,
                                  # fills in NEXT_PUBLIC_PLATFORM_ADDRESS, saves the secret to .platform-secret
npm run dev                       # http://localhost:3000
```

Each browser gets its own demo wallet, so use two browsers (or a normal and a private window):

1. **Contractor:** Get test XLM, Add USDC, Create a deal, copy the link.
2. **Client:** open the link, Get test XLM, Add USDC, get test USDC from https://faucet.circle.com (Stellar testnet),
   then Pay into escrow (two signatures).
3. **Contractor:** Mark delivered. **Client:** Approve and pay. Repeat per milestone.
4. Invoices and CSV records are linked from the deal and the home page.
5. Disputes: either party can dispute a milestone. Set `ADMIN_TOKEN` (12+ characters) in `.env.local`, open
   `/admin`, and split the funds.

## Tests

```bash
npm run typecheck
npm run build
node scripts/test/e2e.mjs --db=file
E2E_DATABASE_URL=postgres://user:pass@127.0.0.1:5432/db node scripts/test/e2e.mjs --db=pg
```

The end-to-end test runs the built app against mock Trustless Work and Horizon servers (`scripts/test/mocks.mjs`)
and plays a contractor, a client, an attacker and an admin: normal flow, fake and replayed transactions,
wrong-contract transactions, disputes, admin access, CSV output, restarts and rate limits. It does not call the
real services. GitHub Actions runs the same checks on every push (`.github/workflows/ci.yml`).

## Deploy (GitHub + Vercel + Neon)

GitHub stores the code and runs the checks. It cannot run the app itself: GitHub Pages only serves static files, and
this app needs a server (to keep the API key private) and a database. Vercel and Neon both have free plans. Check
their terms for your use.

1. **Database:** create a project at https://neon.tech and copy the **pooled** connection string. The app creates
   its table on first use.
2. **Platform account:** run `node scripts/platform-setup.mjs` locally. It prints the address and saves the secret in
   `.platform-secret`.
3. **Vercel:** https://vercel.com/new, import the GitHub repo. If the app sits in a subfolder (for example
   `session-escrow`), set **Root Directory** to that folder. Add these environment variables:

   | Variable | Value |
   |---|---|
   | `TW_API_KEY` | your Trustless Work API key |
   | `DATABASE_URL` | the Neon connection string |
   | `NEXT_PUBLIC_PLATFORM_ADDRESS` | the platform address from step 2 |
   | `PLATFORM_SECRET` | the secret from `.platform-secret` (mark as sensitive) |
   | `ADMIN_TOKEN` | a long random password, e.g. the output of `openssl rand -hex 24` |

   `NEXT_PUBLIC_*` values are baked in at build time, so set them before the first deploy (or redeploy after changing).
4. Deploy. In production, checking transactions on the network is strict by default.

## How it works

- `lib/tw.ts`: Trustless Work multi-release escrow. Each write returns an unsigned transaction, the wallet signs it, and
  `/helper/send-transaction` submits it. `app/api/tw/*` is a proxy so `TW_API_KEY` stays on the server. Only the escrow
  endpoints this app uses are reachable, and it is rate limited.
- `lib/wallet.ts`: one testnet demo wallet per browser. This is the only file to replace for Privy (email login) or Freighter.
- `lib/db.ts`: Postgres when `DATABASE_URL` is set, otherwise a JSON file in `./data` (local development only).
- `lib/verify.ts`: before a step is recorded, the transaction is looked up on the network. It must have succeeded, be
  recent, be signed by the wallet making the claim, touch this deal's escrow contract, and not have been used before.
  Modes: `strict` (production default), `warn` (development default), `off`.
- `app/api/admin/*`, `app/admin`: dispute resolution. The server signs with the platform account's secret.
- `lib/rate.ts`: INR per USDC from CoinGecko at release time. If the lookup fails it records "rate unavailable" and never
  invents a number.

## Known gaps

1. **The automated tests use mock services, not the live Trustless Work service.** Run a full deal by hand on testnet
   before trusting any step. The dispute split has the most open questions: the docs say the amounts must add up to
   the funds left after fees, and the units and fee handling haven't been confirmed live.
2. **Verification checks who signed and which contract, not what was in the transaction.** It does not read the milestone
   number or the amounts inside each transaction.
3. **Rate limits are per server instance.** Fine for a demo; use a shared limiter for real traffic.
4. **Email login is not built.** Users get a browser wallet. Privy supports Stellar wallets (it can create them and sign),
   but signing runs on the server, so it needs a Privy app and a live test.
5. **Cash-out to INR is not built.** Set `NEXT_PUBLIC_CASHOUT_URL` to link a service the user can use.
6. **Records are not tax advice, and the invoice is not a GST invoice.** Both say so.
7. **Deal links are the only access control for viewing a deal.** Anyone with a link can read it. Links are random and
   hard to guess, but treat them as private.

## Layout

```
app/            pages (landing, /app, /new, /deal/[id], /docs, /stats, /admin) and API routes
components/     wallet panel
lib/            escrow client, wallet, database, verification, rate limit, admin
scripts/        platform-setup.mjs, selftest.mjs, test/ (mocks + end-to-end)
```
