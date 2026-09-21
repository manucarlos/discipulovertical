import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Gamificação leve (RF-30): sequência de dias de leitura e marcos de conquista. Discreta de propósito:
 * só comemora, nunca cobra. Uma sequência que acabou não aparece como perda; a tela só mostra o que existe.
 */
const TIME_ZONE = "America/Sao_Paulo";
const DAY_MS = 86_400_000;

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(d); // yyyy-mm-dd
const dayNumber = (d: Date) => Math.floor(Date.parse(`${dayKey(d)}T00:00:00Z`) / DAY_MS);

export interface Milestone {
  id: string;
  label: string;
  reached: boolean;
}

export interface Engagement {
  /** Dias seguidos com atividade, contando até hoje (ou até ontem: o dia de hoje ainda está aberto). */
  streakDays: number;
  /** A maior sequência de todas. */
  bestStreak: number;
  milestones: Milestone[];
}

/** Sequências de dias consecutivos a partir das datas de atividade (em dias de Brasília). */
export function computeStreaks(activity: Date[], now: Date): { current: number; best: number } {
  const days = [...new Set(activity.map(dayNumber))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of days) {
    run = previous !== null && day === previous + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  // A sequência "atual" só vale se a última atividade foi hoje ou ontem.
  const today = dayNumber(now);
  const last = days.at(-1);
  const current = last !== undefined && last >= today - 1 ? run : 0;
  return { current, best };
}

const LESSON_MILESTONES = [1, 5, 10, 20];
const STREAK_MILESTONES = [3, 7];

export function computeEngagement(input: { activity: Date[]; completedLessons: number; completedCycles: number; now: Date }): Engagement {
  const { current, best } = computeStreaks(input.activity, input.now);
  const milestones: Milestone[] = [
    ...LESSON_MILESTONES.map((n) => ({
      id: `lessons-${n}`,
      label: n === 1 ? "Primeira lição concluída" : `${n} lições concluídas`,
      reached: input.completedLessons >= n,
    })),
    ...[1, 2, 3].map((n) => ({ id: `cycle-${n}`, label: n === 1 ? "Primeiro ciclo concluído" : `${n} ciclos concluídos`, reached: input.completedCycles >= n })),
    ...STREAK_MILESTONES.map((n) => ({ id: `streak-${n}`, label: `${n} dias seguidos lendo`, reached: best >= n })),
  ];
  return { streakDays: current, bestStreak: best, milestones };
}

/** Lê a atividade da própria pessoa e calcula. */
export async function loadEngagement(supabase: SupabaseClient, userId: string, now: Date): Promise<Engagement> {
  const [progressRes, cyclesRes] = await Promise.all([
    supabase.from("lesson_progress").select("status, started_at, completed_at").eq("user_id", userId),
    supabase.from("cycle_progress").select("cycle_id").eq("user_id", userId).eq("status", "completed"),
  ]);
  if (progressRes.error) throw new Error(`Falha ao carregar o seu andamento: ${progressRes.error.message}`);
  const rows = (progressRes.data ?? []) as { status: string; started_at: string | null; completed_at: string | null }[];
  const activity: Date[] = [];
  for (const r of rows) {
    if (r.started_at) activity.push(new Date(r.started_at));
    if (r.completed_at) activity.push(new Date(r.completed_at));
  }
  return computeEngagement({
    activity,
    completedLessons: rows.filter((r) => r.status === "completed").length,
    completedCycles: (cyclesRes.data ?? []).length,
    now,
  });
}
