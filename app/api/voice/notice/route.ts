import twilio from "twilio";
import { twiml, verifiedTwilioParams } from "@/lib/twilio";

/** Mensagem tocada para o lead assim que ele atende, antes de conectar com o SDR. */
export async function POST(req: Request) {
  if (!(await verifiedTwilioParams(req))) return new Response("Assinatura inválida", { status: 403 });
  const response = new twilio.twiml.VoiceResponse();
  const notice = process.env.RECORDING_NOTICE ?? "Esta ligação está sendo gravada.";
  if (notice) response.say({ language: "pt-BR", voice: "Polly.Camila" }, notice);
  return twiml(response.toString());
}
