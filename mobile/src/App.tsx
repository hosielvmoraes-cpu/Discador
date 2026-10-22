import { useEffect, useMemo, useRef, useState } from "react";
import { importLeads } from "@/lib/csv";
import { STATUSES, formatDate, queue, type Lead } from "@/lib/leads";
import { fillTemplate, whatsappLink } from "@/lib/phone";
import { findRecordings, openExternal, openRecording, shareCsv } from "./native";
import {
  type Contact,
  type StoredList,
  contactsToCsv,
  linkRecordings,
  loadContacts,
  loadList,
  loadSdr,
  saveContacts,
  saveList,
  saveSdr,
  summarize,
} from "./storage";

const MAX_ATTEMPTS = 3;

/** Cor de cada resultado: verde é avanço, cinza é tentar de novo, vermelho encerra o lead. */
const TONE: Record<string, "good" | "neutral" | "bad"> = {
  "Reunião marcada": "good",
  "Retornar depois": "good",
  "Atendeu - sem interesse": "neutral",
  "Não atendeu": "neutral",
  "Caixa postal": "neutral",
  "WhatsApp enviado": "neutral",
  "Número errado": "bad",
  "Não ligar mais": "bad",
};
const WHATSAPP_TEMPLATE = "Olá {nome}, tudo bem? Aqui é {sdr} da Stronix.";

/** Lê o arquivo como UTF-8 e, se vier com caracteres quebrados, como Windows-1252 (Excel antigo). */
async function readText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  if (/\.xlsx?$/i.test(file.name)) {
    const XLSX = await import("xlsx");
    const book = XLSX.read(buffer, { type: "array" });
    return XLSX.utils.sheet_to_csv(book.Sheets[book.SheetNames[0]], { FS: ";", blankrows: false });
  }
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
}

