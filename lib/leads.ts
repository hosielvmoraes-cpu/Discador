export const STATUSES = [
  "Reunião marcada",
  "Atendeu - sem interesse",
  "Retornar depois",
  "Não atendeu",
  "Caixa postal",
  "Número errado",
  "WhatsApp enviado",
  "Não ligar mais",
] as const;

export type Status = (typeof STATUSES)[number];

/** Resultados que voltam para a fila em outro dia, até o limite de tentativas. */
export const RETRY_STATUSES: readonly string[] = ["Não atendeu", "Caixa postal", "Retornar depois", "WhatsApp enviado"];

export type Lead = {
  row: number;
  name: string;
  phone: string;
  e164: string | null;
  status: string;
  date: string;
  note: string;
  recording: string;
  sdr: string;
  attempts: number;
};

export const HEADERS = ["Nome", "Telefone", "Status", "Data", "Observação", "Gravação", "SDR", "Tentativas"];

/** Data no formato gravado na planilha (dd/mm/aaaa hh:mm, horário de Brasília). */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

/** Leads que devem ser ligados agora: nunca contatados, ou para nova tentativa em outro dia. */
export function queue(leads: Lead[], maxAttempts: number, now = new Date()): Lead[] {
  const today = formatDate(now).slice(0, 10);
  return leads.filter((lead) => {
    if (!lead.e164) return false;
    if (!lead.status) return true;
    if (!RETRY_STATUSES.includes(lead.status)) return false;
    return lead.attempts < maxAttempts && !lead.date.startsWith(today);
  });
}
