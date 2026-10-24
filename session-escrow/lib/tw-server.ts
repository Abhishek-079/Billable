import "server-only";

// Server-side call to the Trustless Work API (used where the server itself must act, e.g. dispute resolution).
export async function twPost<T = any>(path: string, body: unknown): Promise<T> {
  const key = process.env.TW_API_KEY;
  if (!key) throw new Error("TW_API_KEY is not set on the server");
  const res = await fetch(`${process.env.TW_BASE_URL || "https://dev.api.trustlesswork.com"}/${path}`, {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || json?.raw || res.statusText;
    throw new Error(`${path}: ${Array.isArray(msg) ? msg.join(", ") : msg}`);
  }
  return json as T;
}
