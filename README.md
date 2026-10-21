# Discador Stronix

Discador web para SDRs: o SDR sobe a lista exportada do Stronilead (CSV), liga pelo navegador com um clique,
abre o WhatsApp do lead, e cada contato fica registrado numa planilha de histórico no Google, com a gravação
da ligação no Google Drive. O SDR não digita nenhum número.

## Como funciona

1. O SDR entra com o nome dele e a senha da equipe.
2. Clica em **Subir lista (CSV)** e escolhe o arquivo exportado do Stronilead. O arquivo é lido no próprio
   navegador e fica salvo nele até a próxima lista; o CPF nunca é lido.
3. A fila mostra os leads da lista que ainda devem ser contatados, conforme o histórico: fica fora quem já foi
   contatado hoje, quem chegou a `MAX_ATTEMPTS` tentativas e quem teve resultado final (Reunião marcada,
   Número errado ou Não ligar mais), mesmo que apareça de novo numa lista futura.
4. O cartão do lead mostra as demais colunas do arquivo (motivo da perda, etapa, origem, consultor…) e o último
   contato registrado.
5. **Ligar** (`L`) depende de `CALL_MODE`:
   - `celular` (padrão, sem custo): o SDR usa o discador no celular da Stronix e o botão abre o discador do
     aparelho com o número preenchido. A ligação sai pelo plano da operadora; a gravação fica com o gravador do
     próprio celular (veja "Gravação no modo celular").
   - `twilio`: liga pelo navegador com o número oficial como identificador. Ao atender, o lead ouve o aviso de
     gravação e é conectado ao SDR.
6. **WhatsApp** (`W`) abre a conversa com uma mensagem pronta.
7. O SDR escolhe o resultado (`1` a `8`), escreve uma observação e clica em **Salvar e próximo** (`Enter`).
   Com "Ligar para o próximo automaticamente" ligado, o próximo lead é chamado em seguida.
8. No modo `twilio`, quando a gravação termina, o MP3 vai para a pasta do Google Drive e o link aparece no histórico.

## Gravação no modo celular

Ative a gravação automática de ligações no Android que tem o chip do número oficial e sincronize a pasta de
gravações com o Google Drive (por exemplo, com o app Autosync). No modo celular, a coluna Gravação do histórico
fica vazia; a gravação é encontrada pela data e pelo número do lead.

Outros atalhos: `D` ou `Esc` desliga, `M` deixa no mudo.

## Arquivo de leads

CSV separado por `;` ou `,`, com cabeçalho. O discador procura:

- **Nome**: coluna `Nome`.
- **Telefone**: a primeira preenchida entre `WhatsApp`, `Telefone`, `Celular` e `Telefone do responsável`,
  em qualquer formato brasileiro, como `(51) 9 9829-0439`.

As demais colunas aparecem no cartão do lead, exceto `CPF`. Linhas com telefone inválido ficam fora da fila e
aparecem no contador do topo. O export de perdas do Stronilead já está nesse formato.

## Planilha de histórico

Uma planilha do Google, vazia no começo. O discador cria duas abas:

- **Histórico**: uma linha por contato, com Data, Nome, Telefone, Status, Observação, SDR, Gravação e ID da ligação.
- **Gravações**: o link de cada gravação, ligado ao contato pelo ID da ligação.

## Configuração

Copie `.env.example` para `.env.local` e preencha conforme os passos abaixo.

### 1. Google (planilha de histórico)

1. Crie a planilha de histórico (vazia). O ID está na URL: `docs.google.com/spreadsheets/d/<GOOGLE_SHEET_ID>/...`.
2. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a **Google Sheets API**.
3. Em **IAM e administrador → Contas de serviço**, crie uma conta de serviço (sem papéis) e, na aba **Chaves**,
   adicione uma chave do tipo JSON. Do arquivo baixado, use `client_email` em `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   e `private_key` em `GOOGLE_PRIVATE_KEY`.
4. Compartilhe a planilha com o `client_email` da conta de serviço, como **Editor**.

No modo `twilio`, as gravações vão para o seu Drive pessoal, e uma conta de serviço não pode gravar nele. Nesse
caso, use OAuth: ative também a **Google Drive API**, crie um **ID do cliente OAuth** do tipo
**App para computador**, publique o app na tela de consentimento (em modo de teste o token expira em 7 dias) e gere
o refresh token com `GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run google-auth`.

### 2. Twilio (telefonia, só para `CALL_MODE=twilio`)

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
