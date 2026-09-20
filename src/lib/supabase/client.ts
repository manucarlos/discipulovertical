import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./config";

/** Cliente do Supabase para componentes de navegador ("use client"). */
export function createClient() {
  const env = getSupabaseEnv();
  if (!env) throw new Error("Supabase não configurado (veja docs/RUNBOOK.md).");
  return createBrowserClient(env.url, env.key);
}
