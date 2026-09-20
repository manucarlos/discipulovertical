import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { escapeInline, parseInline } from "./inline";
import { parseHandoff } from "./parse-handoff";
import { findPlaceholders } from "./placeholders";
import { blocksToDoc, docToBlocks, EMPTY_DOC, type PMNode } from "./tiptap";
import { validateLessonDraft, type LessonDraftInput } from "./draft";

const lessons = parseHandoff(fs.readFileSync(path.resolve(__dirname, "../../../docs/HANDOFF.md"), "utf8")).flatMap(
  (c) => c.lessons,
);

describe("escape de asteriscos no texto inline", () => {
  it("asterisco e barra literais sobrevivem ao ciclo escrever -> ler", () => {
    for (const text of ["2 * 3 = 6", "a\\b", "**não é negrito**", "fim\\", "*", "\\*"]) {
      const nodes = parseInline(escapeInline(text));
      expect(nodes.map((n) => n.text).join(""), text).toBe(text);
      expect(nodes.every((n) => n.type === "text"), text).toBe(true);
    }
  });
  it("continua lendo negrito e itálico normalmente ao lado de texto escapado", () => {
    expect(parseInline("a \\* b **c** *d*")).toEqual([
      { type: "text", text: "a * b " },
      { type: "bold", text: "c" },
      { type: "text", text: " " },
      { type: "italic", text: "d" },
    ]);
  });
});

describe("conversão blocos <-> editor TipTap", () => {
  it("é sem perdas para as 28 lições do handoff", () => {
    for (const l of lessons) {
      expect(docToBlocks(blocksToDoc(l.content.blocks)), l.id).toEqual(l.content.blocks);
    }
  });

  it("os títulos viram h2 (nível 1) e h3 (nível 2)", () => {
    const doc = blocksToDoc([
      { type: "heading", level: 1, text: "Seção" },
      { type: "heading", level: 2, text: "Subseção" },
    ]);
    expect(doc.content?.map((n) => n.attrs?.level)).toEqual([2, 3]);
  });

  it("gera nós válidos para o editor: sem texto vazio, célula vazia com parágrafo vazio", () => {
    const doc = blocksToDoc([{ type: "table", header: ["", "B"], rows: [["x", ""]] }]);
    const cells = doc.content?.[0].content?.flatMap((row) => row.content ?? []) ?? [];
    expect(cells.map((c) => c.type)).toEqual(["tableHeader", "tableHeader", "tableCell", "tableCell"]);
    expect(cells[0].content).toEqual([{ type: "paragraph" }]);
    expect(cells[3].content).toEqual([{ type: "paragraph" }]);
  });

  it("um documento vazio dá zero blocos, e blocos vazios dão um documento com um parágrafo", () => {
    expect(docToBlocks(EMPTY_DOC)).toEqual([]);
    expect(blocksToDoc([])).toEqual(EMPTY_DOC);
  });

  it("descarta parágrafos e itens vazios que o editor deixa para trás", () => {
    const doc: PMNode = {
      type: "doc",
      content: [
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "   " }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph" }] }] },
        { type: "heading", attrs: { level: 2 } },
        { type: "paragraph", content: [{ type: "text", text: "Fica" }] },
      ],
    };
    expect(docToBlocks(doc)).toEqual([{ type: "paragraph", text: "Fica" }]);
  });

  it("espaços nas pontas do trecho em negrito ficam fora da marcação", () => {
    const doc: PMNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "veja " },
            { type: "text", text: " isto ", marks: [{ type: "bold" }] },
            { type: "text", text: "agora" },
          ],
        },
      ],
    };
    expect(docToBlocks(doc)).toEqual([{ type: "paragraph", text: "veja  **isto** agora" }]);
    // E o resultado continua sendo lido como negrito.
    expect(parseInline("veja  **isto** agora").map((n) => n.type)).toEqual(["text", "bold", "text"]);
  });

  it("escapa asteriscos digitados no editor, para não virarem itálico", () => {
    const doc: PMNode = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a*b*c" }] }] };
    const [block] = docToBlocks(doc);
    expect(block).toEqual({ type: "paragraph", text: "a\\*b\\*c" });
    expect(blocksToDoc([block]).content?.[0].content).toEqual([{ type: "text", text: "a*b*c" }]);
  });

  it("negrito e itálico juntos ficam só negrito (limite do formato)", () => {
    const doc: PMNode = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "bold" }, { type: "italic" }] }] }],
    };
    expect(docToBlocks(doc)).toEqual([{ type: "paragraph", text: "**x**" }]);
  });

  it("completa linhas de tabela curtas com células vazias", () => {
    const cell = (t: string): PMNode => ({ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
    const doc: PMNode = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            { type: "tableRow", content: [cell("A"), cell("B")] },
            { type: "tableRow", content: [cell("1")] },
          ],
        },
      ],
    };
    expect(docToBlocks(doc)).toEqual([{ type: "table", header: ["A", "B"], rows: [["1", ""]] }]);
  });
});

