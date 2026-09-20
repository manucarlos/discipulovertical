import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Aceita só caminhos internos, para o parâmetro `next` não virar um redirecionamento aberto. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNext(searchParams.get("next")), origin));
    }
  }
  return NextResponse.redirect(new URL("/login?erro=1", origin));
}
