import { useEffect, useMemo, useRef, useState } from "react";
import { importLeads } from "@/lib/csv";
import { STATUSES, formatDate, queue, type Lead } from "@/lib/leads";
import { fillTemplate, whatsappLink } from "@/lib/phone";
import { openExternal, shareCsv } from "./native";
import {
  type Contact,
  type StoredList,
  contactsToCsv,
  loadContacts,
  loadList,
  loadSdr,
  saveContacts,
  saveList,
  saveSdr,
  summarize,
} from "./storage";

const MAX_ATTEMPTS = 3;
const WHATSAPP_TEMPLATE = "Olá {nome}, tudo bem? Aqui é {sdr} da Stronix.";

/** Lê o arquivo como UTF-8 e, se vier com caracteres quebrados, como Windows-1252 (Excel antigo). */
async function readText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
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

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    const leads = importLeads(await readText(file));
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
  }

  function call(lead: Lead | undefined = current) {
    if (!lead?.e164) return;
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
      { at: now.toISOString(), date: formatDate(now), name: current.name, phone: current.e164, status, note, sdr },
    ];
    setContacts(next);
    saveContacts(next);
    resetLead();
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

  return (
    <main>
      <header>
        <div>
          <h1>Discador Stronix</h1>
          <span className="muted">
            {list
              ? `${list.fileName}: ${pending.length} na fila de ${list.leads.length} leads${invalid ? ` · ${invalid} com telefone inválido` : ""}`
              : "Nenhuma lista carregada"}
            {` · ${todayContacts.length} contatos hoje`}
          </span>
        </div>
        <div className="actions" style={{ margin: 0 }}>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv,text/comma-separated-values,text/plain" hidden onChange={onFile} />
          <button className="btn-primary" onClick={() => fileInputRef.current?.click()}>Subir lista (CSV)</button>
          <button onClick={() => exportResults(false)}>Exportar resultados de hoje</button>
          <button onClick={() => exportResults(true)}>Exportar tudo</button>
        </div>
      </header>

      <label className="sdr">
        <span className="muted">SDR do turno</span>
        <input value={sdr} onChange={(e) => setSdr(e.target.value)} placeholder="Seu nome" autoComplete="name" />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="layout">
        <section className="card">
          {!list ? (
            <p>Toque em <strong>Subir lista (CSV)</strong> e escolha o arquivo exportado do Stronilead.</p>
          ) : !current ? (
            <p>Todos os leads desta lista já foram contatados hoje ou encerrados. Suba uma nova lista para continuar.</p>
          ) : (
            <>
              <p className="lead-name">{current.name || "Sem nome"}</p>
              <p className="lead-phone">{current.phone}</p>
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
              {past && (
                <p className="muted">
                  Último contato: {past.lastStatus} em {past.lastDate} ({past.attempts} tentativa{past.attempts === 1 ? "" : "s"})
                  {past.lastNote && ` · ${past.lastNote}`}
                </p>
              )}

              {called && <p className="notice">Ligação aberta no celular. Ao desligar, volte aqui e registre o resultado.</p>}

              <div className="actions">
                <button className="btn-call" onClick={() => call()}>Ligar</button>
                <button className="btn-whatsapp" onClick={openWhatsapp}>WhatsApp</button>
                <button onClick={skip}>Pular</button>
              </div>

              <strong>Resultado</strong>
              <div className="results">
                {STATUSES.map((s) => (
                  <button key={s} className={status === s ? "selected" : ""} onClick={() => setStatus(s)}>
                    {s}
                  </button>
                ))}
              </div>
              <textarea placeholder="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="actions" style={{ marginTop: 12, justifyContent: "space-between" }}>
                <label className="toggle">
                  <input type="checkbox" checked={autoDial} onChange={(e) => setAutoDial(e.target.checked)} />
                  Ligar para o próximo automaticamente
                </label>
                <button className="btn-primary" onClick={save} disabled={!status}>Salvar e próximo</button>
              </div>
            </>
          )}
        </section>

        <aside className="card">
          <strong>Fila</strong>
          <ul className="queue">
            {pending.map((lead, i) => (
              <li key={lead.id} className={i === 0 ? "current" : ""}>
                <span>{lead.name || "Sem nome"}</span>
                <span className="muted">{(lead.e164 && history[lead.e164]?.lastStatus) || "Novo"}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
