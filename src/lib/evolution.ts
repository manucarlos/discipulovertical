import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Métricas de evolução por pessoa, comuns às três telas que passam a mostrá-las (Pessoas, Meus discípulos,
 * Meus membros): Ciclos e Trilhas do Grupo de Discipulado ficam lado a lado, nunca somados — são sistemas de
 * progresso separados (docs/HANDOFF.md, seção 17). Frequência: média móvel das últimas 4 semanas.
 */
export interface MemberEvolution {
  cyclesCompleted: number;
  cyclesTotal: number;
  cycleFreqPerWeek: number;
  groupsInProgress: number;
  groupsCompleted: number;
  groupLessonsCompleted: number;
  groupLessonsStarted: number;
  groupFreqPerWeek: number;
  lastLoginAt: string | null;
}

export interface EvolutionRow {
  cycles_completed: number;
  cycles_total: number;
  cycle_freq_4w: number | string;
  groups_in_progress: number;
  groups_completed: number;
  group_lessons_completed: number;
  group_lessons_started: number;
  group_freq_4w: number | string;
  last_login_at: string | null;
}

/** O banco devolve `numeric` como string (evita perda de precisão); por isso o Number() nas frequências. */
export function toEvolution(r: EvolutionRow): MemberEvolution {
  return {
    cyclesCompleted: r.cycles_completed,
    cyclesTotal: r.cycles_total,
    cycleFreqPerWeek: Number(r.cycle_freq_4w),
    groupsInProgress: r.groups_in_progress,
    groupsCompleted: r.groups_completed,
    groupLessonsCompleted: r.group_lessons_completed,
    groupLessonsStarted: r.group_lessons_started,
    groupFreqPerWeek: Number(r.group_freq_4w),
    lastLoginAt: r.last_login_at,
  };
}

export interface PersonGroupProgress {
  groupId: string;
  groupName: string;
  trackTitle: string;
  memberStatus: string;
  totalDays: number;
  completedDays: number;
  startedDays: number;
}

interface PersonGroupProgressRow {
  group_id: string;
  group_name: string;
  track_title: string;
  member_status: string;
  total_days: number;
  completed_days: number;
  started_days: number;
}

export function toPersonGroupProgress(r: PersonGroupProgressRow): PersonGroupProgress {
  return {
    groupId: r.group_id,
    groupName: r.group_name,
    trackTitle: r.track_title,
    memberStatus: r.member_status,
    totalDays: r.total_days,
    completedDays: r.completed_days,
    startedDays: r.started_days,
  };
}

/** As trilhas do Grupo de Discipulado de uma pessoa (ficha segregada: nunca somada com Ciclos). Vazio se ela não participa de nenhuma. */
export async function loadPersonGroupProgress(supabase: SupabaseClient, personId: string): Promise<PersonGroupProgress[]> {
  const { data, error } = await supabase.rpc("person_group_progress", { p_target: personId });
  if (error) throw new Error(`Falha ao carregar as trilhas de grupo: ${error.message}`);
  return ((data ?? []) as PersonGroupProgressRow[]).map(toPersonGroupProgress);
}
