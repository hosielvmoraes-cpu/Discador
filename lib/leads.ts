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

/** Resultados que tiram o número da fila de vez, mesmo que ele volte em outro arquivo. */
export const FINAL_STATUSES: readonly string[] = ["Não ligar mais", "Número errado", "Reunião marcada"];

export type Lead = {
  id: number;
  name: string;
  phone: string;
  e164: string | null;
  /** Demais colunas do arquivo (motivo, etapa, origem…), mostradas para o SDR. */
  details: [string, string][];
};

/** Resumo do histórico de um telefone, montado a partir da aba Histórico. */
export type PhoneHistory = {
  attempts: number;
  lastStatus: string;
  lastDate: string;
  lastNote: string;
};

export const HISTORY_HEADERS = ["Data", "Nome", "Telefone", "Status", "Observação", "SDR", "Gravação", "ID da ligação"];
export const RECORDING_HEADERS = ["Data", "ID da ligação", "Link"];

/** Data no formato gravado na planilha (dd/mm/aaaa hh:mm, horário de Brasília). */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

/**
 * Leads que devem ser ligados agora: telefone válido, sem resultado final no histórico,
 * sem contato hoje e abaixo do limite de tentativas. Telefones repetidos no arquivo entram uma vez só.
 */
export function queue(
  leads: Lead[],
  history: Record<string, PhoneHistory>,
  maxAttempts: number,
  now = new Date(),
): Lead[] {
  const today = formatDate(now).slice(0, 10);
  const seen = new Set<string>();
  return leads.filter((lead) => {
    if (!lead.e164 || seen.has(lead.e164)) return false;
    seen.add(lead.e164);
    const past = history[lead.e164];
    if (!past) return true;
    if (FINAL_STATUSES.includes(past.lastStatus)) return false;
    return past.attempts < maxAttempts && !past.lastDate.startsWith(today);
  });
}
