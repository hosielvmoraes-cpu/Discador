import twilio from "twilio";
import { env } from "@/lib/env";
import { uploadRecording, writeCells } from "@/lib/google";
import { verifiedTwilioParams } from "@/lib/twilio";

export const maxDuration = 60;

/**
 * Callback da Twilio quando uma gravação termina: baixa o MP3, envia para a pasta do Google Drive,
 * escreve o link na coluna Gravação do lead e apaga a cópia da Twilio.
 */
export async function POST(req: Request) {
  const params = await verifiedTwilioParams(req);
  if (!params) return new Response("Assinatura inválida", { status: 403 });
  if (params.RecordingStatus !== "completed" || !params.RecordingUrl) return new Response(null, { status: 204 });

  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  const audio = await fetch(`${params.RecordingUrl}.mp3`, {
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` },
  });
  if (!audio.ok) return new Response("Falha ao baixar a gravação", { status: 502 });

  const row = Number.parseInt(new URL(req.url).searchParams.get("row") ?? "", 10);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `${stamp}${Number.isInteger(row) ? `_linha-${row}` : ""}_${params.RecordingSid}.mp3`;
  const link = await uploadRecording(name, Buffer.from(await audio.arrayBuffer()));

  if (Number.isInteger(row) && row >= 2) await writeCells(row, "F", "F", [link]);
  await twilio(accountSid, authToken).recordings(params.RecordingSid).remove();
  return new Response(null, { status: 204 });
}
