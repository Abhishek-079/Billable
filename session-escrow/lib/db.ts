import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { Pool } from "pg";
import type { Deal } from "./types";

// Storage for deals. Two backends behind one set of functions:
//  - DATABASE_URL set  -> Postgres (use this when deployed; works on Vercel/Render/etc.)
//  - otherwise         -> one JSON file in ./data (local development only)
// Each deal is stored whole as JSON, so adding fields never needs a migration.

export const newId = () => randomBytes(6).toString("hex");

type Mutator = (d: Deal) => void;

interface Store {
  get(id: string): Promise<Deal | null>;
  listFor(address: string): Promise<Deal[]>;
  listAll(): Promise<Deal[]>;
  create(deal: Deal): Promise<Deal>;
  mutate(id: string, fn: Mutator): Promise<Deal | null>;
  hashUsed(hash: string): Promise<boolean>;
}

const mentionsHash = (d: Deal, hash: string) =>
  d.fundTx === hash ||
  d.log.some((l) => l.hash === hash) ||
  d.milestones.some((m) => m.releaseTx === hash || m.resolution?.tx === hash);

/* ---------------- file backend (dev) ---------------- */

function fileStore(): Store {
  const DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
  const FILE = path.join(DIR, "deals.json");
  let queue: Promise<unknown> = Promise.resolve();
  // Serialise read-modify-write so concurrent requests can't clobber each other.
  const locked = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };
  const readAll = async (): Promise<Deal[]> => {
    try {
      return JSON.parse(await fs.readFile(FILE, "utf8"));
    } catch (e: any) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  };
  const writeAll = async (deals: Deal[]) => {
    await fs.mkdir(DIR, { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(deals, null, 2));
    await fs.rename(tmp, FILE);
  };
  return {
    get: async (id) => (await readAll()).find((d) => d.id === id) ?? null,
    listFor: async (a) =>
      (await readAll())
        .filter((d) => d.contractorAddress === a || d.clientAddress === a)
        .sort((x, y) => y.createdAt - x.createdAt),
    listAll: async () => readAll(),
    create: (deal) =>
      locked(async () => {
        const all = await readAll();
        all.push(deal);
        await writeAll(all);
        return deal;
      }),
    mutate: (id, fn) =>
      locked(async () => {
        const all = await readAll();
        const deal = all.find((d) => d.id === id);
        if (!deal) return null;
        fn(deal);
        await writeAll(all);
        return deal;
      }),
    hashUsed: async (hash) => (await readAll()).some((d) => mentionsHash(d, hash)),
  };
}

/* ---------------- Postgres backend ---------------- */

function pgStore(url: string): Store {
  const pool = new Pool({ connectionString: url, max: 5 });
  let ready: Promise<void> | null = null;

  // The advisory lock stops two cold-starting instances from racing on CREATE TABLE.
  const init = () =>
    (ready ??= (async () => {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT pg_advisory_xact_lock(727274)");
        await c.query(`CREATE TABLE IF NOT EXISTS deals (
          id text PRIMARY KEY,
          contractor text NOT NULL,
          client text,
          created_at bigint NOT NULL,
          data jsonb NOT NULL
        )`);
        await c.query("CREATE INDEX IF NOT EXISTS deals_contractor_idx ON deals (contractor)");
        await c.query("CREATE INDEX IF NOT EXISTS deals_client_idx ON deals (client)");
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        ready = null; // allow a retry on the next request
        throw e;
      } finally {
        c.release();
      }
    })());

  const rows = (r: { rows: { data: Deal }[] }) => r.rows.map((x) => x.data);

  return {
    async get(id) {
      await init();
      const r = await pool.query("SELECT data FROM deals WHERE id = $1", [id]);
      return r.rows[0]?.data ?? null;
    },
    async listFor(address) {
      await init();
      return rows(
        await pool.query("SELECT data FROM deals WHERE contractor = $1 OR client = $1 ORDER BY created_at DESC", [address]),
      );
    },
    async listAll() {
      await init();
      return rows(await pool.query("SELECT data FROM deals ORDER BY created_at DESC"));
    },
    async create(deal) {
      await init();
      await pool.query("INSERT INTO deals (id, contractor, client, created_at, data) VALUES ($1, $2, $3, $4, $5::jsonb)", [
        deal.id,
        deal.contractorAddress,
        deal.clientAddress ?? null,
        deal.createdAt,
        JSON.stringify(deal),
      ]);
      return deal;
    },
    async mutate(id, fn) {
      await init();
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const r = await c.query("SELECT data FROM deals WHERE id = $1 FOR UPDATE", [id]);
        if (!r.rows[0]) {
          await c.query("ROLLBACK");
          return null;
        }
        const deal = r.rows[0].data as Deal;
        fn(deal); // may throw to reject the change; the transaction then rolls back
        await c.query("UPDATE deals SET data = $2::jsonb, client = $3 WHERE id = $1", [
          id,
          JSON.stringify(deal),
          deal.clientAddress ?? null,
        ]);
        await c.query("COMMIT");
        return deal;
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
    async hashUsed(hash) {
      await init();
      // Transaction hashes are 64 hex characters, so this substring match can't collide with other text.
      const r = await pool.query("SELECT 1 FROM deals WHERE data::text LIKE $1 LIMIT 1", [`%"${hash}"%`]);
      return r.rows.length > 0;
    },
  };
}

/* ---------------- public API ---------------- */

let store: Store | null = null;
const s = () => (store ??= process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : fileStore());

export const getDeal = (id: string) => s().get(id);
export const listDealsFor = (address: string) => s().listFor(address);
export const listAllDeals = () => s().listAll();
export const createDeal = (deal: Deal) => s().create(deal);
export const mutateDeal = (id: string, fn: Mutator) => s().mutate(id, fn);
export const isHashUsed = (hash: string) => s().hashUsed(hash);
