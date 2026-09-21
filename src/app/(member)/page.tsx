import Link from "next/link";
import { connection } from "next/server";
import { TrailHome } from "@/components/trail-views";
import { requireMember } from "@/lib/auth";
import { loadSettings } from "@/lib/features";
import { loadEngagement } from "@/lib/gamification";
import { getSupabaseEnv } from "@/lib/supabase/config";
import { loadTrail } from "@/lib/trail/queries";

export const metadata = { title: "Minha trilha" };

export default async function Home() {
  // Sempre renderizada a cada acesso: depende de quem está logado.
  await connection();

  if (!getSupabaseEnv()) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="max-w-md rounded-2xl border border-line bg-card p-8 text-center shadow-sm">
          <h1 className="font-serif text-3xl">Discipulado</h1>
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

  const { supabase, user, profile } = await requireMember();
  const now = new Date();
  const view = await loadTrail(supabase, user.id, now);
  const engagement = (await loadSettings(supabase)).flags.gamification ? await loadEngagement(supabase, user.id, now) : null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <TrailHome name={profile.display_name} view={view} now={now} engagement={engagement} />
    </main>
  );
}
