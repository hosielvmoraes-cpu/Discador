import { NextResponse } from "next/server";
import { SDR_COOKIE, SESSION_COOKIE, sessionToken } from "@/lib/auth";

export async function POST(req: Request) {
  const { password, sdr } = (await req.json()) as { password?: string; sdr?: string };
  const name = sdr?.trim();
  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD || !name) {
    return NextResponse.json({ error: "Senha ou nome inválido" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  const options = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 12 };
  res.cookies.set(SESSION_COOKIE, await sessionToken(), options);
  res.cookies.set(SDR_COOKIE, encodeURIComponent(name), options);
  return res;
}
