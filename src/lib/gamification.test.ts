import { describe, expect, it } from "vitest";
import { computeEngagement, computeStreaks } from "./gamification";

// Quarta-feira, 12h em Brasília.
const NOW = new Date("2026-09-16T15:00:00Z");
const day = (n: number, hour = 15) => new Date(NOW.getTime() - n * 86_400_000 + (hour - 15) * 3_600_000);

describe("computeStreaks", () => {
  it("sem atividade, nada", () => {
    expect(computeStreaks([], NOW)).toEqual({ current: 0, best: 0 });
  });

  it("dias seguidos até hoje formam a sequência; vários eventos no mesmo dia contam um", () => {
    expect(computeStreaks([day(0), day(0, 9), day(1), day(2)], NOW)).toEqual({ current: 3, best: 3 });
  });

  it("a sequência ainda vale se a última atividade foi ontem (o dia de hoje está aberto)", () => {
    expect(computeStreaks([day(1), day(2)], NOW)).toEqual({ current: 2, best: 2 });
  });

  it("se passou mais de um dia, a atual zera, mas a melhor fica", () => {
    expect(computeStreaks([day(3), day(4), day(5)], NOW)).toEqual({ current: 0, best: 3 });
  });

  it("um buraco separa as sequências", () => {
    expect(computeStreaks([day(0), day(1), day(3), day(4), day(5), day(6)], NOW)).toEqual({ current: 2, best: 4 });
  });

  it("conta os dias no fuso de Brasília: 22h de um dia e 1h do seguinte são dias seguidos", () => {
    const late = new Date("2026-09-15T01:00:00Z"); // 22h de 14/09 em Brasília
    const early = new Date("2026-09-15T04:00:00Z"); // 1h de 15/09 em Brasília
    expect(computeStreaks([late, early], NOW).best).toBe(2);
  });
});

describe("computeEngagement", () => {
  it("marcos: lições, ciclos e sequência", () => {
    const e = computeEngagement({ activity: [day(0), day(1), day(2)], completedLessons: 6, completedCycles: 1, now: NOW });
    const reached = e.milestones.filter((m) => m.reached).map((m) => m.id);
    expect(reached).toEqual(["lessons-1", "lessons-5", "cycle-1", "streak-3"]);
    expect(e.streakDays).toBe(3);
  });

  it("quem ainda não começou não tem nada a mostrar", () => {
    const e = computeEngagement({ activity: [], completedLessons: 0, completedCycles: 0, now: NOW });
    expect(e.milestones.every((m) => !m.reached)).toBe(true);
    expect(e.streakDays).toBe(0);
  });

  it("o marco de dias seguidos usa a melhor sequência, para não sumir quando ela acaba", () => {
    const e = computeEngagement({ activity: [day(10), day(11), day(12), day(13), day(14), day(15), day(16)], completedLessons: 7, completedCycles: 0, now: NOW });
    expect(e.streakDays).toBe(0);
    expect(e.milestones.find((m) => m.id === "streak-7")?.reached).toBe(true);
  });
});
