import {
  computeLessonStates,
  cycleCompletionPercent,
  isCycleComplete,
  type LessonState,
  type ReleaseLesson,
  type ReleaseProgress,
} from "../lessons/release";

/** Linhas como chegam do banco (colunas em snake_case). */
export interface CycleRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  position: number;
  planned_weeks: number | null;
  release_interval_days: number;
  max_lessons_per_week: number;
}

export interface LessonRow {
  id: string;
  cycle_id: string;
  slug: string;
  title: string;
  position: number;
  estimated_minutes: number | null;
  required: boolean;
}

export interface ProgressRow {
  lesson_id: string;
  released_at: string;
  started_at: string | null;
  completed_at: string | null;
  last_position: number | string | null;
}

export interface LessonItem {
  id: string;
  slug: string;
  title: string;
  position: number;
  estimatedMinutes: number | null;
  required: boolean;
  cycleSlug: string;
  cycleTitle: string;
  state: LessonState;
  lastPosition: number | null;
}

export interface CycleView {
  id: string;
  slug: string;
  title: string;
  description: string;
  position: number;
  plannedWeeks: number | null;
  lessons: LessonItem[];
  requiredCount: number;
  completedCount: number;
  percent: number;
  complete: boolean;
}

export interface TrailView {
  /** Só ciclos que já têm lições publicadas. */
  cycles: CycleView[];
  /** Primeiro ciclo ainda não concluído; null se não há lições ou se tudo foi concluído. */
  current: CycleView | null;
  /** Lição a abrir agora (em andamento ou disponível) no ciclo atual. */
  next: LessonItem | null;
  /** Se nada está disponível agora, a próxima lição a liberar e quando. */
  upcoming: { lesson: LessonItem; availableAt: Date } | null;
  allComplete: boolean;
}

const toDate = (value: string | null) => (value ? new Date(value) : null);

export function buildTrailView(
  cycleRows: CycleRow[],
  lessonRows: LessonRow[],
  progressRows: ProgressRow[],
  now: Date,
): TrailView {
  const cyclesById = new Map(cycleRows.map((c) => [c.id, c]));

  const releaseLessons: ReleaseLesson[] = [];
  for (const l of lessonRows) {
    const cycle = cyclesById.get(l.cycle_id);
    if (!cycle) continue;
    releaseLessons.push({
      id: l.id,
      cyclePosition: cycle.position,
      position: l.position,
      required: l.required,
      releaseIntervalDays: cycle.release_interval_days,
      maxLessonsPerWeek: cycle.max_lessons_per_week,
    });
  }
  const knownLessons = new Set(releaseLessons.map((l) => l.id));

  const progress: ReleaseProgress[] = progressRows
    .filter((p) => knownLessons.has(p.lesson_id))
    .map((p) => ({
      lessonId: p.lesson_id,
      releasedAt: new Date(p.released_at),
      startedAt: toDate(p.started_at),
      completedAt: toDate(p.completed_at),
    }));

  const states = computeLessonStates(releaseLessons, progress, now);
  const lastPositionByLesson = new Map(
    progressRows.map((p) => [p.lesson_id, p.last_position === null ? null : Number(p.last_position)]),
  );

  const cycles: CycleView[] = [];
  for (const cycle of [...cycleRows].sort((a, b) => a.position - b.position)) {
    const rows = lessonRows.filter((l) => l.cycle_id === cycle.id).sort((a, b) => a.position - b.position);
    if (rows.length === 0) continue;

    const items: LessonItem[] = rows.map((l) => ({
      id: l.id,
      slug: l.slug,
      title: l.title,
      position: l.position,
      estimatedMinutes: l.estimated_minutes,
      required: l.required,
      cycleSlug: cycle.slug,
      cycleTitle: cycle.title,
      state: states.get(l.id) ?? { state: "available" },
      lastPosition: lastPositionByLesson.get(l.id) ?? null,
    }));

    const cycleReleaseLessons = releaseLessons.filter((l) => rows.some((r) => r.id === l.id));
    const requiredCount = items.filter((i) => i.required).length;
    cycles.push({
      id: cycle.id,
      slug: cycle.slug,
      title: cycle.title,
      description: cycle.description,
      position: cycle.position,
      plannedWeeks: cycle.planned_weeks,
      lessons: items,
      requiredCount,
      completedCount: items.filter((i) => i.required && i.state.state === "completed").length,
      percent: cycleCompletionPercent(cycleReleaseLessons, progress),
      complete: isCycleComplete(cycleReleaseLessons, progress),
    });
  }

  const current = cycles.find((c) => !c.complete) ?? null;
  const next =
    current?.lessons.find((l) => l.state.state === "in_progress" || l.state.state === "available") ?? null;

  let upcoming: TrailView["upcoming"] = null;
  if (current && !next) {
    for (const lesson of current.lessons) {
      if (lesson.state.state === "locked" && lesson.state.availableAt) {
        upcoming = { lesson, availableAt: lesson.state.availableAt };
        break;
      }
    }
  }

  return { cycles, current, next, upcoming, allComplete: cycles.length > 0 && current === null };
}

export function findLesson(view: TrailView, slug: string): LessonItem | null {
  for (const cycle of view.cycles) {
    const found = cycle.lessons.find((l) => l.slug === slug);
    if (found) return found;
  }
  return null;
}
