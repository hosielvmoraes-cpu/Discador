import type { Lead, PhoneHistory } from "@/lib/leads";

/** Um contato registrado pelo SDR. Fica guardado só neste aparelho. */
export type Contact = {
  at: string;
  date: string;
  name: string;
  phone: string;
  status: string;
  note: string;
  sdr: string;
};

export type StoredList = { fileName: string; leads: Lead[] };

const KEYS = { list: "discador:lista", history: "discador:historico", sdr: "discador:sdr" };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sem espaço ou armazenamento bloqueado: o app continua, só não lembra depois de fechar.
  }
}

export const loadList = () => read<StoredList | null>(KEYS.list, null);
export const saveList = (list: StoredList) => write(KEYS.list, list);
export const loadContacts = () => read<Contact[]>(KEYS.history, []);
export const saveContacts = (contacts: Contact[]) => write(KEYS.history, contacts);
export const loadSdr = () => read<string>(KEYS.sdr, "");
export const saveSdr = (sdr: string) => write(KEYS.sdr, sdr);

/** Tentativas e último contato por telefone, no formato usado pelas regras da fila. */
export function summarize(contacts: Contact[]): Record<string, PhoneHistory> {
  const summary: Record<string, PhoneHistory> = {};
  for (const c of contacts) {
    summary[c.phone] = {
      attempts: (summary[c.phone]?.attempts ?? 0) + 1,
      lastStatus: c.status,
      lastDate: c.date,
      lastNote: c.note,
    };
  }
  return summary;
}

function csvCell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Histórico em CSV separado por ; e com BOM, para abrir direto no Excel e no Google Sheets. */
export function contactsToCsv(contacts: Contact[]): string {
  const rows = [
    ["Data", "Nome", "Telefone", "Status", "Observação", "SDR"],
    ...contacts.map((c) => [c.date, c.name, c.phone, c.status, c.note, c.sdr]),
  ];
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
