import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberStatus } from "./people";

export interface LessonMetric {
  slug: string;
  title: string;
  cycle_slug: string;
  cycle_position: number;
  position: number;
  started: number;
  completed: number;
  stalled_here: number;
}

export interface CycleMetric {
  slug: string;
  title: string;
  position: number;
  required_total: number;
  started_members: number;
  completed_members: number;
  avg_days: number | null;
}

export interface Dashboard {
  generatedAt: string;
  periodDays: number;
  membersTotal: number;
  newInPeriod: number;
  startWithin7Days: { eligible: number; started: number };
  situations: Record<MemberStatus, number>;
  cycles: CycleMetric[];
  lessons: LessonMetric[];
  vision: { lessons: number; membersKnowing: number; membersTotal: number };
}

export const PERIODS = [7, 30, 90] as const;
export const DEFAULT_PERIOD = 30;

/** Lê ?dias= aceitando só os períodos que a tela oferece. */
export function parsePeriod(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return (PERIODS as readonly number[]).includes(n) ? n : DEFAULT_PERIOD;
}

/** Porcentagem inteira, ou null quando não há base para a conta (evita mostrar "0%" enganoso). */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function formatPercent(part: number, whole: number): string {
  const p = percent(part, whole);
  return p === null ? "—" : `${p}%`;
}

/** As lições em que mais gente parou (só as que têm alguém parado), da pior para a menos pior. */
export function topAbandonment(lessons: LessonMetric[], limit = 5): LessonMetric[] {
  return lessons
    .filter((l) => l.stalled_here > 0)
    .sort((a, b) => b.stalled_here - a.stalled_here || b.started - a.started || a.cycle_position - b.cycle_position || a.position - b.position)
    .slice(0, limit);
}

const ZERO_SITUATIONS: Record<MemberStatus, number> = {
  onboarding_pending: 0,
  not_started: 0,
  in_progress: 0,
  stalled: 0,
  completed: 0,
};

interface RawDashboard {
  generated_at: string;
  period_days: number;
  members_total: number;
  new_in_period: number;
  start_within_7_days: { eligible: number; started: number } | null;
  situations: Partial<Record<MemberStatus, number>> | null;
  cycles: CycleMetric[] | null;
  lessons: LessonMetric[] | null;
  vision: { lessons: number; members_knowing: number; members_total: number } | null;
}

/** Converte a resposta do banco no formato da tela, preenchendo com zero o que veio vazio. */
export function normalizeDashboard(raw: RawDashboard): Dashboard {
  return {
    generatedAt: raw.generated_at,
    periodDays: raw.period_days,
    membersTotal: raw.members_total,
    newInPeriod: raw.new_in_period,
    startWithin7Days: raw.start_within_7_days ?? { eligible: 0, started: 0 },
    situations: { ...ZERO_SITUATIONS, ...(raw.situations ?? {}) },
    cycles: raw.cycles ?? [],
    lessons: raw.lessons ?? [],
    vision: {
      lessons: raw.vision?.lessons ?? 0,
      membersKnowing: raw.vision?.members_knowing ?? 0,
      membersTotal: raw.vision?.members_total ?? 0,
    },
  };
}

/** Indicadores completos (só o Admin; a função do banco confere). */
export async function loadDashboard(supabase: SupabaseClient, days: number): Promise<Dashboard> {
  const { data, error } = await supabase.rpc("admin_dashboard", { p_days: days });
  if (error) throw new Error(`Falha ao carregar os indicadores: ${error.message}`);
  return normalizeDashboard(data as RawDashboard);
}

/** Métricas por lição, sem dados pessoais (Editor e Admin). */
export async function loadContentMetrics(supabase: SupabaseClient): Promise<LessonMetric[]> {
  const { data, error } = await supabase.rpc("content_metrics");
  if (error) throw new Error(`Falha ao carregar as métricas: ${error.message}`);
  return (data ?? []) as LessonMetric[];
}
