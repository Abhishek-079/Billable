import { NextResponse } from "next/server";
import { getUsdcInr } from "@/lib/rate";

export async function GET() {
  return NextResponse.json({ inrPerUsdc: await getUsdcInr() });
}
