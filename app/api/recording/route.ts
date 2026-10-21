import twilio from "twilio";
import { env } from "@/lib/env";
import { saveRecordingLink, uploadRecording } from "@/lib/google";
import { formatDate } from "@/lib/leads";
import { verifiedTwilioParams } from "@/lib/twilio";

export const maxDuration = 60;

/**
 * Callback da Twilio quando uma gravação termina: baixa o MP3, envia para a pasta do Google Drive,
 * liga o link ao contato pelo ID da ligação e apaga a cópia da Twilio.
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

  const to = new URL(req.url).searchParams.get("to")?.replace(/\D/g, "") ?? "";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const link = await uploadRecording(`${stamp}_${to}_${params.RecordingSid}.mp3`, Buffer.from(await audio.arrayBuffer()));

  await saveRecordingLink(formatDate(new Date()), params.CallSid ?? "", link);
  await twilio(accountSid, authToken).recordings(params.RecordingSid).remove();
  return new Response(null, { status: 204 });
}
