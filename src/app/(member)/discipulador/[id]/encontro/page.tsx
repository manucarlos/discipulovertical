import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireDiscipler } from "@/lib/auth";
import { releasedDays, releaseDateOfDay } from "@/lib/groups/calendar";
import { isUuid } from "@/lib/groups/forms";
import { loadGroupContext, loadRoster } from "@/lib/groups/queries";
import { loadLessonDetail } from "@/lib/trail/queries";
import { saveMeeting } from "../../actions";

export const metadata = { title: "Guia do encontro" };

const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand";
const longFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

/**
 * Guia do encontro (RG-06): perguntas prontas das lições desde o último encontro, campo de notas e lista de
 * presença. As notas são só do discipulador (e do Admin): os discípulos não as veem.
 */
export default async function MeetingGuidePage(props: PageProps<"/discipulador/[id]/encontro">) {
  await connection();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { supabase, user } = await requireDiscipler();

  const ctx = await loadGroupContext(supabase, id);
  if (!ctx || ctx.group.disciplerId !== user.id) notFound();

  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(first(search.data) ?? "") ? (first(search.data) as string) : today;

  const [roster, meetingsRes] = await Promise.all([
    loadRoster(supabase, id),
    supabase.from("group_meetings").select("meeting_date, notes, attendees").eq("group_id", id).order("meeting_date", { ascending: false }),
  ]);
  const meetings = (meetingsRes.data ?? []) as { meeting_date: string; notes: string; attendees: string[] }[];
  const current = meetings.find((m) => m.meeting_date === date);
  const previous = meetings.find((m) => m.meeting_date < date);

  // Lições liberadas desde o último encontro (ou as 6 mais recentes, se for o primeiro).
  const released = releasedDays(ctx.schedule, now);
  const sinceDay = previous
    ? ctx.days.filter((d) => {
        const when = releaseDateOfDay(ctx.schedule, d.day);
        return d.day <= released && when !== null && when > previous.meeting_date;
      })
    : ctx.days.filter((d) => d.day <= released).slice(-6);
  const guides = await Promise.all(
    sinceDay.map(async (d) => {
      const detail = await loadLessonDetail(supabase, d.slug);
      const questions = detail?.content.guide?.length ? detail.content.guide : detail?.content.reflection ? [detail.content.reflection] : [];
      return { day: d, questions };
    }),
  );
  const active = roster.filter((m) => m.status === "active");
  const erro = first(search.erro);
  const ok = first(search.ok);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href={`/discipulador/${id}`} className="text-sm text-muted underline">
        ← {ctx.group.name}
      </Link>
      <h1 className="mt-3 font-serif text-3xl leading-tight">Guia do encontro</h1>
      <p className="text-muted">{longFmt.format(new Date(`${date}T00:00:00Z`))}</p>
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

      <section aria-labelledby="perguntas" className="mt-6 space-y-4">
        <h2 id="perguntas" className="font-serif text-2xl">
          Perguntas para conversar
        </h2>
        {guides.length === 0 ? (
          <p className="text-sm text-muted">Ainda não há lições liberadas para este encontro.</p>
        ) : (
          guides.map(({ day, questions }) => (
            <article key={day.day} className="rounded-2xl border border-line bg-card p-5">
              <h3 className="font-medium">
                Dia {day.day} · {day.title}
              </h3>
              {questions.length === 0 ? (
                <p className="mt-1 text-sm text-muted">Esta lição ainda não tem perguntas para o encontro.</p>
              ) : (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              )}
            </article>
          ))
        )}
      </section>

      <form action={saveMeeting.bind(null, id)} className="mt-8 space-y-4 rounded-2xl border border-line bg-card p-5">
        <h2 className="font-serif text-xl">Registro do encontro</h2>
        <input type="hidden" name="date" value={date} />
        <fieldset>
          <legend className="text-sm font-medium">Presença</legend>
          {active.length === 0 ? (
            <p className="mt-1 text-sm text-muted">O grupo ainda não tem discípulos.</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {active.map((m) => (
                <li key={m.userId}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3">
                    <input type="checkbox" name="present" value={m.userId} defaultChecked={current?.attendees.includes(m.userId) ?? false} className="size-5 shrink-0 accent-[var(--brand)]" />
                    {m.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <label className="block text-sm font-medium">
          Notas do encontro <span className="font-normal text-muted">(só você e a administração leem)</span>
          <textarea name="notes" rows={5} defaultValue={current?.notes ?? ""} maxLength={5000} className={inputClass} />
        </label>
        <button type="submit" className="rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong">
          Salvar encontro
        </button>
      </form>

      {meetings.length > 0 && (
        <p className="mt-4 text-sm text-muted">Encontros registrados: {meetings.map((m) => m.meeting_date.split("-").reverse().join("/")).join(", ")}.</p>
      )}
    </main>
  );
}
