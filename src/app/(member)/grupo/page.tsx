import Link from "next/link";
import { connection } from "next/server";
import { requireGroups } from "@/lib/auth";
import { groupStreak, memberDays, nextMeetingDate, releasedDays } from "@/lib/groups/calendar";
import { WEEKDAY_LABEL } from "@/lib/groups/forms";
import { loadGroupCompletion, loadGroupContext, loadMyGroups } from "@/lib/groups/queries";

export const metadata = { title: "Meu grupo" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand uppercase";

/** "Meu grupo" (seção 18): a lição de hoje, as lições em atraso, a sequência e o próximo encontro. */
export default async function MyGroupsPage(props: PageProps<"/grupo">) {
  await connection();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { supabase, user, profile } = await requireGroups();
  const now = new Date();

  const memberships = await loadMyGroups(supabase, user.id);
  const cards = await Promise.all(
    memberships.map(async ({ group, joinedAt }) => {
      const ctx = await loadGroupContext(supabase, group.id);
      if (!ctx) return null;
      const completion = (await loadGroupCompletion(supabase, group.id, ctx.days)).get(user.id) ?? new Set<number>();
      const released = releasedDays(ctx.schedule, now);
      const days = memberDays(ctx.schedule, completion, new Date(joinedAt), now);
      const meeting = nextMeetingDate(ctx.schedule, now);
      return {
        group,
        released,
        total: ctx.days.length,
        today: released >= 1 ? ctx.days[released - 1] : null,
        todayDone: released >= 1 && completion.has(released),
        late: days.filter((d) => d.state === "late").length,
        streak: groupStreak(ctx.schedule, completion, now),
        meeting,
        notStarted: released === 0,
      };
    }),
  );
  const erro = first(search.erro);
  const ok = first(search.ok);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="font-serif text-3xl leading-tight">Meu grupo</h1>

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

      {profile.is_discipler || profile.role === "admin" ? (
        <p className="mt-2 text-sm">
          Você conduz grupos?{" "}
          <Link href="/discipulador" className="underline">
            Abrir a área do discipulador
          </Link>
        </p>
      ) : null}

      {cards.filter(Boolean).length === 0 ? (
        <p className="mt-4 text-muted">Você ainda não está em nenhum grupo de discipulado. Se recebeu um convite, digite o código abaixo.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {cards.map(
            (c) =>
              c && (
                <li key={c.group.id} className="rounded-2xl border border-line bg-card p-5">
                  <Link href={`/grupo/${c.group.id}`} className="font-serif text-2xl underline-offset-4 hover:underline">
                    {c.group.name}
                  </Link>
                  <p className="text-sm text-muted">{c.group.trackTitle}</p>
                  {c.notStarted ? (
                    <p className="mt-3">O grupo começa em {dateFmt.format(new Date(`${c.group.startDate}T00:00:00Z`))}.</p>
                  ) : c.today ? (
                    <div className="mt-3">
                      <p className="text-sm font-medium uppercase tracking-wide text-brand">
                        {c.todayDone ? `Dia ${c.released} · lido` : `Lição de hoje · dia ${c.released}`}
                      </p>
                      <p className="font-serif text-xl">{c.today.title}</p>
                      <Link
                        href={`/grupo/${c.group.id}/licao/${c.released}`}
                        className="mt-2 inline-block rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong"
                      >
                        {c.todayDone ? "Reler a lição" : "Ler a lição de hoje"}
                      </Link>
                    </div>
                  ) : null}
                  <p className="mt-3 text-sm text-muted">
                    {c.late > 0 ? `${c.late} ${c.late === 1 ? "lição em atraso" : "lições em atraso"} (sem pressa: elas continuam abertas). ` : ""}
                    {c.streak >= 2 ? `${c.streak} dias seguidos lendo. ` : ""}
                    {c.meeting ? `Próximo encontro: ${dateFmt.format(new Date(`${c.meeting}T00:00:00Z`))}.` : ""}
                  </p>
                </li>
              ),
          )}
        </ul>
      )}

      {cards.filter(Boolean).length > 2 && (
        <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Você está em mais de dois grupos ao mesmo tempo. Cuide do seu ritmo: leia com calma, sem se sobrecarregar.
        </p>
      )}

      <form method="get" action="/grupo/entrar" className="mt-8 rounded-2xl border border-line bg-card p-5">
        <h2 className="font-serif text-xl">Entrar em um grupo</h2>
        <label className="mt-2 block text-sm font-medium">
          Código do convite
          <input name="codigo" required maxLength={20} placeholder="G-1A2B3C4D" autoComplete="off" className={inputClass} />
        </label>
        <button type="submit" className="mt-3 rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong">
          Continuar
        </button>
        <p className="mt-2 text-xs text-muted">Dias de leitura da maioria dos grupos: {WEEKDAY_LABEL[1]} a {WEEKDAY_LABEL[6]}.</p>
      </form>
    </main>
  );
}
