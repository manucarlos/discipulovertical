"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function GoogleSignInButton() {
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setLoading(true);
    setFailed(false);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // Em caso de sucesso o navegador já saiu para o Google; só chega aqui se falhar.
    if (error) {
      setFailed(true);
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={signIn}
        disabled={loading}
        className="w-full rounded-xl bg-brand px-4 py-3 font-medium text-on-brand transition hover:bg-brand-strong disabled:opacity-60"
      >
        {loading ? "Abrindo o Google…" : "Entrar com Google"}
      </button>
      {failed && (
        <p role="alert" className="mt-3 text-sm text-red-800">
          Não foi possível abrir o login do Google. Tente de novo.
        </p>
      )}
    </>
  );
}
