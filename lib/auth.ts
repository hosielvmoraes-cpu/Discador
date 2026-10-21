export const SESSION_COOKIE = "discador_sessao";
export const SDR_COOKIE = "discador_sdr";

/** Token de sessão derivado da senha; trocar APP_PASSWORD ou SESSION_SECRET derruba todas as sessões. */
export async function sessionToken(): Promise<string> {
  const password = process.env.APP_PASSWORD ?? "";
  const secret = process.env.SESSION_SECRET ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(password));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}
