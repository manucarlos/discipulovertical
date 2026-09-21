import { describe, expect, it } from "vitest";
import { validateSettings } from "@/lib/admin/settings";
import { ALL_OFF, FEATURES, isFeatureKey, resolveSettings } from "./features";

describe("resolveSettings", () => {
  it("sem nenhuma linha, tudo desligado e o nome padrão da igreja", () => {
    const s = resolveSettings([]);
    expect(s.flags).toEqual(ALL_OFF);
    expect(Object.values(s.flags).every((v) => v === false)).toBe(true);
    expect(s.church).toEqual({ name: "Vertical Church", contactEmail: "" });
  });

  it("liga só o que é exatamente verdadeiro; qualquer outra coisa fica desligada", () => {
    const s = resolveSettings([
      { key: "feature.quiz", value: true },
      { key: "feature.video", value: "true" }, // texto não liga
      { key: "feature.groups", value: 1 }, // número não liga
      { key: "feature.reminders", value: null },
    ]);
    expect(s.flags.quiz).toBe(true);
    expect(s.flags.video).toBe(false);
    expect(s.flags.groups).toBe(false);
    expect(s.flags.reminders).toBe(false);
  });

  it("ignora chaves desconhecidas e lê o nome e o contato da igreja", () => {
    const s = resolveSettings([
      { key: "feature.inventado", value: true },
      { key: "church.name", value: "  Igreja Nova  " },
      { key: "church.contact_email", value: "contato@igreja.org" },
    ]);
    expect(Object.keys(s.flags).sort()).toEqual(FEATURES.map((f) => f.key).sort());
    expect(s.church).toEqual({ name: "Igreja Nova", contactEmail: "contato@igreja.org" });
  });

  it("nome vazio ou de tipo errado volta ao padrão", () => {
    expect(resolveSettings([{ key: "church.name", value: "   " }]).church.name).toBe("Vertical Church");
    expect(resolveSettings([{ key: "church.name", value: 42 }]).church.name).toBe("Vertical Church");
  });

  it("cada recurso tem rótulo, fase e descrição", () => {
    for (const f of FEATURES) {
      expect(f.label.length, f.key).toBeGreaterThan(3);
      expect(f.description.length, f.key).toBeGreaterThan(20);
      expect(["V2", "V3", "Grupos"]).toContain(f.phase);
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
    expect(r.rows.find((x) => x.key === "feature.quiz")?.value).toBe(true);
    expect(r.rows.find((x) => x.key === "feature.groups")?.value).toBe(false);
    expect(r.rows).toHaveLength(2 + FEATURES.length);
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
    expect(r.ok && r.rows.every((x) => x.key.startsWith("church.") || FEATURES.some((f) => `feature.${f.key}` === x.key))).toBe(true);
  });
});
