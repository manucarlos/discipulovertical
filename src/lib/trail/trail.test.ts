import { describe, expect, it } from "vitest";
import { asLessonContent } from "../content/validate";
import { parseInline, stripInline } from "../content/inline";
import { createExternalLinkProvider } from "../bible/provider";
import { resolvePassageLinks } from "../bible/resolve";
import { formatWhen, lockedMessage } from "./format";
import { buildTrailView, findLesson, type CycleRow, type LessonRow, type ProgressRow } from "./view";

const iso = (day: number, hour = 12) => new Date(Date.UTC(2026, 0, 1 + day, hour)).toISOString();
const NOW = new Date(iso(10));

const cycles: CycleRow[] = [
  { id: "c1", slug: "c1", title: "Fundamentos", description: "", position: 1, planned_weeks: 4, release_interval_days: 3, max_lessons_per_week: 2 },
  { id: "c2", slug: "c2", title: "Raízes", description: "", position: 2, planned_weeks: 4, release_interval_days: 3, max_lessons_per_week: 2 },
  { id: "c3", slug: "c3", title: "Vazio", description: "", position: 3, planned_weeks: 6, release_interval_days: 3, max_lessons_per_week: 2 },
];
const lesson = (id: string, cycle: string, position: number, extra: Partial<LessonRow> = {}): LessonRow => ({
  id, cycle_id: cycle, slug: id, title: `Lição ${id}`, position, estimated_minutes: 5, required: true, ...extra,
});
const lessons: LessonRow[] = [
  lesson("a1", "c1", 1), lesson("a2", "c1", 2), lesson("a3", "c1", 3),
  lesson("b1", "c2", 1), lesson("b2", "c2", 2),
];
const done = (id: string, releasedDay: number, completedDay: number): ProgressRow => ({
  lesson_id: id, released_at: iso(releasedDay), started_at: iso(releasedDay), completed_at: iso(completedDay), last_position: 1,
});

describe("buildTrailView", () => {
  it("quem nunca começou vê a primeira lição como a próxima", () => {
    const v = buildTrailView(cycles, lessons, [], NOW);
    expect(v.current?.slug).toBe("c1");
    expect(v.next?.slug).toBe("a1");
    expect(v.upcoming).toBeNull();
    expect(v.allComplete).toBe(false);
  });

  it("ignora ciclos sem lições publicadas", () => {
    expect(buildTrailView(cycles, lessons, [], NOW).cycles.map((c) => c.slug)).toEqual(["c1", "c2"]);
  });

  it("calcula porcentagem e contagem do ciclo", () => {
    const v = buildTrailView(cycles, lessons, [done("a1", 0, 0)], NOW);
    expect(v.current).toMatchObject({ completedCount: 1, requiredCount: 3, percent: 33, complete: false });
  });

  it("lição em andamento tem prioridade e traz a posição de leitura", () => {
    const p: ProgressRow[] = [
      done("a1", 0, 0),
      { lesson_id: "a2", released_at: iso(4), started_at: iso(4), completed_at: null, last_position: "0.4200" },
    ];
    const v = buildTrailView(cycles, lessons, p, NOW);
    expect(v.next).toMatchObject({ slug: "a2", state: { state: "in_progress" }, lastPosition: 0.42 });
  });

  it("quando nada está disponível, informa a próxima liberação", () => {
    // a1 concluída no dia 9 (ontem); intervalo de 3 dias -> a2 libera no dia 12.
    const v = buildTrailView(cycles, lessons, [done("a1", 8, 9)], NOW);
    expect(v.next).toBeNull();
    expect(v.upcoming?.lesson.slug).toBe("a2");
    expect(v.upcoming?.availableAt.toISOString()).toBe(iso(12));
  });

  it("ao concluir um ciclo, o atual passa para o seguinte, sem exigir encerramento presencial", () => {
    const p = [done("a1", 0, 0), done("a2", 3, 3), done("a3", 6, 6)];
    const v = buildTrailView(cycles, lessons, p, NOW);
    expect(v.cycles[0].complete).toBe(true);
    expect(v.current?.slug).toBe("c2");
    expect(v.next?.slug).toBe("b1");
  });

  it("todos os ciclos concluídos", () => {
    const p = [done("a1", 0, 0), done("a2", 3, 3), done("a3", 6, 6), done("b1", 9, 9), done("b2", 12, 12)];
    const v = buildTrailView(cycles, lessons, p, new Date(iso(20)));
    expect(v.allComplete).toBe(true);
    expect(v.current).toBeNull();
    expect(v.next).toBeNull();
  });

  it("sem nenhuma lição publicada não há trilha, e isso não é 'tudo concluído'", () => {
    const v = buildTrailView(cycles, [], [], NOW);
    expect(v.cycles).toEqual([]);
    expect(v.allComplete).toBe(false);
  });

  it("progresso de lição que não está mais publicada é ignorado", () => {
    const v = buildTrailView(cycles, lessons, [done("fantasma", 0, 0)], NOW);
    expect(v.current?.completedCount).toBe(0);
  });

  it("findLesson acha a lição em qualquer ciclo", () => {
    const v = buildTrailView(cycles, lessons, [], NOW);
    expect(findLesson(v, "b2")?.cycleSlug).toBe("c2");
    expect(findLesson(v, "nada")).toBeNull();
  });
});

