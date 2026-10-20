import { Readable } from "node:stream";
import { google } from "googleapis";
import { env } from "./env";
import { HEADERS, type Lead } from "./leads";
import { toE164 } from "./phone";

function auth() {
  const client = new google.auth.OAuth2(env("GOOGLE_CLIENT_ID"), env("GOOGLE_CLIENT_SECRET"));
  client.setCredentials({ refresh_token: env("GOOGLE_REFRESH_TOKEN") });
  return client;
}

function tab(): string {
  return process.env.GOOGLE_SHEET_TAB || "Leads";
}

function sheets() {
  return google.sheets({ version: "v4", auth: auth() });
}

export async function readLeads(): Promise<Lead[]> {
  const api = sheets();
  const spreadsheetId = env("GOOGLE_SHEET_ID");
  const res = await api.spreadsheets.values.get({ spreadsheetId, range: `${tab()}!A1:H` });
  const rows = res.data.values ?? [];

  const header = rows[0] ?? [];
  if (HEADERS.some((h, i) => header[i] !== h)) {
    await api.spreadsheets.values.update({
      spreadsheetId,
      range: `${tab()}!A1:H1`,
      valueInputOption: "RAW",
      requestBody: { values: [HEADERS] },
    });
  }

  return rows.slice(1).flatMap((cells, i) => {
    const [name = "", phone = "", status = "", date = "", note = "", recording = "", sdr = "", attempts = ""] =
      cells.map((c) => String(c ?? ""));
    if (!name && !phone) return [];
    return [{
      row: i + 2,
      name,
      phone,
      e164: toE164(phone),
      status,
      date,
      note,
      recording,
      sdr,
      attempts: Number.parseInt(attempts, 10) || 0,
    }];
  });
}

export async function readCell(row: number, column: string): Promise<string> {
  const res = await sheets().spreadsheets.values.get({
    spreadsheetId: env("GOOGLE_SHEET_ID"),
    range: `${tab()}!${column}${row}`,
  });
  return String(res.data.values?.[0]?.[0] ?? "");
}

export async function writeCells(row: number, from: string, to: string, values: (string | number)[]) {
  await sheets().spreadsheets.values.update({
    spreadsheetId: env("GOOGLE_SHEET_ID"),
    range: `${tab()}!${from}${row}:${to}${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [values] },
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
