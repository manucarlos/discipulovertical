/**
 * Regras de liberação gradual das lições (RN-01, RN-04, RN-10).
 *
 * Funções puras: recebem lições e progresso e devolvem o estado de cada lição.
 * Não tocam no banco nem no relógio (o "agora" é sempre passado por parâmetro).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export interface ReleaseLesson {
  id: string;
  cyclePosition: number;
  position: number;
  required: boolean;
  /** Intervalo mínimo (dias) após concluir a lição anterior. Configurado por ciclo. */
  releaseIntervalDays: number;
  /** Máximo de lições liberadas por janela de 7 dias. Configurado por ciclo. */
  maxLessonsPerWeek: number;
}

export interface ReleaseProgress {
  lessonId: string;
  /** Quando a lição foi aberta/liberada para o membro. */
  releasedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export type LockReason = "previous_incomplete" | "interval" | "weekly_limit";

export type LessonState =
  | { state: "completed"; completedAt: Date }
  | { state: "in_progress" }
  | { state: "available" }
  | { state: "locked"; reason: LockReason; availableAt: Date | null };

function compareLessons(a: ReleaseLesson, b: ReleaseLesson): number {
  return a.cyclePosition - b.cyclePosition || a.position - b.position;
}

/**
 * Calcula o estado de cada lição para um membro.
 *
 * - A primeira lição obrigatória está sempre disponível.
 * - As seguintes exigem a lição obrigatória anterior concluída, o intervalo do ciclo
 *   cumprido e a cota semanal respeitada (RN-01).
 * - Lições opcionais (RN-10) ficam disponíveis assim que a obrigatória anterior é
 *   concluída, sem prazo, e não travam as seguintes.
 * - Uma lição já concluída ou em andamento nunca volta a ficar bloqueada.
 */
export function computeLessonStates(
  lessons: ReleaseLesson[],
  progress: ReleaseProgress[],
  now: Date,
): Map<string, LessonState> {
  const ordered = [...lessons].sort(compareLessons);
  const byLesson = new Map(progress.map((p) => [p.lessonId, p]));
  const states = new Map<string, LessonState>();

  const releasedTimes = progress
    .map((p) => p.releasedAt.getTime())
    .filter((t) => t > now.getTime() - WEEK_MS && t <= now.getTime())
    .sort((a, b) => a - b);

  let previousRequired: ReleaseLesson | null = null;

  for (const lesson of ordered) {
    const own = byLesson.get(lesson.id);

    if (own?.completedAt) {
      states.set(lesson.id, { state: "completed", completedAt: own.completedAt });
    } else if (own?.startedAt) {
      states.set(lesson.id, { state: "in_progress" });
    } else if (!previousRequired) {
      states.set(lesson.id, { state: "available" });
    } else {
      const prevProgress = byLesson.get(previousRequired.id);
      if (!prevProgress?.completedAt) {
        states.set(lesson.id, { state: "locked", reason: "previous_incomplete", availableAt: null });
      } else if (!lesson.required) {
        states.set(lesson.id, { state: "available" });
      } else {
        states.set(lesson.id, gate(lesson, prevProgress.completedAt, releasedTimes, now));
      }
    }

    if (lesson.required) previousRequired = lesson;
  }

  return states;
}

function gate(
  lesson: ReleaseLesson,
  previousCompletedAt: Date,
  releasedTimes: number[],
  now: Date,
): LessonState {
  const intervalAt = previousCompletedAt.getTime() + lesson.releaseIntervalDays * DAY_MS;

  // Cota semanal: se já houve `max` liberações nos últimos 7 dias, a próxima só
  // abre quando a mais antiga que ainda conta sair da janela.
  let weeklyAt = 0;
  if (releasedTimes.length >= lesson.maxLessonsPerWeek) {
    weeklyAt = releasedTimes[releasedTimes.length - lesson.maxLessonsPerWeek] + WEEK_MS;
  }

  const availableAt = Math.max(intervalAt, weeklyAt);
  if (availableAt <= now.getTime()) return { state: "available" };

  // Informa o motivo que segura por mais tempo.
  const reason: LockReason = weeklyAt >= intervalAt ? "weekly_limit" : "interval";
  return { state: "locked", reason, availableAt: new Date(availableAt) };
}

/** RN-04: ciclo concluído quando todas as lições obrigatórias estão concluídas. */
export function isCycleComplete(cycleLessons: ReleaseLesson[], progress: ReleaseProgress[]): boolean {
  const completed = new Set(progress.filter((p) => p.completedAt).map((p) => p.lessonId));
  const required = cycleLessons.filter((l) => l.required);
  return required.length > 0 && required.every((l) => completed.has(l.id));
}

/** Porcentagem (0 a 100) de lições obrigatórias concluídas no ciclo. */
export function cycleCompletionPercent(cycleLessons: ReleaseLesson[], progress: ReleaseProgress[]): number {
  const completed = new Set(progress.filter((p) => p.completedAt).map((p) => p.lessonId));
  const required = cycleLessons.filter((l) => l.required);
  if (required.length === 0) return 0;
  return Math.round((required.filter((l) => completed.has(l.id)).length / required.length) * 100);
}

/** RN-07: parado = 14 dias (ou o limite configurado) sem atividade em uma lição disponível. */
export function isStalled(lastActivityAt: Date, now: Date, thresholdDays = 14): boolean {
  return now.getTime() - lastActivityAt.getTime() >= thresholdDays * DAY_MS;
}