describe("formatWhen e lockedMessage", () => {
  const now = new Date("2026-09-19T15:00:00Z"); // sábado, 12h em Brasília

  it("hoje, amanhã e data por extenso no fuso de Brasília", () => {
    expect(formatWhen(new Date("2026-09-19T23:00:00Z"), now)).toBe("hoje");
    expect(formatWhen(new Date("2026-09-20T15:00:00Z"), now)).toBe("amanhã");
    expect(formatWhen(new Date("2026-09-24T15:00:00Z"), now)).toBe("quinta-feira, 24 de setembro");
  });

  it("a virada do dia respeita o fuso (2h UTC ainda é o dia anterior em Brasília)", () => {
    expect(formatWhen(new Date("2026-09-20T02:00:00Z"), now)).toBe("hoje");
  });

  it("mensagens de bloqueio", () => {
    expect(lockedMessage({ state: "locked", reason: "previous_incomplete", availableAt: null }, now)).toBe("Conclua a lição anterior");
    expect(lockedMessage({ state: "locked", reason: "interval", availableAt: new Date("2026-09-20T15:00:00Z") }, now)).toBe("Libera amanhã");
  });
});

describe("parseInline", () => {
  it("separa negrito, itálico, marcador e texto", () => {
    expect(parseInline("a **b** c *d* **[PREENCHER: x]** e")).toEqual([
      { type: "text", text: "a " },
      { type: "bold", text: "b" },
      { type: "text", text: " c " },
      { type: "italic", text: "d" },
      { type: "text", text: " " },
      { type: "placeholder", text: "[PREENCHER: x]" },
      { type: "text", text: " e" },
    ]);
  });
  it("texto sem marcação vira um nó só; asterisco solto não quebra", () => {
    expect(parseInline("só texto")).toEqual([{ type: "text", text: "só texto" }]);
    expect(parseInline("2 * 3")).toEqual([{ type: "text", text: "2 * 3" }]);
  });
  it("stripInline remove a marcação", () => {
    expect(stripInline("**Graça** é *favor*")).toBe("Graça é favor");
  });
});

describe("asLessonContent", () => {
  it("aceita conteúdo válido", () => {
    const c = asLessonContent({
      blocks: [{ type: "paragraph", text: "oi" }, { type: "list", ordered: true, items: ["a"] }],
      practice: { title: "Prática", items: ["x"] },
      reflection: "r",
    });
    expect(c?.blocks).toHaveLength(2);
    expect(c?.practice?.items).toEqual(["x"]);
  });
  it("descarta blocos inválidos em vez de quebrar a tela", () => {
    const c = asLessonContent({ blocks: [{ type: "paragraph", text: "ok" }, { type: "paragraph" }, { type: "x" }, null, 3] });
    expect(c?.blocks).toEqual([{ type: "paragraph", text: "ok" }]);
    expect(c?.practice).toBeNull();
  });
  it("recusa o que não tem estrutura", () => {
    expect(asLessonContent(null)).toBeNull();
    expect(asLessonContent({})).toBeNull();
    expect(asLessonContent("texto")).toBeNull();
  });
});

describe("resolvePassageLinks", () => {
  const provider = createExternalLinkProvider([
    { code: "NTLH", name: "NTLH", copyrightNotice: null, externalReaderUrl: "https://x.test/?q={query}" },
  ]);

  it("resolve cada referência única uma vez, em todos os textos", async () => {
    const links = await resolvePassageLinks(provider, ["Veja João 3.16 e Salmos 23.", "De novo João 3.16."], "NTLH");
    expect(Object.keys(links).sort()).toEqual(["João 3.16", "Salmos 23"]);
    expect(links["João 3.16"]).toBe("https://x.test/?q=Jo%C3%A3o%203.16");
  });
  it("sem leitor para a versão, não devolve links", async () => {
    expect(await resolvePassageLinks(provider, ["João 3.16"], "NVI")).toEqual({});
  });
});
