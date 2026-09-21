import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireGroups } from "@/lib/auth";
import { groupStreak, memberDays, nextMeetingDate, releaseDateOfDay, releasedDays, type DayState } from "@/lib/groups/calendar";
import { isUuid } from "@/lib/groups/forms";
import { loadGroupCompletion, loadGroupContext, loadMyGroups } from "@/lib/groups/queries";
import { leaveGroup } from "../actions";

export const metadata = { title: "Meu grupo" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const shortFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });

const STATE_LABEL: Record<DayState, string> = { done: "Lida", today: "Hoje", late: "Em atraso", available: "Disponível", not_released: "Ainda não liberada" };
const STATE_STYLE: Record<DayState, string> = {
  done: "bg-emerald-50 text-emerald-800",
  today: "bg-brand text-on-brand",
  late: "bg-amber-50 text-amber-900",
  available: "bg-tint text-foreground",
  not_released: "bg-transparent text-muted",
};

/** Um grupo do discípulo: o calendário de lições, o próximo encontro, pausas e a saída do grupo. */
export default async function GroupHomePage(props: PageProps<"/grupo/[id]">) {
  await connection();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { supabase, user } = await requireGroups();

  const membership = (await loadMyGroups(supabase, user.id)).find((m) => m.group.id === id);
  if (!membership) notFound();
  const ctx = await loadGroupContext(supabase, id);
  if (!ctx) notFound();

  const now = new Date();
  const completion = (await loadGroupCompletion(supabase, id, ctx.days)).get(user.id) ?? new Set<number>();
  const days = memberDays(ctx.schedule, completion, new Date(membership.joinedAt), now);
  const released = releasedDays(ctx.schedule, now);
  const meeting = nextMeetingDate(ctx.schedule, now);
  const streak = groupStreak(ctx.schedule, completion, now);
  const erro = first(search.erro);
  const ok = first(search.ok);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/grupo" className="text-sm text-muted underline">
        ← Meus grupos
      </Link>
      <h1 className="mt-3 font-serif text-3xl leading-tight">{ctx.group.name}</h1>
      <p className="text-muted">{ctx.group.trackTitle}</p>

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

      <p className="mt-3 text-sm">
        {meeting ? `Próximo encontro: ${dateFmt.format(new Date(`${meeting}T00:00:00Z`))}. ` : ""}
        {streak >= 2 ? `${streak} dias seguidos lendo. ` : ""}
        {released < ctx.days.length ? `A lição do dia libera às ${ctx.group.releaseHour}h.` : "Vocês chegaram ao fim da trilha!"}
      </p>
      {ctx.pauses.length > 0 && (
        <p className="mt-2 rounded-xl bg-tint px-4 py-3 text-sm">
          Pausas do grupo:{" "}
          {ctx.pauses.map((p) => `${shortFmt.format(new Date(`${p.from}T00:00:00Z`))} a ${shortFmt.format(new Date(`${p.until}T00:00:00Z`))}`).join("; ")}. Nesses dias não sai lição.
        </p>
      )}

      <section aria-labelledby="dias" className="mt-6">
        <h2 id="dias" className="font-serif text-2xl">
          Lições
        </h2>
        <ol className="mt-3 space-y-2">
          {ctx.days.map((d) => {
            const state = days[d.day - 1].state;
            const open = state !== "not_released";
            const when = releaseDateOfDay(ctx.schedule, d.day);
            return (
              <li key={d.day} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3">
                <span className="min-w-0">
                  <span className="text-sm text-muted">Dia {d.day}</span>
                  {open ? (
                    <Link href={`/grupo/${id}/licao/${d.day}`} className="block truncate font-medium underline-offset-4 hover:underline">
                      {d.title}
                    </Link>
                  ) : (
                    <span className="block truncate text-muted">
                      Libera {when ? shortFmt.format(new Date(`${when}T00:00:00Z`)) : "em breve"}
                    </span>
                  )}
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATE_STYLE[state]}`}>{STATE_LABEL[state]}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-4 text-sm">
        <Link href={`/grupo/${id}/ajuda`} className="inline-flex min-h-11 items-center underline">
          Pedir ajuda pastoral
        </Link>
        <form action={leaveGroup.bind(null, id)}>
          <button type="submit" className="inline-flex min-h-11 items-center text-muted underline">
            Sair do grupo
          </button>
        </form>
      </div>
    </main>
  );
}
