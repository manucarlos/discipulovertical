import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, makeNonce } from "@/lib/csp";
import { getSupabaseEnv } from "@/lib/supabase/config";

const PUBLIC_PATHS = ["/login", "/termos", "/privacidade", "/offline", "/desinscrever", "/api/descadastro", "/verificar", "/feedback"];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/auth/")) return true;
  // O agendador de lembretes não tem sessão: a própria rota confere o CRON_SECRET.
  if (pathname.startsWith("/api/cron/")) return true;
  // Pré-visualizações com dados fictícios: existem só em desenvolvimento (as páginas dão 404 em produção).
  return process.env.NODE_ENV !== "production" && pathname.startsWith("/dev/");
}

/**
 * Duas tarefas a cada requisição:
 *  1. Política de Segurança de Conteúdo (CSP) com um nonce novo (src/lib/csp.ts). O Next.js lê o nonce do cabeçalho
 *     da requisição e o aplica sozinho aos scripts da página.
 *  2. Renova a sessão do Supabase e manda quem não entrou para /login. Isto é só a primeira barreira: as páginas e
 *     a RLS do banco conferem o acesso de novo.
 */
export async function proxy(request: NextRequest) {
  const nonce = makeNonce();
  const csp = buildCsp({ nonce, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, isDev: process.env.NODE_ENV === "development" });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const secure = <T extends NextResponse>(response: T): T => {
    response.headers.set("Content-Security-Policy", csp);
    return response;
  };
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });

  const env = getSupabaseEnv();
  // Sem Supabase configurado (início do projeto), não há login para exigir.
  if (!env) return secure(next());

  let response = next();

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = next();
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!signedIn && !isPublic(pathname)) {
    return secure(NextResponse.redirect(new URL("/login", request.url)));
  }
  if (signedIn && pathname === "/login") {
    return secure(NextResponse.redirect(new URL("/", request.url)));
  }
  return secure(response);
}

export const config = {
  matcher: [
    // Tudo, menos arquivos estáticos, o manifesto e o service worker do PWA.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
