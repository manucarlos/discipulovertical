import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/config";

const PUBLIC_PATHS = ["/login", "/termos", "/privacidade"];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/auth/")) return true;
  // Pré-visualizações com dados fictícios: existem só em desenvolvimento (as páginas dão 404 em produção).
  return process.env.NODE_ENV !== "production" && pathname.startsWith("/dev/");
}

/**
 * Renova a sessão do Supabase a cada requisição e manda quem não entrou para /login.
 * Isto é só a primeira barreira: as páginas e a RLS do banco conferem o acesso de novo.
 */
export async function proxy(request: NextRequest) {
  const env = getSupabaseEnv();
  // Sem Supabase configurado (início do projeto), não há login para exigir.
  if (!env) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  if (!signedIn && !isPublic(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (signedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  matcher: [
    // Tudo, menos arquivos estáticos e o manifesto do PWA.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
