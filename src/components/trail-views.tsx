import Link from "next/link";
import type { CycleView, LessonItem, TrailView } from "@/lib/trail/view";
import { formatWhen, lockedMessage } from "@/lib/trail/format";

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-2.5 w-full overflow-hidden rounded-full bg-lilac"
    >
      <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
    </div>
  );
}

const linkButton =
  "mt-5 inline-block rounded-xl bg-brand px-5 py-3 font-medium text-on-brand transition hover:bg-brand-strong";

/** Tela "Minha trilha" (RF-05): ciclo atual, próxima lição e porcentagem concluída. */
export function TrailHome({ name, view, now }: { name: string; view: TrailView; now: Date }) {
  const { current, next, upcoming } = view;
  const firstName = name.trim().split(/\s+/)[0] || "";

  return (
    <div>
      <h1 className="font-serif text-3xl leading-tight">Olá{firstName ? `, ${firstName}` : ""}!</h1>

      <section aria-labelledby="proximo" className="mt-6 rounded-2xl border border-line bg-card p-6 shadow-sm">
        {view.cycles.length === 0 && (
          <>
            <h2 id="proximo" className="font-serif text-2xl">Sua trilha começa em breve</h2>
            <p className="mt-2 text-muted">Assim que as primeiras lições forem publicadas, elas aparecem aqui.</p>
          </>
        )}

        {view.allComplete && (
          <>
            <h2 id="proximo" className="font-serif text-2xl">Você concluiu todos os ciclos disponíveis</h2>
            <p className="mt-2 text-muted">
              Que caminhada! Você pode reler qualquer lição quando quiser. Novos conteúdos aparecem aqui.
            </p>
          </>
        )}

        {next && (
          <>
            <p className="text-sm font-medium uppercase tracking-wide text-brand">
              {next.state.state === "in_progress" ? "Continue de onde parou" : "Sua próxima lição"}
            </p>
            <h2 id="proximo" className="mt-1 font-serif text-2xl leading-snug">{next.title}</h2>
            <p className="mt-1 text-sm text-muted">
              {next.cycleTitle}
              {next.estimatedMinutes !== null && ` · cerca de ${next.estimatedMinutes} min`}
            </p>
            <Link href={`/licao/${next.slug}`} className={linkButton}>
              {next.state.state === "in_progress" ? "Continuar lição" : "Começar lição"}
            </Link>
          </>
        )}

        {!next && upcoming && (
          <>
            <p className="text-sm font-medium uppercase tracking-wide text-brand">Descanse um pouco</p>
            <h2 id="proximo" className="mt-1 font-serif text-2xl leading-snug">
              Sua próxima lição libera {formatWhen(upcoming.availableAt, now)}
            </h2>
            <p className="mt-2 text-muted">
              Em seguida vem &ldquo;{upcoming.lesson.title}&rdquo;. Enquanto isso, você pode reler as lições já concluídas.
            </p>
          </>
        )}
      </section>

      {current && (
        <section aria-labelledby="progresso" className="mt-6">
          <h2 id="progresso" className="text-sm font-medium text-muted">
            Ciclo {current.position} · {current.title}
          </h2>
          <div className="mt-2">
            <ProgressBar percent={current.percent} label={`Progresso do ciclo ${current.title}`} />
          </div>
          <p className="mt-2 text-sm text-muted">
            {current.completedCount} de {current.requiredCount} lições concluídas ({current.percent}%)
          </p>
        </section>
      )}

      {view.cycles.length > 0 && (
        <section aria-labelledby="ciclos" className="mt-10">
          <h2 id="ciclos" className="font-serif text-2xl">Ciclos</h2>
          <ul className="mt-4 space-y-3">
            {view.cycles.map((cycle) => (
              <li key={cycle.id}>
                <Link
                  href={`/ciclo/${cycle.slug}`}
                  className="block rounded-2xl border border-line bg-card p-4 transition hover:border-brand"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-serif text-xl">
                      {cycle.position}. {cycle.title}
                    </span>
                    <span className="shrink-0 text-sm text-muted">
                      {cycle.complete ? "Concluído" : `${cycle.percent}%`}
                    </span>
                  </div>
                  {cycle.description && <p className="mt-1 text-sm text-muted">{cycle.description}</p>}
                  <div className="mt-3">
                    <ProgressBar percent={cycle.percent} label={`Progresso do ciclo ${cycle.title}`} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const badge: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-800",
  in_progress: "bg-amber-50 text-amber-800",
  available: "bg-lilac text-foreground",
  locked: "bg-transparent text-muted",
};

function StateBadge({ item, now }: { item: LessonItem; now: Date }) {
  const s = item.state;
  const text =
    s.state === "completed" ? "Concluída" : s.state === "in_progress" ? "Em andamento" : s.state === "available" ? "Disponível" : lockedMessage(s, now);
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badge[s.state]}`}>{text}</span>;
}

export interface CycleBanners {
  /** Título da lição que acabou de ser concluída. */
  completedLesson?: string;
  cycleCompleted?: boolean;
  lockedNotice?: boolean;
}

/** Tela "Ciclo" (RF-06): lista de lições com estado, tempo estimado e data de liberação. */
export function CycleDetail({ cycle, now, banners = {} }: { cycle: CycleView; now: Date; banners?: CycleBanners }) {
  return (
    <div>
      <Link href="/" className="text-sm text-muted underline">
        ← Minha trilha
      </Link>
      <p className="mt-4 text-sm font-medium uppercase tracking-widest text-brand">Ciclo {cycle.position}</p>
      <h1 className="font-serif text-3xl leading-tight">{cycle.title}</h1>
      {cycle.description && <p className="mt-2 text-muted">{cycle.description}</p>}

      {banners.cycleCompleted && (
        <div role="status" className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
          <p className="font-serif text-xl">Parabéns! Você concluiu o ciclo {cycle.title}.</p>
          <p className="mt-1 text-sm">
            Cada ciclo termina com um encontro presencial. A equipe pastoral vai avisar quando for a data. Você já
            pode seguir para o próximo ciclo.
          </p>
        </div>
      )}
      {banners.completedLesson && !banners.cycleCompleted && (
        <p role="status" className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Você concluiu &ldquo;{banners.completedLesson}&rdquo;. Muito bem!
        </p>
      )}
      {banners.lockedNotice && (
        <p role="status" className="mt-5 rounded-xl bg-lilac px-4 py-3 text-sm text-muted">
          Essa lição ainda não foi liberada. Veja abaixo quando ela abre.
        </p>
      )}

      <div className="mt-6">
        <div
          role="progressbar"
          aria-label={`Progresso do ciclo ${cycle.title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={cycle.percent}
          className="h-2.5 w-full overflow-hidden rounded-full bg-lilac"
        >
          <div className="h-full rounded-full bg-brand" style={{ width: `${cycle.percent}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted">
          {cycle.completedCount} de {cycle.requiredCount} lições concluídas
          {cycle.plannedWeeks ? ` · ciclo previsto para ${cycle.plannedWeeks} semanas` : ""}
        </p>
      </div>

      <ol className="mt-6 space-y-3">
        {cycle.lessons.map((lesson) => {
          const locked = lesson.state.state === "locked";
          const inner = (
            <div className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className={`flex size-9 shrink-0 items-center justify-center rounded-full font-serif ${
                  lesson.state.state === "completed" ? "bg-emerald-700 text-white" : "bg-lilac text-foreground"
                }`}
              >
                {lesson.state.state === "completed" ? "✓" : lesson.position}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block font-medium leading-snug ${locked ? "text-muted" : ""}`}>{lesson.title}</span>
                <span className="text-xs text-muted">
                  {lesson.estimatedMinutes !== null && `${lesson.estimatedMinutes} min`}
                  {!lesson.required && " · opcional"}
                </span>
              </span>
              <StateBadge item={lesson} now={now} />
            </div>
          );
          return (
            <li key={lesson.id}>
              {locked ? (
                <div aria-disabled="true" className="rounded-2xl border border-dashed border-line bg-transparent p-4">
                  {inner}
                </div>
              ) : (
                <Link
                  href={`/licao/${lesson.slug}`}
                  className="block rounded-2xl border border-line bg-card p-4 transition hover:border-brand"
                >
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
