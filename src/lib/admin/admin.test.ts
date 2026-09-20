import { describe, expect, it } from "vitest";
import { buildPractice, buildReflection, linesToItems, parseTags } from "../content/editor-form";
import { describeEditorError } from "./errors";
import { allowedTransitions, findTransition, type LessonStatus } from "./status";

const targets = (role: "editor" | "admin", from: LessonStatus, placeholders = false) =>
  allowedTransitions(role, from, placeholders).map((t) => t.to);

describe("allowedTransitions", () => {
  it("o editor só circula entre rascunho e em revisão", () => {
    expect(targets("editor", "draft")).toEqual(["in_review"]);
    expect(targets("editor", "in_review")).toEqual(["draft"]);
    expect(targets("editor", "published")).toEqual([]);
    expect(targets("editor", "archived")).toEqual([]);
  });

  it("o editor nunca vê o botão de publicar", () => {
    for (const from of ["draft", "in_review", "published", "archived"] as const) {
      expect(targets("editor", from)).not.toContain("published");
    }
  });

  it("o Admin publica a partir de rascunho ou revisão, despublica, arquiva e restaura", () => {
    expect(targets("admin", "draft")).toEqual(["published", "in_review", "archived"]);
    expect(targets("admin", "in_review")).toEqual(["published", "draft", "archived"]);
    expect(targets("admin", "published")).toEqual(["archived", "draft"]);
    expect(targets("admin", "archived")).toEqual(["draft"]);
  });

  it("publicar fica bloqueado, com o motivo, enquanto houver [PREENCHER]", () => {
    const publish = findTransition("admin", "draft", "published", true);
    expect(publish?.blockedReason).toMatch(/PREENCHER/);
    expect(findTransition("admin", "draft", "published", false)?.blockedReason).toBeUndefined();
  });

  it("tirar do ar avisa do efeito sobre quem já iniciou", () => {
    expect(findTransition("admin", "published", "draft", false)?.warning).toMatch(/inclusive quem já a iniciou/);
    expect(findTransition("admin", "published", "archived", false)?.warning).toMatch(/continua a vê-la/);
  });

  it("recusa mudanças que não existem", () => {
    expect(findTransition("admin", "archived", "published", false)).toBeNull();
    expect(findTransition("editor", "draft", "published", false)).toBeNull();
    expect(findTransition("admin", "draft", "draft", false)).toBeNull();
  });
});

describe("describeEditorError", () => {
  it("conflito de edição pede para recarregar", () => {
    const e = describeEditorError({ code: "40001", message: "conflito de edição: a lição foi alterada por outra pessoa" });
    expect(e.conflict).toBe(true);
    expect(e.message).toMatch(/Recarregue/);
  });
  it("marcador em lição publicada", () => {
    const e = describeEditorError({ code: "23514", message: 'violates check constraint "lessons_no_publish_with_placeholders"' });
    expect(e.conflict).toBe(false);
    expect(e.message).toMatch(/PREENCHER/);
    expect(describeEditorError({ message: "lição com [PREENCHER] não pode ser publicada" }).message).toMatch(/PREENCHER/);
  });
  it("falta de permissão", () => {
    expect(describeEditorError({ code: "42501", message: "sem permissão para editar esta lição" }).message).toMatch(/permissão/);
    expect(describeEditorError({ message: "new row violates row-level security policy" }).message).toMatch(/permissão/);
    expect(describeEditorError({ code: "42501", message: "só o administrador reordena lições publicadas ou arquivadas" }).message).toMatch(/reordenar/);
  });
  it("erros de validação da função aparecem em português; o resto vira mensagem genérica", () => {
    expect(describeEditorError({ code: "22023", message: "o título é obrigatório" }).message).toBe("O título é obrigatório.");
    const generic = describeEditorError({ code: "XX000", message: "connection reset by peer" });
    expect(generic.message).toMatch(/Tente de novo/);
    expect(generic.message).not.toMatch(/connection/);
  });
});

describe("conversões do formulário", () => {
  it("etiquetas: separa por vírgula, sem vazias nem repetidas", () => {
    expect(parseTags(" Fundamentos, Ciclo 1 ,, Fundamentos ")).toEqual(["Fundamentos", "Ciclo 1"]);
    expect(parseTags("")).toEqual([]);
  });
  it("itens: um por linha, ignorando linhas em branco e finais de linha do Windows", () => {
    expect(linesToItems("a\r\n\r\n  b  \n")).toEqual(["a", "b"]);
  });
  it("prática: sem itens não há prática; título padrão", () => {
    expect(buildPractice("Prática", "  \n ")).toBeNull();
    expect(buildPractice("", "fazer")).toEqual({ title: "Prática da semana", items: ["fazer"] });
    expect(buildPractice("Desafio", "a\nb")).toEqual({ title: "Desafio", items: ["a", "b"] });
  });
  it("reflexão: vazia vira nenhuma", () => {
    expect(buildReflection("   ")).toBeNull();
    expect(buildReflection(" Pense. ")).toBe("Pense.");
  });
});

import { validateCycleSettings, type CycleSettingsInput } from "./cycle";

describe("validateCycleSettings", () => {
  const base: CycleSettingsInput = {
    title: " Fundamentos ",
    description: " Salvação. ",
    plannedWeeks: "4",
    releaseIntervalDays: "3",
    maxLessonsPerWeek: "2",
    active: true,
  };
  const error = (patch: Partial<CycleSettingsInput>) => {
    const r = validateCycleSettings({ ...base, ...patch });
    return r.ok ? null : r.error;
  };

  it("aceita e normaliza", () => {
    expect(validateCycleSettings(base)).toEqual({
      ok: true,
      values: { title: "Fundamentos", description: "Salvação.", planned_weeks: 4, release_interval_days: 3, max_lessons_per_week: 2, active: true },
    });
  });
  it("semanas previstas podem ficar vazias; intervalo zero libera na hora", () => {
    const r = validateCycleSettings({ ...base, plannedWeeks: "", releaseIntervalDays: "0" });
    expect(r.ok && [r.values.planned_weeks, r.values.release_interval_days]).toEqual([null, 0]);
  });
  it("recusa valores fora da faixa ou que não são números inteiros", () => {
    expect(error({ title: " " })).toMatch(/nome/);
    expect(error({ plannedWeeks: "0" })).toMatch(/semanas/);
    expect(error({ plannedWeeks: "abc" })).toMatch(/semanas/);
    expect(error({ releaseIntervalDays: "31" })).toMatch(/intervalo/);
    expect(error({ releaseIntervalDays: "-1" })).toMatch(/intervalo/);
    expect(error({ releaseIntervalDays: "1.5" })).toMatch(/intervalo/);
    expect(error({ maxLessonsPerWeek: "0" })).toMatch(/máximo/);
    expect(error({ maxLessonsPerWeek: "15" })).toMatch(/máximo/);
  });
});
