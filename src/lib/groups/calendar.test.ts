import { describe, expect, it } from "vitest";
import {
  activeDates,
  groupStreak,
  isoWeekday,
  memberDays,
  needsAttention,
  nextMeetingDate,
  releaseDateOfDay,
  releasedDays,
  type GroupSchedule,
} from "./calendar";

// 14/09/2026 é segunda-feira. Horários em Brasília (UTC-3).
const at = (date: string, hour = 12, minute = 0) => new Date(`${date}T${String(hour + 3).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);

const base: GroupSchedule = {
  startDate: "2026-09-14",
  activeWeekdays: [1, 2, 3, 4, 5, 6],
  releaseHour: 6,
  pauses: [],
  totalDays: 24,
  meetingWeekday: 6,
};

describe("dias da semana", () => {
  it("1 é segunda e 7 é domingo", () => {
    expect(isoWeekday("2026-09-14")).toBe(1);
    expect(isoWeekday("2026-09-16")).toBe(3);
    expect(isoWeekday("2026-09-19")).toBe(6);
    expect(isoWeekday("2026-09-20")).toBe(7);
  });
});

describe("releasedDays", () => {
  it("antes do começo, nada; no dia de início só depois da hora de liberação", () => {
    expect(releasedDays(base, at("2026-09-13"))).toBe(0);
    expect(releasedDays(base, at("2026-09-14", 5, 59))).toBe(0);
    expect(releasedDays(base, at("2026-09-14", 6, 0))).toBe(1);
  });

  it("uma lição por dia ativo; o domingo não conta (segunda a sábado)", () => {
    expect(releasedDays(base, at("2026-09-19", 8))).toBe(6); // sábado: 6ª lição
    expect(releasedDays(base, at("2026-09-20", 8))).toBe(6); // domingo: nada novo
    expect(releasedDays(base, at("2026-09-21", 5))).toBe(6);
    expect(releasedDays(base, at("2026-09-21", 7))).toBe(7);
  });

  it("nunca passa do tamanho da trilha", () => {
    expect(releasedDays(base, at("2027-06-01"))).toBe(24);
  });

  it("dias ativos personalizados (só terça e quinta)", () => {
    const tt = { ...base, activeWeekdays: [2, 4], startDate: "2026-09-15" };
    expect(releasedDays(tt, at("2026-09-15", 7))).toBe(1);
    expect(releasedDays(tt, at("2026-09-16", 12))).toBe(1);
    expect(releasedDays(tt, at("2026-09-17", 12))).toBe(2);
    expect(releasedDays(tt, at("2026-09-22", 12))).toBe(3);
  });

  it("pausa: os dias dela são pulados e o calendário desloca os seguintes (RG-04)", () => {
    const paused = { ...base, pauses: [{ from: "2026-09-16", until: "2026-09-18" }] }; // quarta a sexta
    expect(releasedDays(paused, at("2026-09-16", 12))).toBe(2); // seg e ter; a quarta pausada
    expect(releasedDays(paused, at("2026-09-18", 12))).toBe(2);
    expect(releasedDays(paused, at("2026-09-19", 12))).toBe(3); // sábado é a 3ª lição
    expect(releaseDateOfDay(paused, 3)).toBe("2026-09-19");
    expect(releaseDateOfDay(base, 3)).toBe("2026-09-16");
  });

  it("usa o dia de Brasília, não o de UTC (23h de segunda em Brasília ainda é segunda)", () => {
    expect(releasedDays(base, new Date("2026-09-15T02:30:00Z"))).toBe(1); // 23h30 de segunda em Brasília
    expect(releasedDays(base, new Date("2026-09-15T09:30:00Z"))).toBe(2); // 6h30 de terça
  });
});

describe("activeDates e releaseDateOfDay", () => {
  it("lista as datas com lição", () => {
    expect(activeDates(base, "2026-09-21")).toEqual(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-21"]);
  });
  it("a data de cada dia da trilha; fora da trilha, nulo", () => {
    expect(releaseDateOfDay(base, 1)).toBe("2026-09-14");
    expect(releaseDateOfDay(base, 7)).toBe("2026-09-21");
    expect(releaseDateOfDay(base, 0)).toBeNull();
    expect(releaseDateOfDay(base, 25)).toBeNull();
  });
});

describe("nextMeetingDate", () => {
  it("o próximo dia de encontro, hoje incluído", () => {
    expect(nextMeetingDate(base, at("2026-09-16"))).toBe("2026-09-19");
    expect(nextMeetingDate(base, at("2026-09-19"))).toBe("2026-09-19");
    expect(nextMeetingDate(base, at("2026-09-20"))).toBe("2026-09-26");
    expect(nextMeetingDate({ ...base, meetingWeekday: null }, at("2026-09-16"))).toBeNull();
  });
  it("antes do começo do grupo, o primeiro encontro depois do início", () => {
    expect(nextMeetingDate(base, at("2026-09-01"))).toBe("2026-09-19");
  });
});

describe("memberDays (RG-02, RG-03)", () => {
  const now = at("2026-09-18", 9); // sexta: 5 lições liberadas
  const joined = at("2026-09-14", 8);

  it("lida, em atraso, do dia e ainda não liberada", () => {
    const states = memberDays(base, new Set([1, 2]), joined, now).slice(0, 7).map((d) => d.state);
    expect(states).toEqual(["done", "done", "late", "late", "today", "not_released", "not_released"]);
  });

  it("lição em atraso fica aberta e, lida depois, vira 'done'", () => {
    expect(memberDays(base, new Set([1, 2, 3, 4, 5]), joined, now)[2].state).toBe("done");
  });

  it("entrada tardia: começa na lição do dia; as anteriores ficam disponíveis, sem virar atraso", () => {
    const late = memberDays(base, new Set(), at("2026-09-17", 9), now).slice(0, 6).map((d) => d.state);
    expect(late).toEqual(["available", "available", "available", "late", "today", "not_released"]);
  });
});

describe("sequência e alerta (RG-11)", () => {
  const now = at("2026-09-18", 9); // 5 lições liberadas
  const joined = at("2026-09-14", 8);

  it("sequência: dias seguidos lidos até o mais recente; a lição de hoje ainda pode ser lida", () => {
    expect(groupStreak(base, new Set([1, 2, 3, 4]), now)).toBe(4); // hoje (5) ainda não lida
    expect(groupStreak(base, new Set([1, 2, 3, 4, 5]), now)).toBe(5);
    expect(groupStreak(base, new Set([1, 2, 4]), now)).toBe(1); // o 3 quebrou
    expect(groupStreak(base, new Set(), now)).toBe(0);
  });

  it("alerta: 3 dias ativos seguidos sem leitura (configurável), sem contar o de hoje", () => {
    expect(needsAttention(base, new Set([1, 2]), joined, now, 3)).toBe(false); // faltaram 3 e 4: só 2 dias
    expect(needsAttention(base, new Set([1]), joined, now, 3)).toBe(true); // faltaram 2, 3 e 4
    expect(needsAttention(base, new Set([1]), joined, now, 4)).toBe(false);
    expect(needsAttention(base, new Set([1]), joined, now, 2)).toBe(true);
    expect(needsAttention(base, new Set([1, 2, 3, 4]), joined, now, 3)).toBe(false);
  });

  it("quem acabou de entrar não é alertado por dias anteriores à entrada", () => {
    expect(needsAttention(base, new Set(), at("2026-09-18", 8), now, 3)).toBe(false);
  });
});
