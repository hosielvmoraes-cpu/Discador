"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { STATUSES, type Lead } from "@/lib/leads";
import { fillTemplate, whatsappLink } from "@/lib/phone";

type CallState = "idle" | "connecting" | "ringing" | "open" | "ended";

const CALL_LABELS: Record<CallState, string> = {
  idle: "Pronto para ligar",
  connecting: "Conectando…",
  ringing: "Chamando…",
  open: "Em ligação",
  ended: "Ligação encerrada: registre o resultado",
};

const WHATSAPP_TEMPLATE = process.env.NEXT_PUBLIC_WHATSAPP_MESSAGE ?? "Olá {nome}, tudo bem? Aqui é {sdr} da Stronix.";

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function Dialer() {
  const [sdr, setSdr] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [summary, setSummary] = useState({ total: 0, invalid: 0 });
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

  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const current = leads[0];

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/leads", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSdr(data.sdr);
      setLeads(data.queue);
      setSummary({ total: data.total, invalid: data.invalid });
    } catch {
      setError("Não foi possível ler a planilha de leads.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  useEffect(() => {
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
    };
  }, []);

  useEffect(() => {
    if (callState !== "open") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [callState]);

  const call = useCallback(async () => {
    const device = deviceRef.current;
    if (!device || !current?.e164 || callRef.current) return;
    setError("");
    setSeconds(0);
    setMuted(false);
    setCallState("connecting");
    try {
      const c = await device.connect({ params: { To: current.e164, row: String(current.row) } });
      callRef.current = c;
      c.on("ringing", () => setCallState("ringing"));
      c.on("accept", () => setCallState("open"));
      const finish = () => {
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
  }, [current]);

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
  };

  const save = useCallback(async () => {
    if (!current || !status || saving || callRef.current) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/leads/${current.row}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      if (!res.ok) throw new Error();
      setLeads((list) => list.slice(1));
      resetLead();
      if (autoDial) setTimeout(() => document.getElementById("btn-call")?.click(), 1500);
    } catch {
      setError("Não foi possível salvar o resultado na planilha.");
    } finally {
      setSaving(false);
    }
  }, [current, status, note, saving, autoDial]);

  const skip = useCallback(() => {
    if (callRef.current) return;
    setLeads((list) => (list.length > 1 ? [...list.slice(1), list[0]] : list));
    resetLead();
  }, []);

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

  return (
    <main>
      <header>
        <div>
          <h1>Discador Stronix</h1>
          <span className="muted">
            {sdr && `${sdr} · `}
            {leads.length} na fila de {summary.total} leads
            {summary.invalid > 0 && ` · ${summary.invalid} com telefone inválido`}
          </span>
        </div>
        <div className="actions" style={{ margin: 0 }}>
          <button onClick={loadLeads} disabled={loading || inCall}>Recarregar planilha</button>
          <button onClick={logout} disabled={inCall}>Sair</button>
        </div>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="layout">
        <section className="card">
          {loading ? (
            <p className="muted">Carregando leads…</p>
          ) : !current ? (
            <p>Nenhum lead na fila. Adicione nomes e telefones na planilha e clique em Recarregar planilha.</p>
          ) : (
            <>
              <p className="lead-name">{current.name || "Sem nome"}</p>
              <p className="lead-phone">{current.e164}</p>
              {current.status && (
                <p className="muted">
                  Último contato: {current.status} em {current.date} ({current.attempts} tentativa{current.attempts === 1 ? "" : "s"})
                  {current.note && ` · ${current.note}`}
                </p>
              )}

              <p className="call-status">
                {CALL_LABELS[callState]}
                {(callState === "open" || callState === "ended") && seconds > 0 && ` · ${formatSeconds(seconds)}`}
              </p>

              <div className="actions">
                {inCall ? (
                  <>
                    <button className="btn-hangup" onClick={hangup}>Desligar <kbd>D</kbd></button>
                    <button onClick={toggleMute}>{muted ? "Ativar microfone" : "Mudo"} <kbd>M</kbd></button>
                  </>
                ) : (
                  <button id="btn-call" className="btn-call" onClick={call} disabled={!ready || !current.e164}>
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
          <strong>Fila do turno</strong>
          <ul className="queue">
            {leads.map((lead, i) => (
              <li key={lead.row} className={i === 0 ? "current" : ""}>
                <span>{lead.name || "Sem nome"}</span>
                <span className="muted">{lead.status || "Novo"}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
