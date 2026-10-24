import { NextRequest, NextResponse } from "next/server";
import { limited } from "@/lib/ratelimit";

// Server-side proxy to the Trustless Work REST API so the API key never reaches the browser.
// Only the escrow endpoints this app uses are reachable; anything else (such as API-key admin) is refused.
const BASE = process.env.TW_BASE_URL || "https://dev.api.trustlesswork.com";
const ALLOWED = ["deployer/single-release", "deployer/multi-release", "escrow/single-release/", "escrow/multi-release/", "helper/"];

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (limited(req, "tw-proxy", 120)) return NextResponse.json({ error: "Too many requests, slow down" }, { status: 429 });
  const key = process.env.TW_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "TW_API_KEY is not set. Copy .env.example to .env.local and add your key." },
      { status: 500 },
    );
  }
  const { path } = await ctx.params;
  const target = path.join("/");
  if (target.includes("..") || !ALLOWED.some((p) => target === p || target.startsWith(p))) {
    return NextResponse.json({ error: `Path not allowed: ${target}` }, { status: 403 });
  }
  const url = `${BASE}/${target}${req.nextUrl.search}`;
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const upstream = await fetch(url, {
    method: req.method,
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: hasBody ? await req.text() : undefined,
    cache: "no-store",
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
