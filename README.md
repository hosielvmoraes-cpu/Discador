# Discador Stronix

Discador web para SDRs: lê os leads de uma planilha do Google, liga pelo navegador com um clique,
abre o WhatsApp do lead, grava a ligação no Google Drive e escreve o resultado de volta na planilha.
O SDR não digita nenhum número.

## Como funciona

1. O SDR entra com o nome dele e a senha da equipe.
2. A fila do turno mostra os leads novos e os que devem receber nova tentativa (não atendeu, caixa postal,
   retornar depois ou WhatsApp enviado em outro dia, até `MAX_ATTEMPTS` tentativas).
3. **Ligar** (`L`) chama o lead pela Twilio com o número oficial da Stronix como identificador.
   Ao atender, o lead ouve o aviso de gravação e é conectado ao SDR.
4. **WhatsApp** (`W`) abre a conversa com uma mensagem pronta.
5. O SDR escolhe o resultado (`1` a `8`), escreve uma observação e clica em **Salvar e próximo** (`Enter`).
   Com "Ligar para o próximo automaticamente" ligado, o próximo lead é chamado em seguida.
6. Quando a gravação termina, o MP3 vai para a pasta do Google Drive e o link aparece na coluna Gravação.

Outros atalhos: `D` ou `Esc` desliga, `M` deixa no mudo.

## Planilha

Uma aba chamada `Leads` (ou o nome em `GOOGLE_SHEET_TAB`). Basta preencher as colunas A e B; o discador
cria o cabeçalho e preenche as demais.

| A | B | C | D | E | F | G | H |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Nome | Telefone | Status | Data | Observação | Gravação | SDR | Tentativas |

O telefone pode estar em qualquer formato brasileiro, como `(11) 98765-4321` ou `11987654321`.
Linhas com telefone inválido ficam fora da fila e aparecem no contador do topo.

## Configuração

Copie `.env.example` para `.env.local` e preencha conforme os passos abaixo.

### 1. Google (planilha e gravações)

1. Crie a planilha de leads e uma pasta no Drive para as gravações. Os IDs estão nas URLs:
   `docs.google.com/spreadsheets/d/<GOOGLE_SHEET_ID>/...` e `drive.google.com/drive/folders/<GOOGLE_DRIVE_FOLDER_ID>`.
2. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a
   **Google Sheets API** e a **Google Drive API**.
3. Configure a tela de consentimento OAuth e adicione a conta dona da planilha como usuário de teste
   (ou use o tipo "Interno" se for Google Workspace).
4. Crie uma credencial **ID do cliente OAuth** do tipo **App para computador** e copie o ID e a chave secreta.
5. Gere o refresh token, entrando com a conta dona da planilha e da pasta:

   ```bash
   npm install
   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run google-auth
   ```

### 2. Twilio (telefonia)

1. Crie uma conta em [twilio.com](https://www.twilio.com/) e faça o upgrade da conta (a conta de teste só liga
   para números verificados).
2. Em **Voice > Settings > Geo permissions**, libere ligações para o Brasil.
3. Em **Phone Numbers > Verified Caller IDs**, verifique o número oficial da Stronix. A Twilio liga para
   ele e pede um código. Use esse número em `TWILIO_CALLER_ID` no formato `+55...`.
4. Em **Account > API keys**, crie uma API Key (`TWILIO_API_KEY` e `TWILIO_API_SECRET`).
5. Em **Voice > TwiML > TwiML Apps**, crie um app com **Voice Request URL** =
   `https://<seu-dominio>/api/voice` (método POST) e use o SID dele em `TWILIO_TWIML_APP_SID`.

Faça uma ligação de teste para confirmar que o número oficial aparece no celular do destinatário. Algumas
operadoras brasileiras podem não repassar o identificador de um número verificado; se isso acontecer, a
alternativa é portar o número oficial para a Twilio ou para uma operadora VoIP nacional.

### 3. Publicação

O jeito mais simples é a [Vercel](https://vercel.com/): importe este repositório, cadastre as variáveis de
`.env.example` e publique. `PUBLIC_BASE_URL` precisa ser exatamente a URL pública do app, porque a Twilio
assina as requisições com ela.

Para rodar localmente: `npm run dev`. As ligações precisam de uma URL pública para os webhooks da Twilio
(por exemplo, com um túnel como o ngrok).

## Desenvolvimento

```bash
npm test        # testes
npm run lint    # checagem de tipos
npm run build   # build de produção
```

## Aviso legal

A Anatel exige o prefixo 0303 em ligações de telemarketing ativo. A decisão atual é ligar pelo número oficial
da Stronix, assumindo esse risco. Toda ligação é gravada e o lead ouve o aviso de gravação
(`RECORDING_NOTICE`) antes de ser conectado. Pedidos de "Não ligar mais" tiram o lead da fila de vez.
