"use client";

import { useState } from "react";

export default function LoginPage() {
  const [sdr, setSdr] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sdr, password }),
    });
    if (res.ok) window.location.href = "/";
    else setError("Nome ou senha inválidos.");
  }

  return (
    <main>
      <form className="card login" onSubmit={submit}>
        <h1>Discador Stronix</h1>
        <label>
          Seu nome
          <input value={sdr} onChange={(e) => setSdr(e.target.value)} autoComplete="name" required />
        </label>
        <label>
          Senha
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn-primary" type="submit">Entrar</button>
      </form>
    </main>
  );
}
