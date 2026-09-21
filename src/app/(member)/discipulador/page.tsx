import Link from "next/link";
import { connection } from "next/server";
import { requireDiscipler } from "@/lib/auth";
import { memberDays, releasedDays } from "@/lib/groups/calendar";
import { loadDisciplerGroups, loadGroupCompletion, loadGroupContext, loadRoster } from "@/lib/groups/queries";

export const metadata = { title: "Meus grupos (discipulador)" };

/** "Meus grupos" do discipulador (seção 18): trilha, dia atual e porcentagem de leitura de cada grupo. */
export default async function DisciplerHomePage(props: PageProps<"/discipulador">) {
  await connection();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { supabase, user } = await requireDiscipler();
  const now = new Date();

  const groups = await loadDisciplerGroups(supabase, user.id);
  const cards = await Promise.all(
    groups.map(async (group) => {
      const ctx = await loadGroupContext(supabase, group.id);
      if (!ctx) return null;
      const [roster, completion] = await Promise.all([loadRoster(supabase, group.id), loadGroupCompletion(supabase, group.id, ctx.days)]);
      const active = roster.filter((m) => m.status === "active");
      const released = releasedDays(ctx.schedule, now);
      // Leitura: das lições já liberadas para cada pessoa (desde a entrada), quantas foram lidas.
      let due = 0;
      let read = 0;
      for (const m of active) {
        const days = memberDays(ctx.schedule, completion.get(m.userId) ?? new Set(), new Date(m.joinedAt), now).filter((d) => d.state !== "not_released" && d.state !== "available");
        due += days.length;
        read += days.filter((d) => d.state === "done").length;
      }
      return { group, released, total: ctx.days.length, members: active.length, percent: due === 0 ? 0 : Math.round((read / due) * 100) };
    }),
  );
  const erro = first(search.erro);
  const ok = first(search.ok);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="font-serif text-3xl leading-tight">Meus grupos</h1>
      <p className="mt-2 flex flex-wrap gap-x-5 text-sm">
        <Link href="/discipulador/novo" className="inline-flex min-h-11 items-center underline">
          Criar um grupo
        </Link>
        <Link href="/discipulador/pedidos" className="inline-flex min-h-11 items-center underline">
          Pedidos de ajuda
        </Link>
        <Link href="/grupo" className="inline-flex min-h-11 items-center underline">
          Ir para o meu grupo (como discípulo)
        </Link>
      </p>
      {erro && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {ok && (
        <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {ok}
        </p>
      )}

      {cards.filter(Boolean).length === 0 ? (
        <p className="mt-4 text-muted">Você ainda não conduz nenhum grupo. Crie o primeiro e convide os discípulos por código.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {cards.map(
            (c) =>
              c && (
                <li key={c.group.id}>
                  <Link href={`/discipulador/${c.group.id}`} className="block rounded-2xl border border-line bg-card p-5 hover:border-brand">
                    <span className="font-serif text-2xl">{c.group.name}</span>
                    <span className="block text-sm text-muted">
                      {c.group.trackTitle}
                      {c.group.status !== "active" ? " · encerrado" : ""}
                    </span>
                    <span className="mt-2 block text-sm">
                      Dia {c.released} de {c.total} · {c.members} {c.members === 1 ? "discípulo" : "discípulos"} · {c.percent}% de leitura
                    </span>
                  </Link>
                </li>
              ),
          )}
        </ul>
      )}
    </main>
  );
}
