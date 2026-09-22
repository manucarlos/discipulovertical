import { describe, expect, it } from "vitest";
import { validateSettings } from "@/lib/admin/settings";
import { ALL_OFF, FEATURES, isFeatureKey, resolveFlags } from "./features";

describe("resolveFlags", () => {
  it("sem nenhuma linha, tudo desligado", () => {
    const flags = resolveFlags([]);
    expect(flags).toEqual(ALL_OFF);
    expect(Object.values(flags).every((v) => v === false)).toBe(true);
  });

  it("liga só o que é exatamente verdadeiro; qualquer outra coisa fica desligada", () => {
    const flags = resolveFlags([
      { key: "feature.quiz", value: true },
      { key: "feature.video", value: "true" }, // texto não liga
      { key: "feature.groups", value: 1 }, // número não liga
      { key: "feature.reminders", value: null },
    ]);
    expect(flags.quiz).toBe(true);
    expect(flags.video).toBe(false);
    expect(flags.groups).toBe(false);
    expect(flags.reminders).toBe(false);
  });

  it("ignora chaves desconhecidas", () => {
    const flags = resolveFlags([{ key: "feature.inventado", value: true }]);
    expect(Object.keys(flags).sort()).toEqual(FEATURES.map((f) => f.key).sort());
  });

  it("cada recurso tem rótulo, fase e descrição", () => {
    for (const f of FEATURES) {
      expect(f.label.length, f.key).toBeGreaterThan(3);
      expect(f.description.length, f.key).toBeGreaterThan(20);
      expect(["V2", "V3", "Grupos", "Piloto"]).toContain(f.phase);
    }
  });

  it("isFeatureKey reconhece só as chaves da lista", () => {
    expect(isFeatureKey("quiz")).toBe(true);
    expect(isFeatureKey("admin")).toBe(false);
  });
});

describe("validateSettings", () => {
  const fd = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };

  it("caixa não marcada vira desligado; marcada vira ligado", () => {
    const r = validateSettings(fd({ church_name: "Igreja", contact_email: "", feature_quiz: "on" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.featureRows.find((x) => x.key === "feature.quiz")?.value).toBe(true);
    expect(r.featureRows.find((x) => x.key === "feature.groups")?.value).toBe(false);
    expect(r.featureRows).toHaveLength(FEATURES.length);
    expect(r.church).toEqual({ name: "Igreja", contactEmail: "" });
  });

  it("recusa nome vazio ou longo demais e e-mail inválido; aceita e-mail vazio", () => {
    expect(validateSettings(fd({ church_name: " ", contact_email: "" })).ok).toBe(false);
    expect(validateSettings(fd({ church_name: "x".repeat(81), contact_email: "" })).ok).toBe(false);
    expect(validateSettings(fd({ church_name: "Igreja", contact_email: "a@b" })).ok).toBe(false);
    expect(validateSettings(fd({ church_name: "Igreja", contact_email: "" })).ok).toBe(true);
    expect(validateSettings(fd({ church_name: "Igreja", contact_email: "a@b.org" })).ok).toBe(true);
  });

  it("só chaves da lista de recursos entram; campos inventados são ignorados", () => {
    const r = validateSettings(fd({ church_name: "Igreja", contact_email: "", feature_hack: "on", "feature.hack": "on" }));
    expect(r.ok && r.featureRows.every((x) => FEATURES.some((f) => `feature.${f.key}` === x.key))).toBe(true);
  });
});
