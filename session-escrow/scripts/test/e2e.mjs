// End-to-end test of the built app against the mock services.
//   npm run build && node scripts/test/e2e.mjs --db=file
//   E2E_DATABASE_URL=postgres://user:pass@127.0.0.1/db node scripts/test/e2e.mjs --db=pg
// Plays four people: contractor, client, an attacker, and the platform admin.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk";
import { API_KEY, ESCROW_ID, startMocks } from "./mocks.mjs";

const mode = (process.argv.find((a) => a.startsWith("--db=")) || "--db=file").slice(5);
const PORT = 3113;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = "admin-token-for-tests-123";
const contractor = Keypair.random(), client = Keypair.random(), attacker = Keypair.random(), platform = Keypair.random();
const dataDir = mkdtempSync(path.join(tmpdir(), "billable-e2e-"));

let passed = 0;
const check = (name, fn) => Promise.resolve(fn()).then(() => { passed++; console.log("  ok  " + name); }, (e) => { console.log("FAIL  " + name + "\n      " + e.message); process.exitCode = 1; throw e; });

const j = async (method, url, body, headers = {}) => {
  const res = await fetch(BASE + url, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
};
const sign = (xdr, kp) => { const t = TransactionBuilder.fromXDR(xdr, Networks.TESTNET); t.sign(kp); return t.toXDR(); };
const hashOf = (xdr) => TransactionBuilder.fromXDR(xdr, Networks.TESTNET).hash().toString("hex");

// Does what the browser does: ask the escrow API (via our proxy) for a transaction, sign it, submit it.
async function chain(path_, payload, kp) {
  const u = await j("POST", `/api/tw/${path_}`, payload);
  assert.equal(u.status, 201, `${path_} -> ${JSON.stringify(u.body)}`);
  const signed = sign(u.body.unsignedTransaction, kp);
  const s = await j("POST", "/api/tw/helper/send-transaction", { signedXdr: signed });
  assert.equal(s.status, 201, "send-transaction");
  return { hash: hashOf(signed), contractId: s.body.contractId };
}
const control = (hash, patch) => fetch("http://127.0.0.1:4010/__control", { method: "POST", body: JSON.stringify({ hash, ...patch }) });

let server;
async function startServer() {
  const env = {
    ...process.env,
    PORT: String(PORT),
    TW_API_KEY: API_KEY, TW_BASE_URL: "http://127.0.0.1:4010", HORIZON_URL: "http://127.0.0.1:4011",
    ADMIN_TOKEN: ADMIN, PLATFORM_SECRET: platform.secret(), NEXT_PUBLIC_PLATFORM_ADDRESS: platform.publicKey(),
    VERIFY_POLL_MS: "20", VERIFY_POLL_TRIES: "3", DATA_DIR: dataDir,
  };
  if (mode === "pg") env.DATABASE_URL = process.env.E2E_DATABASE_URL; else delete env.DATABASE_URL;
  // Run next directly in its own process group so stopServer() can kill the server and its workers,
  // and refuse to run if something else already answers on the port (it would be tested by mistake).
  const inUse = await fetch(BASE + "/api/rate").then(() => true, () => false);
  if (inUse) throw new Error(`port ${PORT} is already in use; stop that server first`);
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let log = ""; server.stdout.on("data", (d) => (log += d)); server.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + "/api/rate")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  throw new Error("server did not start:\n" + log);
}
const stopServer = () => new Promise((r) => {
  const kill = (sig) => { try { process.kill(-server.pid, sig); } catch {} };
  server.once("exit", () => setTimeout(r, 300));
  kill("SIGTERM");
  setTimeout(() => { kill("SIGKILL"); r(); }, 3000);
});

