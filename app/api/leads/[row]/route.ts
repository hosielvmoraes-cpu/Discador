import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SDR_COOKIE } from "@/lib/auth";
import { readCell, writeCells } from "@/lib/google";
import { STATUSES, formatDate } from "@/lib/leads";

/** Registra o resultado do contato: status, data, observação, SDR e tentativas (colunas C, D, E, G, H). */
export async function PATCH(req: Request, { params }: { params: Promise<{ row: string }> }) {
  const row = Number.parseInt((await params).row, 10);
  const { status, note = "" } = (await req.json()) as { status?: string; note?: string };
  if (!Number.isInteger(row) || row < 2 || !STATUSES.includes(status as (typeof STATUSES)[number])) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }
  const sdr = decodeURIComponent((await cookies()).get(SDR_COOKIE)?.value ?? "");
  const attempts = (Number.parseInt(await readCell(row, "H"), 10) || 0) + 1;
  await writeCells(row, "C", "E", [status!, formatDate(new Date()), note]);
  await writeCells(row, "G", "H", [sdr, attempts]);
  return NextResponse.json({ ok: true, attempts });
}
