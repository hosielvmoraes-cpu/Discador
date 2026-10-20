import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import twilio from "twilio";
import { SDR_COOKIE } from "@/lib/auth";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Token para o navegador do SDR fazer chamadas pela Twilio (vale 1 hora). */
export async function GET() {
  const sdr = decodeURIComponent((await cookies()).get(SDR_COOKIE)?.value ?? "sdr");
  const { AccessToken } = twilio.jwt;
  const token = new AccessToken(env("TWILIO_ACCOUNT_SID"), env("TWILIO_API_KEY"), env("TWILIO_API_SECRET"), {
    identity: sdr.replace(/[^\w.-]/g, "_") || "sdr",
    ttl: 3600,
  });
  token.addGrant(new AccessToken.VoiceGrant({ outgoingApplicationSid: env("TWILIO_TWIML_APP_SID") }));
  return NextResponse.json({ token: token.toJwt() });
}