describe("findPlaceholders", () => {
  const notesOf = (l: (typeof lessons)[number]) => ({
    pastoralReviewNote: l.internal.pastoralReviewNote,
    videoSuggestion: l.internal.videoSuggestion,
    draftNotice: l.internal.draftNotice,
    buttonSuggestion: l.internal.buttonSuggestion,
  });

  it("acha os mesmos 38 marcadores que o importador contou, lição a lição", () => {
    let total = 0;
    for (const l of lessons) {
      const hits = findPlaceholders(l.content, notesOf(l));
      expect(hits.length, l.id).toBe(l.placeholderCount);
      total += hits.length;
    }
    expect(total).toBe(38);
  });

  it("diz onde está e o que falta", () => {
    const l = lessons.find((x) => x.id === "c3-l04")!;
    // O único marcador dessa lição está na nota para revisão pastoral.
    expect(findPlaceholders(l.content, notesOf(l))).toEqual([
      { where: "Nota para revisão pastoral", description: "ministérios ou grupos por esfera, se houver." },
    ]);
    const l5 = lessons.find((x) => x.id === "c3-l05")!;
    expect(findPlaceholders(l5.content, notesOf(l5))[0]).toMatchObject({ where: "Texto" });
  });

  it("entende marcador sem descrição e em prática e reflexão", () => {
    const hits = findPlaceholders({
      blocks: [],
      practice: { title: "P", items: ["Leia [PREENCHER: o link]"] },
      reflection: "Conte [PREENCHER]",
    });
    expect(hits).toEqual([
      { where: "Prática", description: "o link" },
      { where: "Reflexão", description: "" },
    ]);
  });

  it("lições dos Ciclos 1 e 2 não têm pendências", () => {
    for (const l of lessons.filter((x) => x.cycle < 3)) expect(findPlaceholders(l.content, notesOf(l)), l.id).toEqual([]);
  });
});

