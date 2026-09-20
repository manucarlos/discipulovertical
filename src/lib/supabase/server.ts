import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./config";

/** Cliente do Supabase para Server Components, Server Actions e Route Handlers. */
export async function createClient() {
  const env = getSupabaseEnv();
  if (!env) throw new Error("Supabase não configurado (veja docs/RUNBOOK.md).");
  const cookieStore = await cookies();

  return createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Chamado de um Server Component (cookies são somente leitura ali).
          // O proxy já renova a sessão a cada requisição, então é seguro ignorar.
        }
      },
    },
  });
}
