import type { Dashboard, LessonMetric } from "./admin/dashboard";
import { loadDevCycles } from "./dev-fixtures";

/**
 * Indicadores de EXEMPLO para a pré-visualização /dev/painel (nada aqui vem de pessoas reais):
 * um funil que vai encolhendo ao longo dos Ciclos 1 e 2, com uma lição onde mais gente parou.
 */
export function devLessonMetrics(): LessonMetric[] {
  const lessons: LessonMetric[] = [];
  let started = 42;
  for (const cycle of loadDevCycles().filter((c) => c.number <= 2)) {
    for (const l of cycle.lessons) {
      const completed = Math.max(0, started - 3 - (l.order === 4 ? 6 : 0));
      lessons.push({
        slug: l.id,
        title: l.title,
        cycle_slug: cycle.slug,
        cycle_position: cycle.number,
        position: l.order,
        started,
        completed,
        stalled_here: l.id === "c1-l04" ? 7 : l.id === "c2-l02" ? 4 : l.order % 3 === 0 ? 1 : 0,
      });
      started = Math.max(1, completed - 1);
    }
  }
  return lessons;
}

export function devDashboard(periodDays = 30): Dashboard {
  const lessons = devLessonMetrics();
  return {
    generatedAt: "2026-09-20T15:00:00Z",
    periodDays,
    membersTotal: 58,
    newInPeriod: periodDays === 7 ? 4 : periodDays === 90 ? 37 : 14,
    startWithin7Days: { eligible: 11, started: 8 },
    situations: { onboarding_pending: 3, not_started: 5, in_progress: 27, stalled: 15, completed: 8 },
    cycles: [
      { slug: "c1", title: "Fundamentos", position: 1, required_total: 8, started_members: 50, completed_members: 21, avg_days: 26.4 },
      { slug: "c2", title: "Raízes", position: 2, required_total: 8, started_members: 21, completed_members: 9, avg_days: 30 },
      { slug: "c3", title: "Pertencimento", position: 3, required_total: 12, started_members: 0, completed_members: 0, avg_days: null },
    ],
    lessons,
    vision: { lessons: 7, membersKnowing: 6, membersTotal: 55 },
  };
}
