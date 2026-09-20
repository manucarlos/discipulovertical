import type { LessonState } from "../lessons/release";

const TIME_ZONE = "America/Sao_Paulo";

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(d); // yyyy-mm-dd
const longDate = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

/** "hoje", "amanhã" ou "quinta-feira, 24 de setembro", no fuso de Brasília. */
export function formatWhen(target: Date, now: Date): string {
  if (dayKey(target) === dayKey(now)) return "hoje";
  if (dayKey(target) === dayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000))) return "amanhã";
  return longDate.format(target);
}

/** Texto curto explicando por que uma lição está bloqueada. */
export function lockedMessage(state: Extract<LessonState, { state: "locked" }>, now: Date): string {
  if (state.reason === "previous_incomplete" || !state.availableAt) return "Conclua a lição anterior";
  return `Libera ${formatWhen(state.availableAt, now)}`;
}
