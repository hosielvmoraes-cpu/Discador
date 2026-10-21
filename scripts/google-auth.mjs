// Gera o GOOGLE_REFRESH_TOKEN da conta Google dona da planilha e da pasta de gravações.
// Uso: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run google-auth
import http from "node:http";
import { google } from "googleapis";

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error("Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET antes de rodar.");
  process.exit(1);
}

const PORT = 53682;
const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, `http://localhost:${PORT}`);
const url = client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"],
});

const server = http.createServer(async (req, res) => {
  const code = new URL(req.url ?? "/", `http://localhost:${PORT}`).searchParams.get("code");
  if (!code) {
    res.end("Sem código de autorização.");
    return;
  }
  const { tokens } = await client.getToken(code);
  res.end("Pronto! Volte ao terminal.");
  console.log(`\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  server.close();
});

server.listen(PORT, () => {
  console.log("Abra este link no navegador e autorize com a conta Google da Stronix:\n");
  console.log(url);
});
