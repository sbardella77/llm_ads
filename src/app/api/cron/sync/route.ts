import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { syncAll } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron invia "Authorization: Bearer $CRON_SECRET".
export async function GET(request: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const results = await syncAll();
  return NextResponse.json({ results });
}
