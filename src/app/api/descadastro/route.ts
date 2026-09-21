import { NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Um GET nunca descadastra (programas que "abrem" os links do e-mail para verificar não podem desligar ninguém). */
export function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  return NextResponse.redirect(new URL(`/desinscrever?t=${encodeURIComponent(token)}`, request.url), 303);
}

/**
 * Descadastro dos lembretes por e-mail (RF-16, LGPD): vale para o botão da página /desinscrever e para o
 * "cancelar inscrição em um clique" dos aplicativos de e-mail (List-Unsubscribe-Post). O código é o do
 * e-mail; sem ele nada acontece. Não exige login.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (!UUID.test(token)) return new Response("Link inválido.", { status: 400 });

  const supabase = createAnonClient();
  if (!supabase) return new Response("Serviço indisponível.", { status: 503 });
  const { data, error } = await supabase.rpc("unsubscribe_email", { p_token: token });
  if (error) return new Response("Não foi possível concluir agora. Tente de novo.", { status: 500 });
  if (!data) return new Response("Link inválido.", { status: 404 });

  // O aplicativo de e-mail envia "List-Unsubscribe=One-Click" e espera só um 200; o navegador espera a página.
  const body = await request.text();
  if (body.includes("List-Unsubscribe=One-Click")) return new Response("Pronto.", { status: 200 });
  return NextResponse.redirect(new URL("/desinscrever?feito=1", request.url), 303);
}
