/**
 * Lê a configuração pública do Supabase. Devolve null enquanto o projeto Supabase ainda
 * não foi criado, para o app mostrar um aviso em vez de quebrar.
 * (Precisa acessar process.env.NEXT_PUBLIC_* por nome literal para o Next embutir o valor.)
 */
export function getSupabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}
