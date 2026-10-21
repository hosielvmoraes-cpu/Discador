import twilio from "twilio";
import { baseUrl, env } from "./env";

/** Lê os parâmetros do webhook e confere a assinatura da Twilio. Retorna null se a requisição não veio da Twilio. */
export async function verifiedTwilioParams(req: Request): Promise<Record<string, string> | null> {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    params[key] = String(value);
  });
  const { pathname, search } = new URL(req.url);
  const url = `${baseUrl()}${pathname}${search}`;
  const signature = req.headers.get("x-twilio-signature") ?? "";
  return twilio.validateRequest(env("TWILIO_AUTH_TOKEN"), signature, url, params) ? params : null;
}

export function twiml(body: string): Response {
  return new Response(body, { headers: { "Content-Type": "text/xml" } });
}
