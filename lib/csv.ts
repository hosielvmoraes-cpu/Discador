import { toE164 } from "./phone";
import type { Lead } from "./leads";

/** Lê CSV separado por ; ou , (detectado pelo cabeçalho), com aspas e BOM do Excel. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, "");
  const firstLine = input.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim()));
}

const NAME_COLUMNS = ["nome", "nome do lead", "cliente"];
const PHONE_COLUMNS = ["whatsapp", "telefone", "celular", "telefone do responsável"];
/** Colunas que nunca vão para a tela nem para o servidor. */
const HIDDEN_COLUMNS = ["cpf"];

/** Converte o arquivo exportado (ex.: Stronilead) em leads. O telefone vem da primeira coluna de telefone preenchida. */
export function importLeads(text: string): Lead[] {
  const [header = [], ...rows] = parseCsv(text);
  const columns = header.map((h) => h.trim());
  const lower = columns.map((h) => h.toLowerCase());
  const nameIdx = lower.findIndex((h) => NAME_COLUMNS.includes(h));
  const phoneIdxs = PHONE_COLUMNS.map((c) => lower.indexOf(c)).filter((i) => i >= 0);

  return rows.map((cells, i) => {
    const phoneIdx = phoneIdxs.find((idx) => cells[idx]?.trim()) ?? phoneIdxs[0] ?? -1;
    const phone = (cells[phoneIdx] ?? "").trim();
    const details = columns.flatMap((col, idx): [string, string][] => {
      const value = (cells[idx] ?? "").trim();
      if (!value || idx === nameIdx || idx === phoneIdx || HIDDEN_COLUMNS.includes(lower[idx])) return [];
      return [[col, value]];
    });
    return {
      id: i,
      name: (cells[nameIdx] ?? "").trim(),
      phone,
      e164: toE164(phone),
      details,
    };
  });
}
