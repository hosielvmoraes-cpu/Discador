import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SDR_COOKIE } from "@/lib/auth";
import { readLeads } from "@/lib/google";
import { queue } from "@/lib/leads";

export const dynamic = "force-dynamic";

export async function GET() {
  const leads = await readLeads();
  const maxAttempts = Number(process.env.MAX_ATTEMPTS) || 3;
  const sdr = decodeURIComponent((await cookies()).get(SDR_COOKIE)?.value ?? "");
  return NextResponse.json({
    sdr,
    total: leads.length,
    invalid: leads.filter((l) => !l.e164).length,
    queue: queue(leads, maxAttempts),
  });
}
