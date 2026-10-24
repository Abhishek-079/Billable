// Stand-ins for the two outside services, so the app can be tested without internet:
//  - a mock Trustless Work API (port 4010): returns unsigned transactions that invoke a contract, and
//    "submits" signed ones (it never returns a hash, like the real API might not)
//  - a mock Horizon (port 4011): serves the transactions the mock API has "submitted"
// POST :4010/__control {hash, successful?, created_at?} lets a test change what Horizon reports.
import http from "node:http";
import { Account, Address, Operation, StrKey, TransactionBuilder, Networks } from "@stellar/stellar-sdk";

export const API_KEY = "test-key";
export const ESCROW_ID = StrKey.encodeContract(Buffer.alloc(32, 7));
export const FACTORY_ID = StrKey.encodeContract(Buffer.alloc(32, 9));

const submitted = new Map(); // hash -> { successful, created_at, envelope_xdr }

let seq = 1000; // real wallets use a new sequence number per transaction, so every hash is unique
function unsigned(source, contract) {
  return new TransactionBuilder(new Account(source, String(++seq)), { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.invokeContractFunction({ contract, function: "act", args: [] }))
    .setTimeout(300)
    .build()
    .toXDR();
}

const SIGNER_FIELD = {
  "/deployer/multi-release": ["signer", FACTORY_ID],
  "/escrow/multi-release/fund-escrow": ["signer", ESCROW_ID],
  "/escrow/multi-release/change-milestone-status": ["serviceProvider", ESCROW_ID],
  "/escrow/multi-release/approve-milestone": ["approver", ESCROW_ID],
  "/escrow/multi-release/release-milestone-funds": ["releaseSigner", ESCROW_ID],
  "/escrow/multi-release/dispute-milestone": ["signer", ESCROW_ID],
  "/escrow/multi-release/resolve-milestone-dispute": ["disputeResolver", ESCROW_ID],
};

const body = (req) => new Promise((res) => { let s = ""; req.on("data", (d) => (s += d)).on("end", () => res(s ? JSON.parse(s) : {})); });
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

export function startMocks() {
  const calls = [];
  const tw = http.createServer(async (req, res) => {
    const b = await body(req);
    if (req.url === "/__control") {
      const t = submitted.get(b.hash);
      if (!t) return send(res, 404, { error: "unknown hash" });
      Object.assign(t, Object.fromEntries(Object.entries(b).filter(([k]) => k !== "hash")));
      return send(res, 200, { ok: true });
    }
    if (req.url === "/__calls") return send(res, 200, calls);
    if (req.headers["x-api-key"] !== API_KEY) return send(res, 401, { message: "bad api key" });
    calls.push({ path: req.url, body: b });
    if (req.url === "/helper/send-transaction") {
      const tx = TransactionBuilder.fromXDR(b.signedXdr, Networks.TESTNET);
      if (!tx.signatures.length) return send(res, 400, { message: "unsigned" });
      submitted.set(tx.hash().toString("hex"), { successful: true, created_at: new Date().toISOString(), envelope_xdr: b.signedXdr });
      const isDeploy = Address.fromScAddress(tx.operations[0].func.invokeContract().contractAddress()).toString() === FACTORY_ID;
      return send(res, 201, isDeploy ? { status: "SUCCESS", contractId: ESCROW_ID } : { status: "SUCCESS" });
    }
    const spec = SIGNER_FIELD[req.url];
    if (!spec) return send(res, 404, { message: `no mock for ${req.url}` });
    return send(res, 201, { status: "SUCCESS", unsignedTransaction: unsigned(b[spec[0]], spec[1]) });
  });
  const horizon = http.createServer((req, res) => {
    const m = req.url.match(/^\/transactions\/([0-9a-f]{64})$/);
    const t = m && submitted.get(m[1]);
    return t ? send(res, 200, t) : send(res, 404, { status: 404, title: "Resource Missing" });
  });
  return new Promise((resolve) =>
    tw.listen(4010, "127.0.0.1", () =>
      horizon.listen(4011, "127.0.0.1", () => resolve({ close: () => { tw.close(); horizon.close(); } })),
    ),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startMocks();
  console.log("mock Trustless Work on :4010, mock Horizon on :4011");
}
