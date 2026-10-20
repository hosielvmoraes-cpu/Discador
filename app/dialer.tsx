"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { importLeads } from "@/lib/csv";
import { STATUSES, formatDate, queue, type Lead, type PhoneHistory } from "@/lib/leads";
import { fillTemplate, whatsappLink } from "@/lib/phone";

type CallState = "idle" | "connecting" | "ringing" | "open" | "ended";
/** "celular": o botão Ligar abre o discador do aparelho (sem custo). "twilio": liga pelo navegador com gravação automática. */
type CallMode = "celular" | "twilio";

const CALL_LABELS: Record<CallState, string> = {
  idle: "Pronto para ligar",
  connecting: "Conectando…",
  ringing: "Chamando…",
  open: "Em ligação",
  ended: "Ligação encerrada: registre o resultado",
};

const WHATSAPP_TEMPLATE = process.env.NEXT_PUBLIC_WHATSAPP_MESSAGE ?? "Olá {nome}, tudo bem? Aqui é {sdr} da Stronix.";
const STORAGE_KEY = "discador:lista";

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Lê o arquivo como UTF-8 e, se vier com caracteres quebrados, como Windows-1252 (Excel antigo). */
async function readText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
}

type StoredList = { fileName: string; leads: Lead[] };

export default function Dialer() {
  const [sdr, setSdr] = useState("");
  const [list, setList] = useState<StoredList | null>(null);
  const [history, setHistory] = useState<Record<string, PhoneHistory>>({});
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [skipped, setSkipped] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [callState, setCallState] = useState<CallState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [autoDial, setAutoDial] = useState(false);
  const [ready, setReady] = useState(false);
  const [callMode, setCallMode] = useState<CallMode | null>(null);

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const callSidRef = useRef("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pending = useMemo(() => {
    const q = queue(list?.leads ?? [], history, maxAttempts);
    // Leads pulados vão para o fim da fila, na ordem em que foram pulados.
    const rank = (lead: Lead) => skipped.indexOf(lead.id);
    return [...q].sort((a, b) => rank(a) - rank(b));
  }, [list, history, maxAttempts, skipped]);
  const current = pending[0];
  const invalid = list?.leads.filter((l) => !l.e164).length ?? 0;

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/history", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSdr(data.sdr);
      setMaxAttempts(data.maxAttempts);
      setCallMode(data.callMode);
      setHistory(data.history);
    } catch {
      setError("Não foi possível ler o histórico de contatos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setList(JSON.parse(stored));
    } catch {
      // Sem lista salva: o SDR sobe o arquivo de novo.
    }
  }, [loadHistory]);

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
    setSkipped([]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // A lista continua na tela; só não sobrevive a recarregar a página.
    }
  }

  useEffect(() => {
    if (callMode !== "twilio") return;
    let cancelled = false;
    async function fetchToken(): Promise<string> {
      const res = await fetch("/api/token", { cache: "no-store" });
      if (!res.ok) throw new Error();
      return (await res.json()).token;
    }
    (async () => {
      try {
        const { Device } = await import("@twilio/voice-sdk");
        const device = new Device(await fetchToken(), { codecPreferences: ["opus", "pcmu"] as Call.Codec[] });
        device.on("tokenWillExpire", async () => device.updateToken(await fetchToken()));
        device.on("error", () => setError("Erro na telefonia. Confira a conexão e o microfone."));
        if (cancelled) device.destroy();
        else {
          deviceRef.current = device;
          setReady(true);
        }
      } catch {
        setError("Não foi possível iniciar a telefonia.");
      }
    })();
    return () => {
      cancelled = true;
      deviceRef.current?.destroy();
      deviceRef.current = null;
      setReady(false);
    };
  }, [callMode]);

  useEffect(() => {
    if (callState !== "open") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [callState]);

  const call = useCallback(async () => {
    if (callMode === "celular") {
      if (!current?.e164) return;
      window.location.href = `tel:${current.e164}`;
      setCallState("ended");
      return;
    }
    const device = deviceRef.current;
    if (!device || !current?.e164 || callRef.current) return;
    setError("");
    setSeconds(0);
    setMuted(false);
    setCallState("connecting");
    callSidRef.current = "";
    try {
      const c = await device.connect({ params: { To: current.e164 } });
      callRef.current = c;
      c.on("ringing", () => setCallState("ringing"));
      c.on("accept", () => {
        callSidRef.current = c.parameters.CallSid ?? "";
        setCallState("open");
      });
      const finish = () => {
        callSidRef.current ||= c.parameters.CallSid ?? "";
        callRef.current = null;
        setCallState("ended");
      };
      c.on("disconnect", finish);
      c.on("cancel", finish);
      c.on("reject", finish);
      c.on("error", () => {
        finish();
        setError("A ligação falhou.");
      });
    } catch {
      callRef.current = null;
      setCallState("idle");
      setError("Não foi possível ligar. Permita o uso do microfone no navegador.");
    }
  }, [current, callMode]);

  const hangup = useCallback(() => {
    callRef.current?.disconnect();
  }, []);

  const toggleMute = useCallback(() => {
    const c = callRef.current;
    if (!c) return;
    c.mute(!c.isMuted());
    setMuted(c.isMuted());
  }, []);

  const resetLead = () => {
    setStatus("");
    setNote("");
    setSeconds(0);
    setCallState("idle");
    callSidRef.current = "";
  };

  const save = useCallback(async () => {
    if (!current?.e164 || !status || saving || callRef.current) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: current.name, phone: current.e164, status, note, callSid: callSidRef.current }),
      });
      if (!res.ok) throw new Error();
      const e164 = current.e164;
      setHistory((h) => ({
        ...h,
        [e164]: { attempts: (h[e164]?.attempts ?? 0) + 1, lastStatus: status, lastDate: formatDate(new Date()), lastNote: note },
      }));
      resetLead();
      if (autoDial) setTimeout(() => document.getElementById("btn-call")?.click(), 1500);
    } catch {
      setError("Não foi possível salvar o resultado no histórico.");
    } finally {
      setSaving(false);
    }
  }, [current, status, note, saving, autoDial]);

  const skip = useCallback(() => {
    if (callRef.current || !current) return;
    setSkipped((s) => [...s.filter((id) => id !== current.id), current.id]);
    resetLead();
  }, [current]);

  const openWhatsapp = useCallback(() => {
    if (!current?.e164) return;
    const message = fillTemplate(WHATSAPP_TEMPLATE, { nome: current.name.split(" ")[0] ?? "", sdr });
    window.open(whatsappLink(current.e164, message), "_blank", "noopener");
    if (!status) setStatus("WhatsApp enviado");
  }, [current, sdr, status]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
      if (e.key === "Enter" && (!typing || e.ctrlKey)) {
        e.preventDefault();
        save();
        return;
      }
      if (typing) return;
      const key = e.key.toLowerCase();
      if (key === "l") call();
      else if (key === "escape" || key === "d") hangup();
      else if (key === "w") openWhatsapp();
      else if (key === "m") toggleMute();
      else if (/^[1-8]$/.test(key)) setStatus(STATUSES[Number(key) - 1]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [call, hangup, openWhatsapp, toggleMute, save]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const inCall = callState === "connecting" || callState === "ringing" || callState === "open";
  const past = current?.e164 ? history[current.e164] : undefined;

  return (
    <main>
      <header>
        <div>
          <h1>Discador Stronix</h1>
          <span className="muted">
            {sdr && `${sdr} · `}
            {list
              ? `${list.fileName}: ${pending.length} na fila de ${list.leads.length} leads${invalid ? ` · ${invalid} com telefone inválido` : ""}`
              : "Nenhuma lista carregada"}
          </span>
        </div>
        <div className="actions" style={{ margin: 0 }}>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
          <button className="btn-primary" onClick={() => fileInputRef.current?.click()} disabled={inCall}>
            Subir lista (CSV)
          </button>
          <button onClick={loadHistory} disabled={loading || inCall}>Atualizar histórico</button>
          <button onClick={logout} disabled={inCall}>Sair</button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="layout">
        <section className="card">
          {loading ? (
            <p className="muted">Carregando histórico…</p>
          ) : !list ? (
            <p>Clique em <strong>Subir lista (CSV)</strong> e escolha o arquivo exportado do Stronilead.</p>
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

              <p className="call-status">
                {callMode === "celular" && callState === "ended"
                  ? "Ligação aberta no celular: ao desligar, registre o resultado"
                  : CALL_LABELS[callState]}
                {(callState === "open" || callState === "ended") && seconds > 0 && ` · ${formatSeconds(seconds)}`}
              </p>

              <div className="actions">
                {inCall ? (
                  <>
                    <button className="btn-hangup" onClick={hangup}>Desligar <kbd>D</kbd></button>
                    <button onClick={toggleMute}>{muted ? "Ativar microfone" : "Mudo"} <kbd>M</kbd></button>
                  </>
                ) : (
                  <button id="btn-call" className="btn-call" onClick={call} disabled={callMode !== "celular" && !ready}>
                    Ligar <kbd>L</kbd>
                  </button>
                )}
                <button className="btn-whatsapp" onClick={openWhatsapp}>WhatsApp <kbd>W</kbd></button>
                <button onClick={skip} disabled={inCall}>Pular</button>
              </div>

              <strong>Resultado</strong>
              <div className="results">
                {STATUSES.map((s, i) => (
                  <button key={s} className={status === s ? "selected" : ""} onClick={() => setStatus(s)}>
                    <kbd>{i + 1}</kbd> {s}
                  </button>
                ))}
              </div>
              <textarea placeholder="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="actions" style={{ marginTop: 12, justifyContent: "space-between" }}>
                <label className="toggle">
                  <input type="checkbox" checked={autoDial} onChange={(e) => setAutoDial(e.target.checked)} />
                  Ligar para o próximo automaticamente
                </label>
                <button className="btn-primary" onClick={save} disabled={!status || saving || inCall}>
                  {saving ? "Salvando…" : "Salvar e próximo"} <kbd>Enter</kbd>
                </button>
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
