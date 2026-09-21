import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireDiscipler } from "@/lib/auth";
import { groupStreak, memberDays, needsAttention, nextMeetingDate, releasedDays, type DayState } from "@/lib/groups/calendar";
import { isUuid, WEEKDAY_LABEL } from "@/lib/groups/forms";
import { loadGroupCompletion, loadGroupContext, loadRoster } from "@/lib/groups/queries";
import { siteUrlFromEnv } from "@/lib/reminders/config";
import { addGroupPause, removeGroupPause, setGroupStatus } from "../actions";

export const metadata = { title: "Painel do grupo" };

const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand";
const shortFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
const longFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

const CELL: Record<DayState, { mark: string; label: string; style: string }> = {
  done: { mark: "✓", label: "lida", style: "text-emerald-800" },
  today: { mark: "●", label: "hoje, ainda não lida", style: "text-brand" },
  late: { mark: "!", label: "em atraso", style: "text-amber-900 font-bold" },
  available: { mark: "·", label: "anterior à entrada, não lida", style: "text-muted" },
  not_released: { mark: "", label: "não liberada", style: "text-muted" },
};

/** Painel do grupo (seção 18): matriz discípulos × dias, sequência, alertas, convite e pausas. */
export default async function GroupPanelPage(props: PageProps<"/discipulador/[id]">) {
  await connection();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { supabase, user } = await requireDiscipler();

  const ctx = await loadGroupContext(supabase, id);
  if (!ctx) notFound();
  const { group } = ctx;
  if (group.disciplerId !== user.id) notFound(); // só o discipulador do grupo (o Admin usa a tela de Grupos)

  const now = new Date();
  const [roster, completion] = await Promise.all([loadRoster(supabase, id), loadGroupCompletion(supabase, id, ctx.days)]);
  const active = roster.filter((m) => m.status === "active");
  const released = releasedDays(ctx.schedule, now);
  const meeting = nextMeetingDate(ctx.schedule, now);
  const site = siteUrlFromEnv();
  const rows = active.map((m) => {
    const done = completion.get(m.userId) ?? new Set<number>();
    const joined = new Date(m.joinedAt);
    return {
      member: m,
      days: memberDays(ctx.schedule, done, joined, now),
      streak: groupStreak(ctx.schedule, done, now),
      alert: needsAttention(ctx.schedule, done, joined, now, group.alertDays),
    };
  });
  const shown = ctx.days.filter((d) => d.day <= Math.max(released, 1));
  const erro = first(search.erro);
  const ok = first(search.ok);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Link href="/discipulador" className="text-sm text-muted underline">
        ← Meus grupos
      </Link>
      <h1 className="mt-3 font-serif text-3xl leading-tight">{group.name}</h1>
      <p className="text-muted">
        {group.trackTitle} · dia {released} de {ctx.days.length}
        {group.status !== "active" ? " · encerrado" : ""}
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

      <section aria-labelledby="convite" className="mt-5 rounded-2xl border border-line bg-card p-5">
        <h2 id="convite" className="font-serif text-xl">
          Convite
        </h2>
        <p className="mt-1 text-sm">
          Código: <strong className="font-mono text-base">{group.inviteCode}</strong>
        </p>
        <p className="text-sm text-muted">
          Quem recebe o convite entra em {site ? `${site}/grupo/entrar` : "/grupo/entrar"} e digita o código.
          {meeting ? ` Próximo encontro: ${longFmt.format(new Date(`${meeting}T00:00:00Z`))}.` : ""}
        </p>
        <p className="mt-3">
          <Link href={`/discipulador/${id}/encontro`} className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong">
            Guia do encontro
          </Link>
        </p>
      </section>

      {rows.some((r) => r.alert) && (
        <section aria-labelledby="alertas" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
          <h2 id="alertas" className="font-serif text-xl">
            Merece um contato
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {rows
              .filter((r) => r.alert)
              .map((r) => (
                <li key={r.member.userId}>
                  <Link href={`/discipulador/${id}/discipulo/${r.member.userId}`} className="underline">
                    {r.member.name}
                  </Link>{" "}
                  está há {group.alertDays} dias de leitura sem ler.
                </li>
              ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="matriz" className="mt-6">
        <h2 id="matriz" className="font-serif text-2xl">
          Leitura do grupo
        </h2>
        {active.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Ainda não há discípulos. Compartilhe o código do convite.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
              <caption className="sr-only">Lições lidas por discípulo e por dia</caption>
              <thead className="bg-tint">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Discípulo
                  </th>
                  {shown.map((d) => (
                    <th key={d.day} scope="col" className="px-2 py-2 text-center font-medium" title={d.title}>
                      {d.day}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-center font-medium">
                    Sequência
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.member.userId} className="border-t border-line">
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      <Link href={`/discipulador/${id}/discipulo/${r.member.userId}`} className="underline-offset-4 hover:underline">
                        {r.member.name}
                      </Link>
                    </th>
                    {shown.map((d) => {
                      const cell = CELL[r.days[d.day - 1].state];
                      return (
                        <td key={d.day} className={`px-2 py-2 text-center ${cell.style}`}>
                          <span aria-hidden="true">{cell.mark}</span>
                          <span className="sr-only">{cell.label}</span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center">{r.streak}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">✓ lida · ● hoje · ! em atraso · · anterior à entrada</p>
      </section>

      <section id="pausas" aria-labelledby="pausas-titulo" className="mt-8 rounded-2xl border border-line bg-card p-5">
        <h2 id="pausas-titulo" className="font-serif text-xl">
          Pausas
        </h2>
        <p className="mt-1 text-sm text-muted">Feriado, viagem ou um período difícil: nos dias da pausa não sai lição, e o calendário se desloca.</p>
        {ctx.pauses.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {ctx.pauses.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {shortFmt.format(new Date(`${p.from}T00:00:00Z`))} a {shortFmt.format(new Date(`${p.until}T00:00:00Z`))}
                </span>
                <form action={removeGroupPause.bind(null, id, p.id)}>
                  <button type="submit" className="inline-flex min-h-11 items-center underline">
                    Remover pausa
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addGroupPause.bind(null, id)} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">
            Primeiro dia
            <input name="from" type="date" required className={inputClass} />
          </label>
          <label className="text-sm font-medium">
            Último dia
            <input name="until" type="date" required className={inputClass} />
          </label>
          <button type="submit" className="rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong">
            Pausar
          </button>
        </form>
      </section>

      <section aria-labelledby="config" className="mt-8">
        <h2 id="config" className="font-serif text-xl">
          Como o grupo funciona
        </h2>
        <p className="mt-1 text-sm text-muted">
          Uma lição por dia de leitura ({group.activeWeekdays.map((n) => WEEKDAY_LABEL[n]).join(", ")}), liberada às {group.releaseHour}h, igual para todos.
          Quem perde um dia lê depois, sem bloqueio.
        </p>
        <form action={setGroupStatus.bind(null, id, group.status === "active" ? "completed" : "active")} className="mt-3">
          <button type="submit" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-tint">
            {group.status === "active" ? "Encerrar o grupo" : "Reabrir o grupo"}
          </button>
        </form>
      </section>
    </main>
  );
}
