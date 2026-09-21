import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./config";

/**
 * Cliente sem sessão (papel "anon"), para o que roda sem pessoa logada: o agendador de lembretes e o
 * descadastro por link. Só alcança as funções do banco que aceitam o papel anônimo e conferem o próprio segredo.
 */
export function createAnonClient() {
  const env = getSupabaseEnv();
  if (!env) return null;
  return createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
}
