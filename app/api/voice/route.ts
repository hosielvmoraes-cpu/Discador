import twilio from "twilio";
import { baseUrl, env } from "@/lib/env";
import { toE164 } from "@/lib/phone";
import { twiml, verifiedTwilioParams } from "@/lib/twilio";

/**
 * Webhook do TwiML App: chamado pela Twilio quando o navegador do SDR inicia uma ligação.
 * Liga para o lead pelo número oficial, grava a conversa e avisa o lead que a ligação é gravada.
 */
export async function POST(req: Request) {
  const params = await verifiedTwilioParams(req);
  if (!params) return new Response("Assinatura inválida", { status: 403 });

  const response = new twilio.twiml.VoiceResponse();
  const to = toE164(params.To ?? "");
  const row = Number.parseInt(params.row ?? "", 10);
  if (!to) {
    response.say({ language: "pt-BR" }, "Número inválido.");
    return twiml(response.toString());
  }

  const recordingCallback = new URL(`${baseUrl()}/api/recording`);
  if (Number.isInteger(row)) recordingCallback.searchParams.set("row", String(row));

  const dial = response.dial({
    callerId: env("TWILIO_CALLER_ID"),
    answerOnBridge: true,
    record: "record-from-answer-dual",
    recordingStatusCallback: recordingCallback.toString(),
    recordingStatusCallbackEvent: ["completed"],
  });
  dial.number({ url: `${baseUrl()}/api/voice/notice` }, to);
  return twiml(response.toString());
}
