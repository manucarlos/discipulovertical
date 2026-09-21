import { describe, expect, it } from "vitest";
import { CODE_FORMAT, normalizeCode, readAttendance, validateClosureEvent } from "./closures";

const CYCLE = "0b2f4c1e-7c1d-4a55-9a66-1d2b3c4d5e6f";
const fd = (fields: Record<string, string>) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.append(k, v);
  return d;
};

describe("validateClosureEvent", () => {
  const base = { cycle: CYCLE, title: "  Culto de boas-vindas ", starts_at: "2026-10-04T19:30", kind: "Culto", location: " Templo " };

  it("aceita e converte a hora de Brasília para UTC", () => {
    expect(validateClosureEvent(fd(base))).toEqual({
      ok: true,
      cycleId: CYCLE,
      title: "Culto de boas-vindas",
      kind: "Culto",
      startsAt: "2026-10-04T22:30:00.000Z",
      location: "Templo",
    });
  });

  it("recusa ciclo, título, data ou textos inválidos", () => {
    const bad = (extra: Record<string, string>) => validateClosureEvent(fd({ ...base, ...extra }));
    expect(bad({ cycle: "" }).ok).toBe(false);
    expect(bad({ cycle: "nao-e-uuid" }).ok).toBe(false);
    expect(bad({ title: "   " }).ok).toBe(false);
    expect(bad({ title: "x".repeat(121) }).ok).toBe(false);
    expect(bad({ starts_at: "" }).ok).toBe(false);
    expect(bad({ starts_at: "2026-10-04 19:30" }).ok).toBe(false);
    expect(bad({ starts_at: "2026-13-45T25:61" }).ok).toBe(false);
    expect(bad({ location: "x".repeat(201) }).ok).toBe(false);
    expect(bad({ kind: "x".repeat(61) }).ok).toBe(false);
  });
});

describe("readAttendance", () => {
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  it("quem está marcado é presente, os outros da lista são ausentes, e ids inventados são ignorados", () => {
    const d = new FormData();
    d.append("eligible", A);
    d.append("eligible", B);
    d.append("eligible", "lixo");
    d.append(`present_${A}`, "on");
    d.append("present_cccccccc-cccc-4ccc-8ccc-cccccccccccc", "on"); // fora da lista: não conta
    expect(readAttendance(d)).toEqual({ present: [A], absent: [B] });
  });
});

describe("código do certificado", () => {
  it("normaliza e reconhece o formato", () => {
    expect(normalizeCode("  vc-1a2b-3c4d-5e6f ")).toBe("VC-1A2B-3C4D-5E6F");
    expect(CODE_FORMAT.test("VC-1A2B-3C4D-5E6F")).toBe(true);
    expect(CODE_FORMAT.test("VC-1A2B-3C4D")).toBe(false);
    expect(CODE_FORMAT.test("XX-1A2B-3C4D-5E6F")).toBe(false);
    expect(CODE_FORMAT.test("VC-1A2B-3C4D-5E6G")).toBe(false);
  });
});
