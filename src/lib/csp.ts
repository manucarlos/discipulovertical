/**
 * Política de Segurança de Conteúdo (CSP): diz ao navegador de onde a página pode carregar scripts, imagens,
 * vídeos e conexões. Se alguém conseguir injetar um script numa página, o navegador se recusa a executá-lo.
 *
 *  - Scripts: só os da própria página com o "nonce" desta requisição ('strict-dynamic' deixa esses scripts carregarem
 *    os seus). Sem 'unsafe-inline' nem 'unsafe-eval' em produção.
 *  - Estilos: 'unsafe-inline' porque o Next.js e o editor (ProseMirror) usam estilos em linha, e um atributo style
 *    não aceita nonce. Estilo injetado é bem menos perigoso que script.
 *  - Conexões: o próprio site e o Supabase (o login por e-mail chama o Supabase do navegador).
 *  - Vídeos: só YouTube em modo de privacidade e Vimeo (RF-11).
 *  - Ninguém embute o aplicativo em outro site (frame-ancestors), e formulários só enviam para o próprio site.
 */
export interface CspOptions {
  nonce: string;
  /** Endereço do projeto Supabase (NEXT_PUBLIC_SUPABASE_URL), se configurado. */
  supabaseUrl?: string | null;
  isDev?: boolean;
}

export function buildCsp({ nonce, supabaseUrl, isDev = false }: CspOptions): string {
  let supabaseOrigin: string | null = null;
  try {
    supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : null;
  } catch {
    supabaseOrigin = null;
  }
  const connect = ["'self'", ...(supabaseOrigin ? [supabaseOrigin] : []), ...(isDev ? ["ws://localhost:*", "http://localhost:*"] : [])];

  const directives: string[] = [
    "default-src 'self'",
    // Em desenvolvimento o React precisa de 'unsafe-eval' para montar mensagens de erro; em produção não.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
    "media-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Um nonce novo e imprevisível por requisição (base64 de 16 bytes aleatórios). */
export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
