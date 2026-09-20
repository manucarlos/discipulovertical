import { describe, expect, it } from "vitest";
import {
  computeLessonStates,
  cycleCompletionPercent,
  isCycleComplete,
  isStalled,
  type ReleaseLesson,
  type ReleaseProgress,
} from "./release";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n, 12)); // dia n de janeiro/2026, 12h

function lesson(position: number, extra: Partial<ReleaseLesson> = {}): ReleaseLesson {
  return {
    id: `l${position}`,
    cyclePosition: 1,
    position,
    required: true,
    releaseIntervalDays: 3,
    maxLessonsPerWeek: 2,
    ...extra,
  };
}

function done(position: number, releasedDay: number, completedDay: number): ReleaseProgress {
  return {
    lessonId: `l${position}`,
    releasedAt: day(releasedDay),
    startedAt: day(releasedDay),
    completedAt: day(completedDay),
  };
}

const lessons = [lesson(1), lesson(2), lesson(3), lesson(4)];

describe("computeLessonStates", () => {
  it("só a primeira lição está disponível para quem nunca começou", () => {
    const s = computeLessonStates(lessons, [], day(0));
    expect(s.get("l1")).toEqual({ state: "available" });
    expect(s.get("l2")).toMatchObject({ state: "locked", reason: "previous_incomplete" });
    expect(s.get("l4")).toMatchObject({ state: "locked", reason: "previous_incomplete" });
  });

  it("lição aberta e não concluída fica em andamento", () => {
    const p: ReleaseProgress[] = [{ lessonId: "l1", releasedAt: day(0), startedAt: day(0), completedAt: null }];
    expect(computeLessonStates(lessons, p, day(1)).get("l1")).toEqual({ state: "in_progress" });
  });

  it("respeita o intervalo mínimo após concluir a anterior", () => {
    const p = [done(1, 0, 0)];
    const before = computeLessonStates(lessons, p, day(2)).get("l2");
    expect(before).toMatchObject({ state: "locked", reason: "interval" });
    expect((before as { availableAt: Date }).availableAt).toEqual(day(3));

    expect(computeLessonStates(lessons, p, day(3)).get("l2")).toEqual({ state: "available" });
  });

  it("intervalo zero libera na hora", () => {
    const l = [lesson(1, { releaseIntervalDays: 0 }), lesson(2, { releaseIntervalDays: 0 })];
    expect(computeLessonStates(l, [done(1, 0, 0)], day(0)).get("l2")).toEqual({ state: "available" });
  });

  it("aplica a cota de 2 lições por semana mesmo com o intervalo cumprido", () => {
    // Lições 1 e 2 abertas nos dias 0 e 1; a 2 concluída no dia 1. Intervalo de 1 dia.
    const l = [1, 2, 3].map((n) => lesson(n, { releaseIntervalDays: 1 }));
    const p = [done(1, 0, 0), done(2, 1, 1)];
    const s = computeLessonStates(l, p, day(3)).get("l3");
    expect(s).toMatchObject({ state: "locked", reason: "weekly_limit" });
    // A liberação mais antiga (dia 0) sai da janela de 7 dias no dia 7.
    expect((s as { availableAt: Date }).availableAt).toEqual(day(7));
    expect(computeLessonStates(l, p, day(7)).get("l3")).toEqual({ state: "available" });
  });

  it("a cota é configurável por ciclo", () => {
    const l = [1, 2, 3].map((n) => lesson(n, { releaseIntervalDays: 1, maxLessonsPerWeek: 3 }));
    const p = [done(1, 0, 0), done(2, 1, 1)];
    expect(computeLessonStates(l, p, day(3)).get("l3")).toEqual({ state: "available" });
  });

  it("lição concluída nunca volta a ficar bloqueada", () => {
    const p = [done(1, 0, 0), done(2, 0, 0)];
    expect(computeLessonStates(lessons, p, day(0)).get("l2")).toMatchObject({ state: "completed" });
  });

  it("ordena por ciclo e depois por posição, mesmo com a lista desordenada", () => {
    const l = [
      lesson(1, { id: "c2-l1", cyclePosition: 2 }),
      lesson(2, { id: "c1-l2" }),
      lesson(1, { id: "c1-l1" }),
    ];
    const s = computeLessonStates(l, [], day(0));
    expect(s.get("c1-l1")).toEqual({ state: "available" });
    expect(s.get("c1-l2")).toMatchObject({ state: "locked" });
    expect(s.get("c2-l1")).toMatchObject({ state: "locked" });
  });

  it("o ciclo seguinte abre depois da última lição do ciclo anterior, sem exigir o encerramento presencial (RN-05)", () => {
    const l = [
      lesson(1, { id: "a", cyclePosition: 1 }),
      lesson(1, { id: "b", cyclePosition: 2, releaseIntervalDays: 3 }),
    ];
    const p: ReleaseProgress[] = [
      { lessonId: "a", releasedAt: day(0), startedAt: day(0), completedAt: day(0) },
    ];
    expect(computeLessonStates(l, p, day(3)).get("b")).toEqual({ state: "available" });
  });

  it("lição opcional não trava as seguintes (RN-10)", () => {
    const l = [lesson(1), lesson(2, { required: false }), lesson(3)];
    const p = [done(1, 0, 0)];
    const s = computeLessonStates(l, p, day(3));
    expect(s.get("l2")).toEqual({ state: "available" });
    // A lição 3 depende da 1 (última obrigatória), não da opcional.
    expect(s.get("l3")).toEqual({ state: "available" });
  });

  it("lição opcional espera a obrigatória anterior ser concluída", () => {
    const l = [lesson(1), lesson(2, { required: false })];
    expect(computeLessonStates(l, [], day(0)).get("l2")).toMatchObject({
      state: "locked",
      reason: "previous_incomplete",
    });
  });
});

describe("ciclo", () => {
  const cycle = [lesson(1), lesson(2), lesson(3, { required: false })];

  it("concluído quando todas as obrigatórias estão concluídas (RN-04)", () => {
    expect(isCycleComplete(cycle, [done(1, 0, 0)])).toBe(false);
    expect(isCycleComplete(cycle, [done(1, 0, 0), done(2, 3, 3)])).toBe(true);
  });

  it("ciclo sem lições obrigatórias nunca conta como concluído", () => {
    expect(isCycleComplete([], [])).toBe(false);
    expect(isCycleComplete([lesson(1, { required: false })], [])).toBe(false);
  });

  it("calcula a porcentagem só sobre as obrigatórias", () => {
    expect(cycleCompletionPercent(cycle, [])).toBe(0);
    expect(cycleCompletionPercent(cycle, [done(1, 0, 0)])).toBe(50);
    expect(cycleCompletionPercent(cycle, [done(1, 0, 0), done(2, 3, 3), done(3, 6, 6)])).toBe(100);
    expect(cycleCompletionPercent([], [])).toBe(0);
  });
});

describe("isStalled (RN-07)", () => {
  it("parado a partir de 14 dias sem atividade", () => {
    expect(isStalled(day(0), day(13))).toBe(false);
    expect(isStalled(day(0), day(14))).toBe(true);
  });
  it("aceita outro limite", () => {
    expect(isStalled(day(0), day(3), 3)).toBe(true);
  });
});
