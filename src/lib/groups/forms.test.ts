import { describe, expect, it } from "vitest";
import { isIsoDate, validateGroupForm, validateHelpRequest, validateMeeting, validatePause } from "./forms";

const TRACK = "0b2f4c1e-7c1d-4a55-9a66-1d2b3c4d5e6f";
const fd = (fields: Record<string, string | string[]>) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const item of Array.isArray(v) ? v : [v]) d.append(k, item);
  return d;
};

describe("isIsoDate", () => {
  it("aceita só datas reais", () => {
    expect(isIsoDate("2026-09-20")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("20/09/2026")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("validateHelpRequest", () => {
  it("padrão é pedir ao discipulador; 'pastoral' vai direto à equipe", () => {
    expect(validateHelpRequest(fd({ message: " Preciso conversar. ", topic: " Ansiedade " }))).toEqual({ ok: true, topic: "Ansiedade", message: "Preciso conversar.", destination: "discipler" });
    expect(validateHelpRequest(fd({ message: "x", destination: "pastoral" }))).toMatchObject({ ok: true, destination: "pastoral" });
    expect(validateHelpRequest(fd({ message: "x", destination: "qualquer" }))).toMatchObject({ destination: "discipler" });
  });
  it("recusa mensagem vazia ou grande demais", () => {
    expect(validateHelpRequest(fd({ message: "   " })).ok).toBe(false);
    expect(validateHelpRequest(fd({ message: "x".repeat(3001) })).ok).toBe(false);
    expect(validateHelpRequest(fd({ message: "x", topic: "t".repeat(121) })).ok).toBe(false);
  });
});

describe("validateGroupForm", () => {
  const ok = { name: " Grupo da Manhã ", track: TRACK, start_date: "2026-10-05", weekday: ["1", "2", "3", "2"], hour: "7", meeting_weekday: "6" };
  it("aceita e normaliza (dias sem repetição, em ordem)", () => {
    expect(validateGroupForm(fd(ok))).toEqual({ ok: true, name: "Grupo da Manhã", trackId: TRACK, startDate: "2026-10-05", weekdays: [1, 2, 3], hour: 7, meetingWeekday: 6 });
    expect(validateGroupForm(fd({ ...ok, meeting_weekday: "" }))).toMatchObject({ meetingWeekday: null });
  });
  it("recusa dados inválidos", () => {
    for (const bad of [{ name: " " }, { name: "x".repeat(81) }, { track: "nao-uuid" }, { start_date: "05/10/2026" }, { weekday: [] }, { weekday: ["9"] }, { hour: "24" }, { hour: "abc" }, { meeting_weekday: "8" }]) {
      expect(validateGroupForm(fd({ ...ok, ...bad })).ok, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("validatePause e validateMeeting", () => {
  it("pausa: datas reais e fim depois do começo", () => {
    expect(validatePause(fd({ from: "2026-10-01", until: "2026-10-05" }))).toEqual({ ok: true, from: "2026-10-01", until: "2026-10-05" });
    expect(validatePause(fd({ from: "2026-10-05", until: "2026-10-01" })).ok).toBe(false);
    expect(validatePause(fd({ from: "", until: "2026-10-01" })).ok).toBe(false);
  });
  it("encontro: data, notas e só ids válidos na presença", () => {
    const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(validateMeeting(fd({ date: "2026-10-03", notes: " Boa conversa. ", present: [a, "lixo"] }))).toEqual({ ok: true, date: "2026-10-03", notes: "Boa conversa.", attendees: [a] });
    expect(validateMeeting(fd({ date: "hoje" })).ok).toBe(false);
    expect(validateMeeting(fd({ date: "2026-10-03", notes: "x".repeat(5001) })).ok).toBe(false);
  });
});
