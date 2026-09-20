import type { PgSupabase } from "./supabase-pg";

/** Quem está "logado" no momento. O mock de @/lib/supabase/server devolve o cliente desta sessão. */
export const session: { client: PgSupabase | null } = { client: null };
