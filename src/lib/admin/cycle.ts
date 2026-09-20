export interface CycleSettingsInput {
  title: string;
  description: string;
  plannedWeeks: string;
  releaseIntervalDays: string;
  maxLessonsPerWeek: string;
  active: boolean;
}

export type CycleSettingsResult =
  | {
      ok: true;
      values: {
        title: string;
        description: string;
        planned_weeks: number | null;
        release_interval_days: number;
        max_lessons_per_week: number;
        active: boolean;
      };
    }
  | { ok: false; error: string };

const int = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN);

/** RN-01: intervalo mínimo e máximo de lições por semana são configurados por ciclo (só o Admin). */
export function validateCycleSettings(input: CycleSettingsInput): CycleSettingsResult {
  const title = input.title.trim();
  if (title === "") return { ok: false, error: "Escreva o nome do ciclo." };
  if (title.length > 100) return { ok: false, error: "O nome do ciclo pode ter no máximo 100 caracteres." };

  const description = input.description.trim();
  if (description.length > 500) return { ok: false, error: "A descrição pode ter no máximo 500 caracteres." };

  let plannedWeeks: number | null = null;
  if (input.plannedWeeks.trim() !== "") {
    plannedWeeks = int(input.plannedWeeks);
    if (!Number.isInteger(plannedWeeks) || plannedWeeks < 1 || plannedWeeks > 52) {
      return { ok: false, error: "As semanas previstas devem ser um número de 1 a 52." };
    }
  }

  const interval = int(input.releaseIntervalDays);
  if (!Number.isInteger(interval) || interval > 30) {
    return { ok: false, error: "O intervalo entre lições deve ser de 0 a 30 dias." };
  }

  const perWeek = int(input.maxLessonsPerWeek);
  if (!Number.isInteger(perWeek) || perWeek < 1 || perWeek > 14) {
    return { ok: false, error: "O máximo de lições por semana deve ser de 1 a 14." };
  }

  return {
    ok: true,
    values: {
      title,
      description,
      planned_weeks: plannedWeeks,
      release_interval_days: interval,
      max_lessons_per_week: perWeek,
      active: input.active,
    },
  };
}
