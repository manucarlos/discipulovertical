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
  it("último administrador e pessoa inexistente", () => {
    expect(describeEditorError({ code: "P0001", message: "não é possível remover o último administrador" }).message).toMatch(/último administrador/);
    expect(describeEditorError({ code: "P0002", message: "perfil não encontrado" }).message).toMatch(/não foi encontrada/);
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

import {
  describeActivity,
  formatWhatsapp,
  PAGE_SIZE,
  parsePeopleFilters,
  peopleQueryString,
} from "./people";

describe("parsePeopleFilters", () => {
  it("lê filtros válidos", () => {
    expect(parsePeopleFilters({ q: "  ana ", papel: "editor", situacao: "stalled", pagina: "3" })).toEqual({
      search: "ana",
      role: "editor",
      status: "stalled",
      page: 3,
    });
  });
  it("ignora valores inválidos em vez de quebrar", () => {
    expect(parsePeopleFilters({ papel: "chefe", situacao: "quase", pagina: "-2" })).toEqual({
      search: "",
      role: null,
      status: null,
      page: 1,
    });
    expect(parsePeopleFilters({ pagina: "1.5" }).page).toBe(1);
    expect(parsePeopleFilters({ pagina: "abc" }).page).toBe(1);
    expect(parsePeopleFilters({}).page).toBe(1);
  });
  it("limita o tamanho da busca e aceita parâmetro repetido", () => {
    expect(parsePeopleFilters({ q: "x".repeat(500) }).search).toHaveLength(100);
    expect(parsePeopleFilters({ papel: ["admin", "editor"] }).role).toBe("admin");
  });
  it("tem página de tamanho razoável", () => {
    expect(PAGE_SIZE).toBeGreaterThanOrEqual(10);
  });
});

describe("peopleQueryString", () => {
  const base = { search: "", role: null, status: null, page: 1 } as const;
  it("omite o que é padrão", () => {
    expect(peopleQueryString({ ...base }, 1)).toBe("");
  });
  it("mantém os filtros e troca só a página", () => {
    const qs = peopleQueryString({ search: "ana lima", role: "member", status: "stalled", page: 1 }, 2);
    expect(qs).toBe("?q=ana+lima&papel=member&situacao=stalled&pagina=2");
    expect(parsePeopleFilters(Object.fromEntries(new URLSearchParams(qs)))).toMatchObject({ search: "ana lima", page: 2 });
  });
});

describe("describeActivity", () => {
  const now = new Date("2026-09-20T15:00:00Z"); // domingo, 12h em Brasília
  it("hoje, ontem e dias", () => {
    expect(describeActivity(null, now)).toBe("nenhuma atividade");
    expect(describeActivity("2026-09-20T14:00:00Z", now)).toBe("hoje");
    expect(describeActivity("2026-09-19T16:00:00Z", now)).toBe("ontem");
    expect(describeActivity("2026-09-15T16:00:00Z", now)).toBe("há 5 dias");
  });
  it("conta os dias pelo calendário de Brasília, não por 24 horas", () => {
    // 1h em Brasília do dia 20 já é "hoje", mesmo tendo só 14 h de diferença.
    expect(describeActivity("2026-09-20T03:00:00Z", now)).toBe("hoje");
    // 23h de sábado em Brasília (02h UTC de domingo) ainda é "ontem" para quem olha ao meio-dia de domingo,
    // e 23h de sexta já é "há 2 dias".
    expect(describeActivity("2026-09-20T02:00:00Z", now)).toBe("ontem");
    expect(describeActivity("2026-09-19T02:00:00Z", now)).toBe("há 2 dias");
  });
  it("meses e anos", () => {
    expect(describeActivity("2026-06-20T15:00:00Z", now)).toBe("há 3 meses");
    expect(describeActivity("2024-01-01T12:00:00Z", now)).toBe("há 2 anos");
  });
});

describe("formatWhatsapp", () => {
  it("formata celular e fixo brasileiros", () => {
    expect(formatWhatsapp("5511912345678")).toBe("+55 (11) 91234-5678");
    expect(formatWhatsapp("551131234567")).toBe("+55 (11) 3123-4567");
  });
  it("não inventa: sem número é nulo, formato estranho volta como está", () => {
    expect(formatWhatsapp(null)).toBeNull();
    expect(formatWhatsapp("")).toBeNull();
    expect(formatWhatsapp("123")).toBe("123");
  });
});

import { validateChurchPage } from "./church";

describe("validateChurchPage", () => {
  it("apara as pontas e normaliza o fim de linha, sem mexer no miolo", () => {
    expect(validateChurchPage({ title: "  Nossa visão ", body: "  Primeiro.\r\n\r\nSegundo.  " })).toEqual({
      ok: true,
      title: "Nossa visão",
      body: "Primeiro.\n\nSegundo.",
    });
  });
  it("aceita o texto vazio (a página aparece como 'Em breve')", () => {
    expect(validateChurchPage({ title: "Valores", body: "   " })).toEqual({ ok: true, title: "Valores", body: "" });
  });
  it("recusa título vazio e tamanhos absurdos", () => {
    expect(validateChurchPage({ title: " ", body: "x" })).toMatchObject({ ok: false, error: expect.stringMatching(/título/) });
    expect(validateChurchPage({ title: "x".repeat(101), body: "" })).toMatchObject({ ok: false });
    expect(validateChurchPage({ title: "x", body: "y".repeat(20_001) })).toMatchObject({ ok: false });
  });
});

import { formatPercent, normalizeDashboard, parsePeriod, percent, topAbandonment, type LessonMetric } from "./dashboard";

describe("porcentagens e períodos do painel", () => {
  it("sem base não há porcentagem (traço, e não um 0% enganoso)", () => {
    expect(percent(0, 0)).toBeNull();
    expect(formatPercent(3, 0)).toBe("—");
    expect(formatPercent(1, 3)).toBe("33%");
    expect(formatPercent(2, 3)).toBe("67%");
    expect(formatPercent(0, 5)).toBe("0%");
  });
  it("só aceita os períodos que a tela oferece", () => {
    expect(parsePeriod("7")).toBe(7);
    expect(parsePeriod("90")).toBe(90);
    expect(parsePeriod("15")).toBe(30);
    expect(parsePeriod(undefined)).toBe(30);
    expect(parsePeriod(["7", "90"])).toBe(7);
    expect(parsePeriod("abc")).toBe(30);
  });
});

describe("topAbandonment", () => {
  const lesson = (slug: string, stalled: number, started: number, position = 1): LessonMetric => ({
    slug,
    title: slug,
    cycle_slug: "c1",
    cycle_position: 1,
    position,
    started,
    completed: 0,
    stalled_here: stalled,
  });
  it("ordena pelas que mais têm gente parada, desempata por quem começou, e ignora as sem parados", () => {
    const top = topAbandonment([lesson("a", 0, 9), lesson("b", 2, 5, 2), lesson("c", 4, 6, 3), lesson("d", 2, 8, 4)]);
    expect(top.map((l) => l.slug)).toEqual(["c", "d", "b"]);
  });
  it("respeita o limite e não altera a lista original", () => {
    const all = Array.from({ length: 8 }, (_, i) => lesson(`l${i}`, i + 1, 10, i));
    const copy = [...all];
    expect(topAbandonment(all, 3)).toHaveLength(3);
    expect(all).toEqual(copy);
  });
});

describe("normalizeDashboard", () => {
  it("preenche com zero o que o banco devolve vazio", () => {
    const d = normalizeDashboard({
      generated_at: "2026-09-20T15:00:00Z",
      period_days: 30,
      members_total: 0,
      new_in_period: 0,
      start_within_7_days: null,
      situations: { stalled: 2 },
      cycles: null,
      lessons: null,
      vision: null,
    });
    expect(d.situations).toEqual({ onboarding_pending: 0, not_started: 0, in_progress: 0, stalled: 2, completed: 0 });
    expect(d.startWithin7Days).toEqual({ eligible: 0, started: 0 });
    expect(d.cycles).toEqual([]);
    expect(d.vision).toEqual({ lessons: 0, membersKnowing: 0, membersTotal: 0 });
  });
});
