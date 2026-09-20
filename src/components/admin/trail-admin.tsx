import Link from "next/link";
import { createLesson, moveLesson, saveCycleSettings } from "@/app/admin/actions";
import type { AdminCycle, AdminLesson } from "@/lib/admin/queries";
import { StatusBadge } from "./lesson-editor";

const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base focus:border-brand";

/** O editor só reordena rascunhos; o Admin reordena tudo (a regra final está no banco). */
function canMove(role: "editor" | "admin", a: AdminLesson, b: AdminLesson | undefined) {
  if (!b) return false;
  if (role === "admin") return true;
  const editable = (l: AdminLesson) => l.status === "draft" || l.status === "in_review";
  return editable(a) && editable(b);
}

function CycleSettings({ cycle }: { cycle: AdminCycle }) {
  return (
    <details className="mt-3 rounded-xl border border-line">
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium">Configurações do ciclo</summary>
      <form action={saveCycleSettings.bind(null, cycle.id)} className="space-y-3 border-t border-line p-4">
        <label className="block text-sm font-medium">
          Nome
          <input name="title" defaultValue={cycle.title} className={inputClass} required maxLength={100} />
        </label>
        <label className="block text-sm font-medium">
          Descrição
          <textarea name="description" defaultValue={cycle.description} rows={2} className={inputClass} maxLength={500} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm font-medium">
            Semanas previstas
            <input name="plannedWeeks" type="number" min={1} max={52} defaultValue={cycle.planned_weeks ?? ""} className={inputClass} />
          </label>
          <label className="block text-sm font-medium">
            Dias entre lições
            <input name="releaseIntervalDays" type="number" min={0} max={30} defaultValue={cycle.release_interval_days} className={inputClass} required />
          </label>
          <label className="block text-sm font-medium">
            Máx. lições por semana
            <input name="maxLessonsPerWeek" type="number" min={1} max={14} defaultValue={cycle.max_lessons_per_week} className={inputClass} required />
          </label>
        </div>
        <p className="text-xs text-muted">
          A próxima lição só libera depois de a anterior ser concluída, passados os dias indicados, e respeitando o máximo por semana.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input name="active" type="checkbox" defaultChecked={cycle.active} className="size-4 accent-brand" />
          Ciclo ativo (visível para os membros que já têm lições publicadas nele)
        </label>
        <button type="submit" className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-strong">
          Salvar configurações
        </button>
      </form>
    </details>
  );
}

/** Tela da trilha do painel de conteúdo: ciclos, lições, reordenar, nova lição e configurações do ciclo. */
export function AdminTrailView({
  cycles,
  role,
  erro,
  ok,
}: {
  cycles: AdminCycle[];
  role: "editor" | "admin";
  erro?: string;
  ok?: string;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="font-serif text-3xl leading-tight">Trilha</h1>
      <p className="mt-2 text-muted">
        Ciclos e lições. Abra uma lição para editar, ver como o membro vê e {role === "admin" ? "publicar" : "enviar para revisão"}.
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

      <div className="mt-8 space-y-10">
        {cycles.map((cycle) => (
          <section key={cycle.id} aria-labelledby={`c-${cycle.slug}`}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 id={`c-${cycle.slug}`} className="font-serif text-2xl">
                {cycle.position}. {cycle.title}
              </h2>
              <span className="text-sm text-muted">
                {cycle.lessons.filter((l) => l.status === "published").length} de {cycle.lessons.length} publicadas
                {!cycle.active && " · inativo"}
              </span>
            </div>
            {role === "admin" && <CycleSettings cycle={cycle} />}

            <ol className="mt-4 space-y-2">
              {cycle.lessons.map((lesson, i) => {
                const up = cycle.lessons[i - 1];
                const down = cycle.lessons[i + 1];
                return (
                  <li key={lesson.id} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
                    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-lilac font-serif text-sm">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/licao/${lesson.slug}`} className="block truncate font-medium hover:underline">
                        {lesson.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <StatusBadge status={lesson.status} />
                        {lesson.has_placeholders && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">Pendências [PREENCHER]</span>
                        )}
                        {lesson.sensitive && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-800">Sensível</span>}
                        {!lesson.required && <span className="rounded-full bg-lilac px-2 py-0.5 text-muted">Opcional</span>}
                        {lesson.estimated_minutes !== null && <span className="text-muted">{lesson.estimated_minutes} min</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <form action={moveLesson.bind(null, lesson.id, "up")}>
                        <button
                          type="submit"
                          aria-label={`Subir “${lesson.title}”`}
                          disabled={!canMove(role, lesson, up)}
                          className="size-9 rounded-lg border border-line hover:bg-lilac disabled:opacity-30"
                        >
                          ↑
                        </button>
                      </form>
                      <form action={moveLesson.bind(null, lesson.id, "down")}>
                        <button
                          type="submit"
                          aria-label={`Descer “${lesson.title}”`}
                          disabled={!canMove(role, lesson, down)}
                          className="size-9 rounded-lg border border-line hover:bg-lilac disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
              {cycle.lessons.length === 0 && <li className="text-sm text-muted">Nenhuma lição neste ciclo ainda.</li>}
            </ol>

            <form action={createLesson.bind(null, cycle.id)} className="mt-4 flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 text-sm font-medium">
                Nova lição neste ciclo
                <input name="title" placeholder="Título da lição" required maxLength={200} className={inputClass} />
              </label>
              <button type="submit" className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium hover:bg-lilac">
                + Criar rascunho
              </button>
            </form>
          </section>
        ))}
        {cycles.length === 0 && (
          <p className="rounded-xl bg-lilac px-4 py-3 text-muted">
            Ainda não há ciclos. Importe o conteúdo do handoff (veja o guia de contas, passo 2b).
          </p>
        )}
      </div>
    </main>
  );
}
