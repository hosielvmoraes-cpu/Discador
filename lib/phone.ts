import { parsePhoneNumberFromString } from "libphonenumber-js";

/** Converte o telefone digitado na planilha para E.164 (+55...). Retorna null se for inválido. */
export function toE164(raw: string): string | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  const parsed = parsePhoneNumberFromString(cleaned, "BR");
  return parsed && parsed.isValid() ? parsed.number : null;
}

/** Link do WhatsApp para o número em E.164, com mensagem opcional. */
export function whatsappLink(e164: string, message?: string): string {
  const digits = e164.replace(/\D/g, "");
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${text}`;
}

export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}
