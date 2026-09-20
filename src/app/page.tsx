import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { signOut } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/config";

export default async function Home() {
  // Sempre renderizada a cada acesso: depende de quem está logado.
  await connection();
  if (!getSupabaseEnv()) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="max-w-md rounded-2xl border border-line bg-card p-8 text-center shadow-sm">
          <h1 className="font-serif text-3xl">Discipulado · Vertical Church</h1>
          <p className="mt-3 text-muted">
            A plataforma está em preparação. O banco de dados e o login ainda não foram conectados.
          </p>
          <Link href="/login" className="mt-5 inline-block text-sm text-brand underline">
            Ir para o login
          </Link>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarded_at")
    .eq("id", user.id)
    .single();
  if (!profile?.onboarded_at) redirect("/onboarding");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <header className="flex items-center justify-between">
        <p className="text-sm font-medium uppercase tracking-widest text-brand">Vertical Church</p>
        <form action={signOut}>
          <button type="submit" className="text-sm text-muted underline">
            Sair
          </button>
        </form>
      </header>

      <h1 className="mt-8 font-serif text-3xl leading-tight">Olá, {profile.display_name.split(" ")[0]}!</h1>
      <p className="mt-3 rounded-2xl border border-line bg-card p-6 text-muted">
        Sua trilha de discipulado aparecerá aqui assim que o Ciclo 1 for publicado.
      </p>
    </main>
  );
}