const mocks = await startMocks();
try {
  console.log(`e2e (${mode} storage)`);
  await startServer();
  let id, contractId;

  await check("create a draft deal", async () => {
    const r = await j("POST", "/api/deals", { title: "Edit videos", contractorName: "Riya", contractorAddress: contractor.publicKey(), milestones: [{ title: "Video 1", amount: 10 }, { title: "Video 2", amount: 10 }] });
    assert.equal(r.status, 201); id = r.body.deal.id;
  });
  await check("rejects bad deals", async () => {
    assert.equal((await j("POST", "/api/deals", { title: "x", contractorAddress: contractor.publicKey(), milestones: [{ title: "a", amount: -1 }] })).status, 400);
    assert.equal((await j("POST", "/api/deals", { title: "x", contractorAddress: "nope", milestones: [{ title: "a", amount: 1 }] })).status, 400);
  });

  let deployHash, fundHash;
  await check("client deploys and funds escrow through the proxy", async () => {
    const d = await chain("deployer/multi-release", { signer: client.publicKey() }, client);
    assert.equal(d.contractId, ESCROW_ID); deployHash = d.hash; contractId = d.contractId;
    fundHash = (await chain("escrow/multi-release/fund-escrow", { contractId, signer: client.publicKey(), amount: 20 }, client)).hash;
  });

  await check("proxy refuses paths outside the allowlist", async () => {
    assert.equal((await j("POST", "/api/tw/admin/api-keys", {})).status, 403);
  });

  await check("accept without a transaction hash is rejected (strict)", async () => {
    const r = await j("PATCH", `/api/deals/${id}`, { action: "accept", address: client.publicKey(), contractId });
    assert.equal(r.status, 422); assert.match(r.body.error, /hash required/i);
  });
  await check("accept with someone else's address is rejected", async () => {
    const r = await j("PATCH", `/api/deals/${id}`, { action: "accept", address: attacker.publicKey(), contractId, hash: fundHash });
    assert.equal(r.status, 422); assert.match(r.body.error, /signed by/i);
  });
  await check("accept with a transaction for the wrong contract is rejected", async () => {
    const r = await j("PATCH", `/api/deals/${id}`, { action: "accept", address: client.publicKey(), contractId, hash: deployHash });
    assert.equal(r.status, 422); assert.match(r.body.error, /escrow contract/i);
  });
  await check("contractor can't fund their own deal", async () => {
    const h = (await chain("escrow/multi-release/fund-escrow", { contractId, signer: contractor.publicKey(), amount: 20 }, contractor)).hash;
    const r = await j("PATCH", `/api/deals/${id}`, { action: "accept", address: contractor.publicKey(), contractId, hash: h });
    assert.equal(r.status, 409);
  });
  await check("client accepts with the real funding transaction", async () => {
    const r = await j("PATCH", `/api/deals/${id}`, { action: "accept", address: client.publicKey(), name: "Lee", contractId, hash: fundHash });
    assert.equal(r.status, 200); assert.equal(r.body.deal.status, "active");
    assert.ok(!r.body.deal.log.at(-1).unverified);
  });
  await check("the same transaction can't be recorded twice (replay)", async () => {
    const r = await j("PATCH", `/api/deals/${id}`, { action: "approve", address: client.publicKey(), index: 0, hash: fundHash });
    assert.equal(r.status, 409);
  });

  let deliverHash;
  await check("attacker can't claim to be the contractor", async () => {
    const mine = (await chain("escrow/multi-release/change-milestone-status", { contractId, milestoneIndex: "0", newStatus: "Completed", newEvidence: "x", serviceProvider: attacker.publicKey() }, attacker)).hash;
    const r = await j("PATCH", `/api/deals/${id}`, { action: "deliver", address: contractor.publicKey(), index: 0, hash: mine });
    assert.equal(r.status, 422);
  });
  await check("client can't mark work delivered", async () => {
    const h = (await chain("escrow/multi-release/change-milestone-status", { contractId, milestoneIndex: "0", newStatus: "Completed", newEvidence: "x", serviceProvider: client.publicKey() }, client)).hash;
    assert.equal((await j("PATCH", `/api/deals/${id}`, { action: "deliver", address: client.publicKey(), index: 0, hash: h })).status, 409);
  });
  await check("a failed or stale transaction is rejected, then the real one passes", async () => {
    deliverHash = (await chain("escrow/multi-release/change-milestone-status", { contractId, milestoneIndex: "0", newStatus: "Completed", newEvidence: "link", serviceProvider: contractor.publicKey() }, contractor)).hash;
    const body = { action: "deliver", address: contractor.publicKey(), index: 0, evidence: "link", hash: deliverHash };
    await control(deliverHash, { successful: false });
    assert.equal((await j("PATCH", `/api/deals/${id}`, body)).status, 422);
    await control(deliverHash, { successful: true, created_at: new Date(Date.now() - 3600_000).toISOString() });
    const old = await j("PATCH", `/api/deals/${id}`, body);
    assert.equal(old.status, 422); assert.match(old.body.error, /too old/i);
    await control(deliverHash, { created_at: new Date().toISOString() });
    assert.equal((await j("PATCH", `/api/deals/${id}`, body)).status, 200);
  });
  await check("an unknown transaction hash is rejected", async () => {
    const r = await j("PATCH", `/api/deals/${id}`, { action: "approve", address: client.publicKey(), index: 0, hash: "ab".repeat(32) });
    assert.equal(r.status, 422); assert.match(r.body.error, /not found/i);
  });

  await check("client approves and releases milestone 1", async () => {
    const a = (await chain("escrow/multi-release/approve-milestone", { contractId, milestoneIndex: "0", approver: client.publicKey() }, client)).hash;
    assert.equal((await j("PATCH", `/api/deals/${id}`, { action: "approve", address: client.publicKey(), index: 0, hash: a })).status, 200);
    const r = (await chain("escrow/multi-release/release-milestone-funds", { contractId, milestoneIndex: "0", releaseSigner: client.publicKey() }, client)).hash;
    const done = await j("PATCH", `/api/deals/${id}`, { action: "release", address: client.publicKey(), index: 0, hash: r });
    assert.equal(done.status, 200); assert.equal(done.body.deal.milestones[0].status, "released");
  });
  await check("invoice exists for the paid milestone, not the unpaid one", async () => {
    assert.equal((await fetch(`${BASE}/api/deals/${id}/invoice/0`)).status, 200);
    assert.equal((await fetch(`${BASE}/api/deals/${id}/invoice/1`)).status, 404);
  });

  await check("dispute -> admin auth -> resolve with a split", async () => {
    const dl = (await chain("escrow/multi-release/change-milestone-status", { contractId, milestoneIndex: "1", newStatus: "Completed", newEvidence: "x", serviceProvider: contractor.publicKey() }, contractor)).hash;
    assert.equal((await j("PATCH", `/api/deals/${id}`, { action: "deliver", address: contractor.publicKey(), index: 1, hash: dl })).status, 200);
    const dp = (await chain("escrow/multi-release/dispute-milestone", { contractId, milestoneIndex: "1", signer: client.publicKey() }, client)).hash;
    assert.equal((await j("PATCH", `/api/deals/${id}`, { action: "dispute", address: client.publicKey(), index: 1, hash: dp })).status, 200);

    assert.equal((await j("GET", "/api/admin/disputes")).status, 401);
    assert.equal((await j("GET", "/api/admin/disputes", null, { "x-admin-token": "wrong" })).status, 401);
    const list = await j("GET", "/api/admin/disputes", null, { "x-admin-token": ADMIN });
    assert.equal(list.status, 200); assert.equal(list.body.disputes.length, 1);

    const noAuth = await j("POST", "/api/admin/resolve", { dealId: id, index: 1, toContractor: 4, toClient: 6 });
    assert.equal(noAuth.status, 401);
    const tooMuch = await j("POST", "/api/admin/resolve", { dealId: id, index: 1, toContractor: 9, toClient: 9 }, { "x-admin-token": ADMIN });
    assert.equal(tooMuch.status, 400);
    const ok = await j("POST", "/api/admin/resolve", { dealId: id, index: 1, toContractor: 4, toClient: 6 }, { "x-admin-token": ADMIN });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.deal.milestones[1].status, "resolved");
    assert.equal(ok.body.deal.status, "completed");
    const again = await j("POST", "/api/admin/resolve", { dealId: id, index: 1, toContractor: 4, toClient: 6 }, { "x-admin-token": ADMIN });
    assert.equal(again.status, 409);
    const calls = await (await fetch("http://127.0.0.1:4010/__calls")).json();
    const rd = calls.find((c) => c.path.endsWith("resolve-milestone-dispute")).body;
    assert.equal(rd.disputeResolver, platform.publicKey());
    assert.deepEqual(rd.distributions.map((d) => d.amount), [4, 6]);
  });

  await check("CSV has the payment and the settlement, escaping formulas", async () => {
    const csv = await (await fetch(`${BASE}/api/records?address=${contractor.publicKey()}&role=contractor`)).text();
    assert.match(csv, /"Video 1".*"10.00"/); assert.match(csv, /dispute settlement.*"4.00"/);
    assert.equal(csv.trim().split("\r\n").length, 3);
  });

  await check("data survives a server restart", async () => {
    await stopServer(); await startServer();
    const r = await j("GET", `/api/deals/${id}`);
    assert.equal(r.status, 200); assert.equal(r.body.deal.milestones[1].status, "resolved");
    assert.equal((await j("GET", `/api/deals?address=${client.publicKey()}`)).body.deals.length, 1);
  });

  await check("public stats show totals only and no private data", async () => {
    const r = await j("GET", "/api/stats");
    assert.equal(r.status, 200); assert.ok(r.body.deals >= 1 && r.body.milestones >= 2);
    assert.ok(r.body.usdcPaidToContractors > 0);
    const txt = JSON.stringify(r.body);
    assert.ok(!txt.includes(contractor.publicKey()) && !txt.includes("Riya"));
  });

  await check("rate limit kicks in on deal creation", async () => {
    let limited = 0;
    for (let i = 0; i < 20; i++) {
      const r = await j("POST", "/api/deals", { title: "spam", contractorAddress: contractor.publicKey(), milestones: [{ title: "a", amount: 1 }] });
      if (r.status === 429) limited++;
    }
    assert.ok(limited >= 4, `expected 429s, got ${limited}`);
  });

  console.log(`\nall ${passed} checks passed (${mode})`);
} catch (e) {
  process.exitCode = 1;
} finally {
  if (server) await stopServer().catch(() => {});
  mocks.close();
  rmSync(dataDir, { recursive: true, force: true });
  process.exit(process.exitCode || 0);
}
