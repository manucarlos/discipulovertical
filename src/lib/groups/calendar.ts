/**
 * Calendário do Grupo de Discipulado (RG-01 a RG-04, RG-06, RG-11).
 *
 * Funções puras, como as da liberação gradual da trilha (src/lib/lessons/release.ts): recebem o grupo e o
 * relógio e devolvem o que já foi liberado. Dias e horas contam em Brasília.
 *
 *  - A lição do dia libera na hora do grupo (padrão 6h) nos dias ativos (padrão segunda a sábado).
 *  - Uma pausa (RG-04) pula os dias dela: o calendário desloca os dias seguintes.
 *  - Lição já liberada fica sempre aberta; quem não leu está "em atraso" (RG-02), sem bloqueio.
 *  - Quem entra com o grupo em andamento começa na lição do dia; as anteriores ficam para leitura (RG-03).
 */
const TIME_ZONE = "America/Sao_Paulo";
const DAY_MS = 86_400_000;

export interface GroupSchedule {
  /** Primeiro dia do grupo (yyyy-mm-dd). */
  startDate: string;
  /** 1 = segunda ... 7 = domingo. */
  activeWeekdays: number[];
  /** Hora (0 a 23) em que a lição do dia libera. */
  releaseHour: number;
  pauses: { from: string; until: string }[];
  /** Quantos dias tem a trilha. */
  totalDays: number;
  /** Dia de encontro sugerido (1 a 7), se houver. */
  meetingWeekday?: number | null;
}

const brt = (d: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
};

const dayNumberOf = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const dateOfDayNumber = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
/** 1 = segunda ... 7 = domingo. */
export const isoWeekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

const isPaused = (schedule: GroupSchedule, date: string) => schedule.pauses.some((p) => date >= p.from && date <= p.until);
const isActiveDay = (schedule: GroupSchedule, date: string) => schedule.activeWeekdays.includes(isoWeekday(date)) && !isPaused(schedule, date);

/** Os dias do calendário (yyyy-mm-dd) em que sai lição, do começo até `upTo` (inclusive). */
export function activeDates(schedule: GroupSchedule, upTo: string): string[] {
  const out: string[] = [];
  for (let n = dayNumberOf(schedule.startDate); n <= dayNumberOf(upTo) && out.length < 1000; n++) {
    const date = dateOfDayNumber(n);
    if (isActiveDay(schedule, date)) out.push(date);
  }
  return out;
}

/** Quantas lições já foram liberadas em `now` (limitado ao tamanho da trilha). */
export function releasedDays(schedule: GroupSchedule, now: Date): number {
  const { date, hour } = brt(now);
  if (date < schedule.startDate) return 0;
  const dates = activeDates(schedule, date);
  // O dia de hoje só conta depois da hora de liberação.
  const todayCounts = dates.at(-1) === date && hour < schedule.releaseHour ? -1 : 0;
  return Math.min(schedule.totalDays, Math.max(0, dates.length + todayCounts));
}

/** A data do calendário em que a lição do dia N libera, ou nulo se a trilha não chega lá. */
export function releaseDateOfDay(schedule: GroupSchedule, dayNumber: number): string | null {
  if (dayNumber < 1 || dayNumber > schedule.totalDays) return null;
  let count = 0;
  for (let n = dayNumberOf(schedule.startDate); count < dayNumber && n < dayNumberOf(schedule.startDate) + 5000; n++) {
    const date = dateOfDayNumber(n);
    if (isActiveDay(schedule, date)) count++;
    if (count === dayNumber) return date;
  }
  return null;
}

/** A próxima data de encontro (yyyy-mm-dd), de hoje em diante, ou nulo se o grupo não tem dia de encontro. */
export function nextMeetingDate(schedule: GroupSchedule, now: Date): string | null {
  if (!schedule.meetingWeekday) return null;
  const today = dayNumberOf(brt(now).date);
  const start = dayNumberOf(schedule.startDate);
  for (let n = Math.max(today, start); n < Math.max(today, start) + 8; n++) {
    if (isoWeekday(dateOfDayNumber(n)) === schedule.meetingWeekday) return dateOfDayNumber(n);
  }
  return null;
}

export type DayState = "not_released" | "today" | "done" | "late" | "available";

export interface MemberDay {
  day: number;
  state: DayState;
}

/**
 * A situação de cada dia da trilha para um discípulo.
 *  - "not_released": ainda não liberou.
 *  - "today": a lição do dia, ainda não lida.
 *  - "late": liberada antes de hoje, não lida, e a pessoa já estava no grupo (RG-02).
 *  - "available": liberada antes da entrada da pessoa (RG-03), não lida: pode ler, não conta como atraso.
 *  - "done": lida (mesmo em atraso).
 */
export function memberDays(schedule: GroupSchedule, completedDays: ReadonlySet<number>, joinedAt: Date, now: Date): MemberDay[] {
  const released = releasedDays(schedule, now);
  const joinDay = Math.max(1, releasedDays(schedule, joinedAt));
  return Array.from({ length: schedule.totalDays }, (_, i) => {
    const day = i + 1;
    let state: DayState;
    if (completedDays.has(day)) state = "done";
    else if (day > released) state = "not_released";
    else if (day === released) state = "today";
    else state = day >= joinDay ? "late" : "available";
    return { day, state };
  });
}

/** Dias seguidos lidos até o dia mais recente liberado (a "sequência" do grupo). */
export function groupStreak(schedule: GroupSchedule, completedDays: ReadonlySet<number>, now: Date): number {
  const released = releasedDays(schedule, now);
  let streak = 0;
  for (let d = released; d >= 1; d--) {
    if (completedDays.has(d)) streak++;
    else if (d === released) continue; // a lição de hoje ainda pode ser lida
    else break;
  }
  return streak;
}

/**
 * RG-11: o discípulo está há `alertDays` dias ativos seguidos sem ler? Conta os dias liberados desde a entrada,
 * de trás para frente, sem contar a lição de hoje (que ainda pode ser lida).
 */
export function needsAttention(schedule: GroupSchedule, completedDays: ReadonlySet<number>, joinedAt: Date, now: Date, alertDays: number): boolean {
  const released = releasedDays(schedule, now);
  const joinDay = Math.max(1, releasedDays(schedule, joinedAt));
  let missed = 0;
  for (let d = released - 1; d >= joinDay; d--) {
    if (completedDays.has(d)) break;
    missed++;
  }
  return missed >= alertDays;
}
