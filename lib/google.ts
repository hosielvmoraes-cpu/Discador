import { Readable } from "node:stream";
import { google } from "googleapis";
import { env } from "./env";
import { HISTORY_HEADERS, RECORDING_HEADERS, type PhoneHistory } from "./leads";

const HISTORY_TAB = "Histórico";
const RECORDINGS_TAB = "Gravações";

function auth() {
  const client = new google.auth.OAuth2(env("GOOGLE_CLIENT_ID"), env("GOOGLE_CLIENT_SECRET"));
  client.setCredentials({ refresh_token: env("GOOGLE_REFRESH_TOKEN") });
  return client;
}

function sheets() {
  return google.sheets({ version: "v4", auth: auth() });
}

/** Cria as abas Histórico e Gravações com cabeçalho, se ainda não existirem. */
async function ensureTabs() {
  const api = sheets();
  const spreadsheetId = env("GOOGLE_SHEET_ID");
  const meta = await api.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  const existing = new Set(meta.data.sheets?.map((s) => s.properties?.title));
  const missing = [
    [HISTORY_TAB, HISTORY_HEADERS],
    [RECORDINGS_TAB, RECORDING_HEADERS],
  ].filter(([title]) => !existing.has(title as string)) as [string, string[]][];
  if (!missing.length) return;

  await api.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: missing.map(([title]) => ({ addSheet: { properties: { title } } })) },
  });
  await api.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: missing.map(([title, headers]) => ({ range: `${title}!A1`, values: [headers] })),
    },
  });
}

async function readTab(tab: string): Promise<string[][]> {
  await ensureTabs();
  const res = await sheets().spreadsheets.values.get({ spreadsheetId: env("GOOGLE_SHEET_ID"), range: `${tab}!A2:H` });
  return (res.data.values ?? []).map((row) => row.map((c) => String(c ?? "")));
}

async function append(tab: string, values: string[]) {
  await ensureTabs();
  await sheets().spreadsheets.values.append({
    spreadsheetId: env("GOOGLE_SHEET_ID"),
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });
}

/** Tentativas e último contato de cada telefone (E.164), em ordem de registro. */
export async function readHistory(): Promise<Record<string, PhoneHistory>> {
  const summary: Record<string, PhoneHistory> = {};
  for (const [date = "", , phone = "", status = "", note = ""] of await readTab(HISTORY_TAB)) {
    if (!phone) continue;
    const prev = summary[phone];
    summary[phone] = { attempts: (prev?.attempts ?? 0) + 1, lastStatus: status, lastDate: date, lastNote: note };
  }
  return summary;
}

export type HistoryEntry = {
  date: string;
  name: string;
  phone: string;
  status: string;
  note: string;
  sdr: string;
  callSid: string;
};

/** Registra um contato. Se a gravação dessa ligação já chegou, o link entra junto. */
export async function appendHistory(entry: HistoryEntry) {
  let link = "";
  if (entry.callSid) {
    const recording = (await readTab(RECORDINGS_TAB)).find(([, sid]) => sid === entry.callSid);
    link = recording?.[2] ?? "";
  }
  await append(HISTORY_TAB, [
    entry.date, entry.name, entry.phone, entry.status, entry.note, entry.sdr, link, entry.callSid,
  ]);
}

/** Guarda o link da gravação e preenche a coluna Gravação do contato, se ele já foi registrado. */
export async function saveRecordingLink(date: string, callSid: string, link: string) {
  await append(RECORDINGS_TAB, [date, callSid, link]);
  const rowIdx = (await readTab(HISTORY_TAB)).findIndex((row) => row[7] === callSid);
  if (rowIdx < 0) return;
  await sheets().spreadsheets.values.update({
    spreadsheetId: env("GOOGLE_SHEET_ID"),
    range: `${HISTORY_TAB}!G${rowIdx + 2}`,
    valueInputOption: "RAW",
    requestBody: { values: [[link]] },
  });
}

/** Envia o áudio para a pasta de gravações e devolve o link de visualização. */
export async function uploadRecording(name: string, audio: Buffer): Promise<string> {
  const drive = google.drive({ version: "v3", auth: auth() });
  const res = await drive.files.create({
    requestBody: { name, parents: [env("GOOGLE_DRIVE_FOLDER_ID")] },
    media: { mimeType: "audio/mpeg", body: Readable.from(audio) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  return res.data.webViewLink ?? `https://drive.google.com/file/d/${res.data.id}/view`;
}
