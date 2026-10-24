import "server-only";

// Simple in-memory limiter, per instance. It blunts casual abuse of the public routes (above all
// the escrow proxy, which spends our API quota). On serverless hosts each instance keeps its own
// counters, so for serious traffic put a shared limiter (e.g. Upstash) in front.
const buckets = new Map<string, { n: number; reset: number }>();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();
}

// Returns true when the caller is over the limit.
export function limited(req: Request, bucket: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  const key = `${bucket}:${clientIp(req)}`;
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  b.n += 1;
  return b.n > max;
}