export default function App() {
  const [sdr, setSdr] = useState(loadSdr);
  const [list, setList] = useState<StoredList | null>(loadList);
  const [contacts, setContacts] = useState<Contact[]>(loadContacts);
  const [skipped, setSkipped] = useState<number[]>([]);
  const [called, setCalled] = useState(false);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [autoDial, setAutoDial] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const calledAtRef = useRef<string | undefined>(undefined);
  const contactsRef = useRef(contacts);
  contactsRef.current = contacts;

  const history = useMemo(() => summarize(contacts), [contacts]);
  const pending = useMemo(() => {
    const q = queue(list?.leads ?? [], history, MAX_ATTEMPTS);
    // Leads pulados vão para o fim da fila, na ordem em que foram pulados.
    const rank = (lead: Lead) => skipped.indexOf(lead.id);
    return [...q].sort((a, b) => rank(a) - rank(b));
  }, [list, history, skipped]);
  const current = pending[0];
  const invalid = list?.leads.filter((l) => !l.e164).length ?? 0;
  const today = formatDate(new Date()).slice(0, 10);
  const todayContacts = contacts.filter((c) => c.date.startsWith(today));

  useEffect(() => saveSdr(sdr), [sdr]);

  /** Procura as gravações das ligações recentes que ainda não têm gravação ligada. */
  async function syncRecordings() {
    const pendingContacts = contactsRef.current.filter(
      (c) => c.calledAt && !c.recording && Date.now() - Date.parse(c.at) < 24 * 60 * 60_000,
    );
    if (!pendingContacts.length) return;
    const since = Math.min(...pendingContacts.map((c) => Date.parse(c.calledAt!))) - 60_000;
    try {
      const linked = linkRecordings(contactsRef.current, await findRecordings(since));
      if (linked) {
        setContacts(linked);
        saveContacts(linked);
      }
    } catch {
      setError("Permita o acesso às gravações para o discador ligar cada gravação ao lead.");
    }
  }

  useEffect(() => {
    syncRecordings();
    const onVisible = () => document.visibilityState === "visible" && syncRecordings();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (/\.pdf$/i.test(file.name)) {
      setError("O app não lê PDF. Use a planilha em CSV ou Excel (.xlsx ou .xls).");
      return;
    }
    let leads;
    try {
      leads = importLeads(await readText(file));
    } catch {
      setError("Não consegui abrir esse arquivo. Use a planilha em CSV ou Excel (.xlsx ou .xls).");
      return;
    }
    if (!leads.length || leads.every((l) => !l.e164)) {
      setError("Não encontrei leads com telefone nesse arquivo. Ele precisa de uma coluna Nome e uma de WhatsApp ou Telefone.");
      return;
    }
    const next = { fileName: file.name, leads };
    setList(next);
    saveList(next);
    setSkipped([]);
    resetLead();
  }

  function resetLead() {
    setStatus("");
    setNote("");
    setCalled(false);
    calledAtRef.current = undefined;
  }

  function call(lead: Lead | undefined = current) {
    if (!lead?.e164) return;
    calledAtRef.current = new Date().toISOString();
    openExternal(`tel:${lead.e164}`);
    setCalled(true);
  }

  function openWhatsapp() {
    if (!current?.e164) return;
    const message = fillTemplate(WHATSAPP_TEMPLATE, { nome: current.name.split(" ")[0] ?? "", sdr: sdr || "a equipe" });
    openExternal(whatsappLink(current.e164, message));
    if (!status) setStatus("WhatsApp enviado");
  }

  function save() {
    if (!current?.e164 || !status) return;
    const now = new Date();
    const next = [
      ...contacts,
      {
        at: now.toISOString(),
        date: formatDate(now),
        name: current.name,
        phone: current.e164,
        status,
        note,
        sdr,
        calledAt: calledAtRef.current,
      },
    ];
    setContacts(next);
    saveContacts(next);
    contactsRef.current = next;
    resetLead();
    // A gravação aparece alguns segundos depois de desligar.
    setTimeout(syncRecordings, 4000);
    if (autoDial) {
      const following = queue(list?.leads ?? [], summarize(next), MAX_ATTEMPTS).filter((l) => !skipped.includes(l.id))[0];
      if (following) setTimeout(() => call(following), 800);
    }
  }

  function skip() {
    if (!current) return;
    setSkipped((s) => [...s.filter((id) => id !== current.id), current.id]);
    resetLead();
  }

  async function exportResults(all: boolean) {
    const rows = all ? contacts : todayContacts;
    if (!rows.length) {
      setError("Ainda não há contatos registrados para exportar.");
      return;
    }
    setError("");
    const stamp = new Date().toISOString().slice(0, 10);
    try {
      await shareCsv(`resultados-discador-${all ? "completo" : stamp}.csv`, contactsToCsv(rows));
    } catch {
      setError("Não foi possível exportar os resultados.");
    }
  }

  const past = current?.e164 ? history[current.e164] : undefined;
  const lastRecording = current?.e164
    ? [...contacts].reverse().find((c) => c.phone === current.e164)?.recording
    : undefined;

  async function listen(uri: string) {
    try {
      await openRecording(uri);
    } catch {
      setError("Não foi possível abrir a gravação. Ela pode ter sido apagada do celular.");
    }
  }
  const fileInput = (
    <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,text/csv,text/comma-separated-values,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" hidden onChange={onFile} />
  );
  const pickFile = () => fileInputRef.current?.click();

  if (!sdr.trim()) {
    return (
      <main className="app">
        <h1>Discador Stronix</h1>
        <section className="card hero">
          <p className="hero-title">Quem está ligando hoje?</p>
          <form onSubmit={(e) => {
            e.preventDefault();
            const name = new FormData(e.currentTarget).get("sdr")?.toString().trim();
            if (name) setSdr(name);
          }}>
            <input name="sdr" placeholder="Digite seu nome" autoComplete="name" autoFocus />
            <button className="btn-primary btn-big" type="submit">Começar</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app">
      {fileInput}
      <header className="app-header">
        <div>
          <h1>Discador Stronix</h1>
          <span className="muted">
            Olá, {sdr} · <button className="link" onClick={() => setSdr("")}>trocar</button>
          </span>
        </div>
        {list && (
          <div className="counters">
            <span><strong>{pending.length}</strong> na fila</span>
            <span><strong>{todayContacts.length}</strong> hoje</span>
          </div>
        )}
      </header>

      {error && <p className="error">{error}</p>}

      {!list ? (
        <section className="card hero">
          <p className="hero-title">Comece subindo a lista de leads</p>
          <ol className="howto">
            <li>No Stronilead, exporte a lista em CSV ou Excel.</li>
            <li>Toque no botão abaixo e escolha o arquivo (pode estar no Google Drive).</li>
            <li>O app mostra um lead por vez. É só ligar e registrar como foi.</li>
          </ol>
          <button className="btn-primary btn-big" onClick={pickFile}>Escolher lista (CSV ou Excel)</button>
        </section>
      ) : !current ? (
        <section className="card hero">
          <p className="hero-title">Lista concluída!</p>
          <p className="muted">
            Todos os leads de {list.fileName} já foram contatados hoje ou encerrados. Exporte os resultados ou suba uma nova lista.
          </p>
          <button className="btn-primary btn-big" onClick={() => exportResults(false)}>Exportar resultados de hoje</button>
          <button className="btn-big" onClick={pickFile}>Subir nova lista</button>
        </section>
      ) : (
        <section className="card lead">
          <p className="eyebrow">Próximo lead</p>
          <p className="lead-name">{current.name || "Sem nome"}</p>
          <p className="lead-phone">{current.phone}</p>
          {past && (
            <p className="last-contact">
              Último contato: <strong>{past.lastStatus}</strong> em {past.lastDate}
              {past.lastNote && ` · ${past.lastNote}`}
              {lastRecording && (
                <button className="link listen" onClick={() => listen(lastRecording.uri)}>▶ Ouvir gravação</button>
              )}
            </p>
          )}
          {current.details.length > 0 && (
            <dl className="details">
              {current.details.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}

          <p className="step"><span className="step-n">1</span> Fale com o lead</p>
          <div className="contact-buttons">
            <button className="btn-call btn-big" onClick={() => call()}>📞 Ligar</button>
            <button className="btn-whatsapp btn-big" onClick={openWhatsapp}>💬 WhatsApp</button>
          </div>
          {called && <p className="notice">Ligação aberta no celular. Quando desligar, volte aqui e marque como foi.</p>}

          <p className="step"><span className="step-n">2</span> Como foi?</p>
          <div className="results">
            {STATUSES.map((s) => (
              <button key={s} className={`result result-${TONE[s]}${status === s ? " selected" : ""}`} onClick={() => setStatus(s)}>
                {s}
              </button>
            ))}
          </div>
          <textarea placeholder="Anotação (opcional): o que o lead disse, melhor horário…" value={note} onChange={(e) => setNote(e.target.value)} />

          <button className="btn-primary btn-big save" onClick={save} disabled={!status}>
            {status ? "Salvar e ir para o próximo →" : "Marque como foi para continuar"}
          </button>
          <div className="lead-footer">
            <button className="link" onClick={skip}>Pular este lead</button>
            <label className="toggle">
              <input type="checkbox" checked={autoDial} onChange={(e) => setAutoDial(e.target.checked)} />
              Ligar para o próximo sozinho
            </label>
          </div>
        </section>
      )}

      {todayContacts.length > 0 && (
        <details className="card queue-card">
          <summary>Contatos de hoje ({todayContacts.length})</summary>
          <ul className="queue">
            {[...todayContacts].reverse().map((c) => (
              <li key={c.at}>
                <span>
                  {c.name || c.phone}
                  <span className="muted"> · {c.date.slice(-5)} · {c.status}</span>
                </span>
                {c.recording ? (
                  <button className="link listen" onClick={() => listen(c.recording!.uri)}>▶ Ouvir</button>
                ) : c.calledAt ? (
                  <span className="muted">sem gravação</span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      )}

      {list && (
        <details className="card queue-card">
          <summary>Fila ({pending.length} de {list.leads.length}{invalid ? ` · ${invalid} sem telefone válido` : ""})</summary>
          <ul className="queue">
            {pending.map((lead, i) => (
              <li key={lead.id} className={i === 0 ? "current" : ""}>
                <span>{lead.name || "Sem nome"}</span>
                <span className="muted">{(lead.e164 && history[lead.e164]?.lastStatus) || "Novo"}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {list && (
        <div className="toolbar">
          <button onClick={pickFile}>Trocar lista</button>
          <button onClick={() => exportResults(false)}>Exportar hoje</button>
          <button onClick={() => exportResults(true)}>Exportar tudo</button>
        </div>
      )}
    </main>
  );
}
