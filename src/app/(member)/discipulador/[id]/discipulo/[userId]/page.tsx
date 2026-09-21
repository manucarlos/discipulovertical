import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireDiscipler } from "@/lib/auth";
import { groupStreak, memberDays, releasedDays, type DayState } from "@/lib/groups/calendar";
import { isUuid } from "@/lib/groups/forms";
import { loadGroupCompletion, loadGroupContext, loadRoster } from "@/lib/groups/queries";

export const metadata = { title: "Ficha do discípulo" };

const STATE_LABEL: Record<DayState, string> = { done: "Lida", today: "Hoje", late: "Em atraso", available: "Disponível", not_released: "Ainda não liberada" };
const dateTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Ficha do discípulo (seção 18): histórico de leitura, reflexões compartilhadas e presença. O banco só
 * entrega as reflexões que o discípulo escolheu compartilhar (RG-07) e só enquanto ele está no grupo (RG-08).
 */
export default async function DiscipleFichaPage(props: PageProps<"/discipulador/[id]/discipulo/[userId]">) {
  await connection();
  const { id, userId } = await props.params;
  if (!isUuid(id) || !isUuid(userId)) notFound();
  const { supabase, user } = await requireDiscipler();

  const ctx = await loadGroupContext(supabase, id);
  if (!ctx || ctx.group.disciplerId !== user.id) notFound();
  const member = (await loadRoster(supabase, id)).find((m) => m.userId === userId && m.status === "active");
  if (!member) notFound();

  const now = new Date();
  const done = (await loadGroupCompletion(supabase, id, ctx.days)).get(userId) ?? new Set<number>();
  const days = memberDays(ctx.schedule, done, new Date(member.joinedAt), now);
  const released = releasedDays(ctx.schedule, now);

  const [progressRes, reflectionsRes, meetingsRes] = await Promise.all([
    supabase.from("group_progress").select("lesson_id, completed_at, challenge_done").eq("group_id", id).eq("user_id", userId),
    supabase.from("group_reflections").select("lesson_id, body, updated_at").eq("group_id", id).eq("user_id", userId),
    supabase.from("group_meetings").select("meeting_date, attendees").eq("group_id", id).order("meeting_date"),
  ]);
  const progress = new Map(((progressRes.data ?? []) as { lesson_id: string; completed_at: string | null; challenge_done: boolean }[]).map((p) => [p.lesson_id, p]));
  // O banco só devolve aqui as reflexões compartilhadas (a RLS esconde as privadas do discipulador).
  const reflections = new Map(((reflectionsRes.data ?? []) as { lesson_id: string; body: string; updated_at: string }[]).map((r) => [r.lesson_id, r]));
  const meetings = (meetingsRes.data ?? []) as { meeting_date: string; attendees: string[] }[];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href={`/discipulador/${id}`} className="text-sm text-muted underline">
        ← {ctx.group.name}
      </Link>
      <h1 className="mt-3 font-serif text-3xl leading-tight">{member.name}</h1>
      <p className="text-muted">
        No grupo desde {dateTime.format(new Date(member.joinedAt))} · {done.size} de {released} lições lidas · sequência de {groupStreak(ctx.schedule, done, now)} dias
      </p>

      <section aria-labelledby="leitura" className="mt-6">
        <h2 id="leitura" className="font-serif text-2xl">
          Leitura
        </h2>
        <ol className="mt-3 space-y-3">
          {ctx.days
            .filter((d) => d.day <= Math.max(released, 1))
            .map((d) => {
              const p = progress.get(d.lessonId);
              const reflection = reflections.get(d.lessonId);
              return (
                <li key={d.day} className="rounded-xl border border-line bg-card px-4 py-3">
                  <p className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">
                      Dia {d.day} · {d.title}
                    </span>
                    <span className="text-sm text-muted">
                      {STATE_LABEL[days[d.day - 1].state]}
                      {p?.completed_at ? ` em ${dateTime.format(new Date(p.completed_at))}` : ""}
                      {p?.challenge_done ? " · desafio feito" : ""}
                    </span>
                  </p>
                  {reflection && (
                    <p className="mt-2 whitespace-pre-line border-l-2 border-brand pl-3 text-sm">
                      <span className="block text-xs uppercase tracking-wide text-muted">Reflexão compartilhada</span>
                      {reflection.body}
                    </p>
                  )}
                </li>
              );
            })}
        </ol>
        <p className="mt-2 text-xs text-muted">Só aparecem as reflexões que o discípulo escolheu compartilhar.</p>
      </section>

      <section aria-labelledby="presenca" className="mt-8">
        <h2 id="presenca" className="font-serif text-2xl">
          Presença nos encontros
        </h2>
        {meetings.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nenhum encontro registrado ainda.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {meetings.map((m) => (
              <li key={m.meeting_date}>
                {m.meeting_date.split("-").reverse().join("/")}: {m.attendees.includes(userId) ? "presente" : "ausente"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
