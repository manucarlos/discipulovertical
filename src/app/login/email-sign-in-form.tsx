"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Entrar com e-mail (RF-31): manda um link de acesso, sem senha, para quem não tem conta Google. Roda no
 * navegador porque o Supabase guarda ali o código de verificação do link (mesmo caminho do login com Google).
 */
export function EmailSignInForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "invalid" | "failed">("idle");

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL.test(address)) {
      setStatus("invalid");
      return;
    }
    setStatus("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email: address,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setStatus(error ? "failed" : "sent");
  }

  if (status === "sent") {
    return (
      <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        Enviamos um link de acesso para <strong>{email.trim()}</strong>. Abra o e-mail neste aparelho e toque no link. Se não achar, olhe o spam.
      </p>
    );
  }

  return (
    <form onSubmit={send} noValidate>
      <label htmlFor="login-email" className="block text-sm font-medium">
        Ou entre com o seu e-mail
      </label>
      <input
        id="login-email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-describedby={status === "invalid" || status === "failed" ? "login-email-erro" : undefined}
        className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand"
      />
      {(status === "invalid" || status === "failed") && (
        <p id="login-email-erro" role="alert" className="mt-2 text-sm text-red-800">
          {status === "invalid" ? "Digite um e-mail válido." : "Não foi possível enviar o link agora. Tente de novo em instantes."}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-3 w-full rounded-xl border border-line px-4 py-3 font-medium hover:bg-lilac disabled:opacity-60"
      >
        {status === "sending" ? "Enviando…" : "Enviar link de acesso"}
      </button>
    </form>
  );
}
