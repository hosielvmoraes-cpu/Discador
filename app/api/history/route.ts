import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SDR_COOKIE } from "@/lib/auth";
import { readHistory } from "@/lib/google";

export const dynamic = "force-dynamic";

/** Histórico por telefone, usado pelo navegador para montar a fila a partir do arquivo enviado. */
export async function GET() {
  const sdr = decodeURIComponent((await cookies()).get(SDR_COOKIE)?.value ?? "");
  return NextResponse.json({
    sdr,
    maxAttempts: Number(process.env.MAX_ATTEMPTS) || 3,
    history: await readHistory(),
  });
}
