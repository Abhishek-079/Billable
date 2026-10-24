import "server-only";

// INR per 1 USDC. Never invents a number: returns null if the lookup fails, and the
// records/invoices then say "rate unavailable" instead of showing a made-up value.
let cache: { at: number; rate: number } | null = null;

export async function getUsdcInr(): Promise<number | null> {
  if (cache && Date.now() - cache.at < 60_000) return cache.rate;
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=inr",
      { cache: "no-store", signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return cache?.rate ?? null;
    const json = await res.json();
    const rate = Number(json?.["usd-coin"]?.inr);
    if (!Number.isFinite(rate) || rate <= 0) return cache?.rate ?? null;
    cache = { at: Date.now(), rate };
    return rate;
  } catch {
    return cache?.rate ?? null;
  }
}
