import "server-only";
import { timingSafeEqual } from "crypto";
import { readFileSync } from "fs";
import { Keypair } from "@stellar/stellar-sdk";

// Admin access is off unless ADMIN_TOKEN is set to something long enough to resist guessing.
export function isAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN || "";
  if (expected.length < 12) return false;
  const given = Buffer.from(req.headers.get("x-admin-token") || "");
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

// The platform account signs dispute resolutions. Its secret lives in PLATFORM_SECRET on the server
// (or in .platform-secret during local development) and must never reach the browser.
export function platformKeypair(): Keypair {
  let secret = process.env.PLATFORM_SECRET?.trim();
  if (!secret && process.env.NODE_ENV !== "production") {
    try {
      secret = readFileSync(".platform-secret", "utf8").trim();
    } catch {}
  }
  if (!secret) throw new Error("PLATFORM_SECRET is not set on the server");
  const kp = Keypair.fromSecret(secret);
  const expected = process.env.NEXT_PUBLIC_PLATFORM_ADDRESS;
  if (expected && kp.publicKey() !== expected)
    throw new Error("PLATFORM_SECRET doesn't match NEXT_PUBLIC_PLATFORM_ADDRESS");
  return kp;
}
