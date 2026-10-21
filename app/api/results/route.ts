import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SDR_COOKIE } from "@/lib/auth";
import { appendHistory } from "@/lib/google";
import { STATUSES, formatDate } from "@/lib/leads";
import { toE164 } from "@/lib/phone";

/** Registra o resultado de um contato na aba Histórico. */
export async function POST(req: Request) {
  const body = (await req.json()) as { name?: string; phone?: string; status?: string; note?: string; callSid?: string };
  const phone = toE164(body.phone ?? "");
  if (!phone || !STATUSES.includes(body.status as (typeof STATUSES)[number])) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  await appendHistory({
    date: formatDate(new Date()),
    name: body.name ?? "",
    phone,
    status: body.status!,
    note: body.note ?? "",
    sdr: decodeURIComponent((await cookies()).get(SDR_COOKIE)?.value ?? ""),
    callSid: /^CA[0-9a-f]{32}$/.test(body.callSid ?? "") ? body.callSid! : "",
  });
  return NextResponse.json({ ok: true });
}
