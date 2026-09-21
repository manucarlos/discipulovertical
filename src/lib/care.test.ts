import { describe, expect, it } from "vitest";
import { NOTE_MAX, RESOLUTION_MAX, validateAlertUpdate, validateNote } from "./care";

describe("validateNote", () => {
  it("apara e normaliza; recusa vazio e texto grande demais", () => {
    expect(validateNote("  Liguei.\r\nTudo bem.  ")).toEqual({ ok: true, body: "Liguei.\nTudo bem." });
    expect(validateNote("   ").ok).toBe(false);
    expect(validateNote("x".repeat(NOTE_MAX + 1)).ok).toBe(false);
    expect(validateNote("x".repeat(NOTE_MAX)).ok).toBe(true);
  });
});

describe("validateAlertUpdate", () => {
  it("aceita só as três situações", () => {
    expect(validateAlertUpdate("fechado", "").ok).toBe(false);
    expect(validateAlertUpdate("open", "")).toEqual({ ok: true, status: "open", resolution: null });
    expect(validateAlertUpdate("in_contact", "")).toEqual({ ok: true, status: "in_contact", resolution: null });
  });
  it("o texto só vale ao resolver, e tem limite", () => {
    expect(validateAlertUpdate("resolved", "  Conversamos.  ")).toEqual({ ok: true, status: "resolved", resolution: "Conversamos." });
    expect(validateAlertUpdate("in_contact", "texto solto")).toEqual({ ok: true, status: "in_contact", resolution: null });
    expect(validateAlertUpdate("resolved", "x".repeat(RESOLUTION_MAX + 1)).ok).toBe(false);
  });
});