describe("validateLessonDraft", () => {
  const valid = (): LessonDraftInput => ({
    title: "  Salvos pela graça ",
    objective: "Entender a graça.",
    keyVerse: "efésios 2.8-9",
    estimatedMinutes: 6,
    tags: ["Fundamentos", " Ciclo 1 ", "Fundamentos", ""],
    required: true,
    sensitive: false,
    content: { blocks: [{ type: "paragraph", text: "Oi" }], practice: { title: "Prática", items: ["a"] }, reflection: "r" },
    notes: { pastoralReviewNote: " conferir ", videoSuggestion: "", draftNotice: "", buttonSuggestion: "" },
    quiz: [{ prompt: "Qual?", options: { A: "um", B: "dois", C: "" }, correct: "B", explanation: "porque" }],
    note: "",
  });
  const err = (mutate: (d: Record<string, unknown>) => void) => {
    const d = valid() as unknown as Record<string, unknown>;
    mutate(d);
    const r = validateLessonDraft(d);
    return r.ok ? null : r.error;
  };

  it("normaliza: limpa espaços, etiquetas repetidas, referência, alternativas vazias e notas vazias", () => {
    const r = validateLessonDraft(valid());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.fields).toMatchObject({
      title: "Salvos pela graça",
      key_verse_ref: "Efésios 2.8-9",
      estimated_minutes: 6,
      tags: ["Fundamentos", "Ciclo 1"],
      required: true,
      sensitive: false,
    });
    expect(r.draft.notes).toEqual({ pastoral_review_note: "conferir", video_suggestion: null, draft_notice: null, button_suggestion: null });
    expect(r.draft.quiz[0]).toEqual({ prompt: "Qual?", options: { A: "um", B: "dois" }, correct_option: "B", explanation: "porque" });
    expect(r.draft.note).toBeNull();
  });

  it("aceita versículo-chave e tempo vazios (rascunho em andamento)", () => {
    const r = validateLessonDraft({ ...valid(), keyVerse: "", estimatedMinutes: null });
    expect(r.ok && r.draft.fields.key_verse_ref).toBe("");
    expect(r.ok && r.draft.fields.estimated_minutes).toBeNull();
  });

  it("recusa dados que não são objeto, título vazio e versículo que não é referência", () => {
    expect(validateLessonDraft(null)).toMatchObject({ ok: false });
    expect(validateLessonDraft("x")).toMatchObject({ ok: false });
    expect(err((d) => (d.title = "   "))).toMatch(/título/);
    expect(err((d) => (d.keyVerse = "Leia com calma"))).toMatch(/referência/);
  });

  it("recusa tempo fora da faixa ou fracionado", () => {
    expect(err((d) => (d.estimatedMinutes = 0))).toMatch(/tempo/);
    expect(err((d) => (d.estimatedMinutes = 121))).toMatch(/tempo/);
    expect(err((d) => (d.estimatedMinutes = 2.5))).toMatch(/tempo/);
  });

  it("recusa etiquetas demais ou longas demais", () => {
    expect(err((d) => (d.tags = Array.from({ length: 11 }, (_, i) => `t${i}`)))).toMatch(/etiquetas/);
    expect(err((d) => (d.tags = ["x".repeat(41)]))).toMatch(/etiqueta/);
  });

  it("não descarta blocos inválidos em silêncio", () => {
    expect(err((d) => (d.content = { blocks: [{ type: "paragraph", text: "ok" }, { type: "paragraph" }], practice: null, reflection: null }))).toMatch(/bloco/);
    expect(err((d) => (d.content = { blocks: "x" }))).toMatch(/Conteúdo/);
    expect(err((d) => (d.content = null))).toMatch(/Conteúdo/);
  });

  it("recusa prática sem itens (em vez de apagá-la)", () => {
    expect(err((d) => (d.content = { blocks: [], practice: { title: "P", items: [] }, reflection: null }))).toMatch(/prática/i);
  });

  it("aceita prática ausente", () => {
    expect(validateLessonDraft({ ...valid(), content: { blocks: [], practice: null, reflection: null } })).toMatchObject({ ok: true });
  });

  it("valida o quiz: enunciado, alternativas, resposta certa e limites", () => {
    const q = (patch: object) => [{ prompt: "Qual?", options: { A: "um", B: "dois" }, correct: "A", explanation: "", ...patch }];
    expect(err((d) => (d.quiz = q({ prompt: " " })))).toMatch(/enunciado/);
    expect(err((d) => (d.quiz = q({ options: { A: "só uma" } })))).toMatch(/2 alternativas/);
    expect(err((d) => (d.quiz = q({ correct: "C" })))).toMatch(/correta/);
    expect(err((d) => (d.quiz = q({ options: { A: "x", Z: "y" } })))).toMatch(/inválida/);
    expect(err((d) => (d.quiz = Array.from({ length: 11 }, () => q({})[0])))).toMatch(/máximo/);
    expect(validateLessonDraft({ ...valid(), quiz: [] })).toMatchObject({ ok: true });
  });

  it("aceita marcador [PREENCHER] no conteúdo (é rascunho; o banco é quem barra a publicação)", () => {
    const r = validateLessonDraft({
      ...valid(),
      content: { blocks: [{ type: "paragraph", text: "**[PREENCHER: x]**" }], practice: null, reflection: null },
    });
    expect(r.ok).toBe(true);
  });
});
