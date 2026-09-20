import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { estimateReadingMinutes } from "../lessons/reading-time";
import { HandoffParseError, parseHandoff } from "./parse-handoff";
import type { LessonBlock, ParsedLesson } from "./types";

const handoff = fs.readFileSync(path.resolve(__dirname, "../../../docs/HANDOFF.md"), "utf8");
const cycles = parseHandoff(handoff);
const lessons = cycles.flatMap((c) => c.lessons);
const byId = new Map(lessons.map((l) => [l.id, l]));

function blockText(b: LessonBlock): string {
  switch (b.type) {
    case "heading":
    case "paragraph":
    case "quote":
      return b.text;
    case "list":
      return b.items.join(" ");
    case "table":
      return [...b.header, ...b.rows.flat()].join(" ");
  }
}
const bodyText = (l: ParsedLesson) => l.content.blocks.map(blockText).join(" ");

describe("handoff real (docs/HANDOFF.md)", () => {
  it("lê os 3 ciclos com 8, 8 e 12 lições", () => {
    expect(cycles.map((c) => [c.slug, c.title, c.lessons.length])).toEqual([
      ["c1", "Fundamentos", 8],
      ["c2", "Raízes", 8],
      ["c3", "Pertencimento", 12],
    ]);
    expect(cycles.map((c) => c.plannedWeeks)).toEqual([4, 4, 6]);
    expect(cycles[0].closure).toBe("culto de boas-vindas ou batismo");
  });

  it("numera as lições em sequência dentro de cada ciclo", () => {
    for (const c of cycles) {
      expect(c.lessons.map((l) => l.order)).toEqual(c.lessons.map((_, i) => i + 1));
      for (const l of c.lessons) expect(l.id).toMatch(new RegExp(`^c${c.number}-l\\d{2}$`));
    }
  });

  it("toda lição tem objetivo, versículo-chave, corpo, prática, reflexão e 3 perguntas de quiz", () => {
    for (const l of lessons) {
      expect(l.objective, l.id).not.toBe("");
      expect(l.keyVerse, l.id).not.toBe("");
      expect(l.content.blocks.length, l.id).toBeGreaterThan(3);
      expect(l.content.practice?.items.length, l.id).toBeGreaterThan(0);
      expect(l.content.reflection, l.id).toBeTruthy();
      expect(l.quiz, l.id).toHaveLength(3);
      for (const q of l.quiz) {
        expect(Object.keys(q.options), l.id).toEqual(["A", "B", "C"]);
        expect(q.explanation, l.id).not.toBe("");
      }
    }
  });

  it("a lição do desafio de 7 dias mantém o título da prática", () => {
    expect(byId.get("c1-l05")?.content.practice?.title).toBe("Prática da semana: desafio de 7 dias");
    expect(byId.get("c1-l01")?.content.practice?.title).toBe("Prática da semana");
  });

  it("acha exatamente os 38 marcadores [PREENCHER] em 10 lições, como diz a Parte 3", () => {
    const withPlaceholders = lessons.filter((l) => l.hasPlaceholders);
    expect(withPlaceholders.map((l) => l.id)).toEqual([
      "c3-l01", "c3-l03", "c3-l04", "c3-l05", "c3-l06",
      "c3-l07", "c3-l08", "c3-l09", "c3-l10", "c3-l11",
    ]);
    expect(lessons.reduce((sum, l) => sum + l.placeholderCount, 0)).toBe(38);
    expect(byId.get("c3-l10")?.placeholderCount).toBe(13);
    // Ciclos 1 e 2 estão prontos para revisão: nenhum marcador.
    expect(cycles[0].lessons.some((l) => l.hasPlaceholders)).toBe(false);
    expect(cycles[1].lessons.some((l) => l.hasPlaceholders)).toBe(false);
  });

  it("material interno da equipe fica fora do conteúdo do membro (regra 0.4.7)", () => {
    for (const l of lessons) {
      const json = JSON.stringify(l.content);
      expect(json, l.id).not.toMatch(/Sugestão de vídeo|Nota para revisão pastoral|Aviso de rascunho|Botão sugerido/);
      expect(l.internal.videoSuggestion, l.id).toBeTruthy();
      expect(l.internal.pastoralReviewNote, l.id).toBeTruthy();
    }
    expect(byId.get("c1-l07")?.internal.buttonSuggestion).toContain("Quero me batizar");
    expect(byId.get("c3-l06")?.internal.draftNotice).toContain("esboço");
  });

  it("o quiz (com gabarito) não vai para o conteúdo do membro", () => {
    for (const l of lessons) expect(JSON.stringify(l.content), l.id).not.toContain("Resposta:");
  });

  it("interpreta tabelas, citações e listas do corpo", () => {
    const table = byId.get("c3-l07")?.content.blocks.find((b) => b.type === "table");
    expect(table).toMatchObject({ type: "table", header: ["", "Batismo", "Ceia do Senhor"] });
    expect(table?.type === "table" && table.rows.every((r) => r.length === 3)).toBe(true);

    const quote = lessons.flatMap((l) => l.content.blocks).find((b) => b.type === "quote");
    expect(quote?.type === "quote" && quote.text).toMatch(/^Levar pessoas|^Ser uma igreja|^Fazemos isso/);

    const bullets = byId.get("c1-l05")?.content.blocks.find((b) => b.type === "list" && !b.ordered);
    expect(bullets).toBeDefined();
  });

  it("mantém o marcador [PREENCHER] visível no texto do rascunho", () => {
    expect(bodyText(byId.get("c3-l05")!)).toContain("**[PREENCHER:");
  });

  it("o tempo estimado do YAML cobre a lição inteira e respeita a faixa de 5 a 10 minutos (seção 3)", () => {
    for (const l of lessons) {
      expect(l.estimatedMinutes, l.id).toBeGreaterThanOrEqual(5);
      expect(l.estimatedMinutes, l.id).toBeLessThanOrEqual(10);
      // O YAML inclui reflexão, prática e quiz; só o texto principal leva menos que isso.
      expect(estimateReadingMinutes(bodyText(l)), l.id).toBeLessThanOrEqual(l.estimatedMinutes);
    }
  });

  it("nenhuma lição tem texto literal de tradução bíblica: versículos só por referência", () => {
    // Heurística: trecho longo entre aspas retas indicaria transcrição de uma tradução.
    // Pareia as aspas em sequência (as de índice ímpar ao dividir por " estão dentro).
    for (const l of lessons) {
      const inside = bodyText(l).split('"').filter((_, i) => i % 2 === 1);
      expect(inside.filter((s) => s.length > 200), `${l.id} tem citação longa entre aspas`).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Erros: qualquer inconsistência deve quebrar a importação, não passar em silêncio
// ---------------------------------------------------------------------------

function mini(opts: {
  yaml?: Partial<Record<string, string>>;
  keyVerse?: string;
  body?: string;
  quiz?: string;
} = {}): string {
  const y = {
    id: "c1-l01",
    cycle: "1",
    order: "1",
    title: '"Teste"',
    key_verse: '"João 1.12"',
    estimated_minutes: "5",
    tags: '["a"]',
    has_placeholders: "false",
    placeholder_count: "0",
    ...opts.yaml,
  };
  const yamlText = Object.entries(y).map(([k, v]) => `${k}: ${v}`).join("\n");
  return `# PARTE 2: X

## Ciclo 1: Fundamentos

4 semanas, 1 lições. Encerramento presencial: culto.

### Lição 1: Teste

\`\`\`yaml
${yamlText}
\`\`\`

**Objetivo:** aprender.

**Versículo-chave:** ${opts.keyVerse ?? "João 1.12"}

**Tempo estimado:** 5 minutos · **Etiquetas:** a

#### Seção

${opts.body ?? "Texto (João 1.12)."}

**Prática da semana**

1. Fazer algo.

**Reflexão**

Pense.

**Quiz**

${
  opts.quiz ??
  `**Pergunta 1.** Qual?

- A) Um
- B) Dois

**Resposta:** B. Porque sim.`
}

**Sugestão de vídeo (opcional):** algo.

**Nota para revisão pastoral:** algo.

# PARTE 3: Y
`;
}

describe("validações do parser", () => {
  it("aceita uma lição mínima válida", () => {
    const [c] = parseHandoff(mini());
    expect(c.lessons[0]).toMatchObject({ id: "c1-l01", keyVerse: "João 1.12", hasPlaceholders: false });
  });

  it("falha se o YAML e o texto contam marcadores [PREENCHER] de forma diferente", () => {
    expect(() => parseHandoff(mini({ body: "Falta **[PREENCHER: algo]**." }))).toThrow(/declara 0 marcador/);
  });

  it("aceita marcador quando o YAML o declara", () => {
    const [c] = parseHandoff(
      mini({ body: "Falta **[PREENCHER: algo]**.", yaml: { has_placeholders: "true", placeholder_count: "1" } }),
    );
    expect(c.lessons[0].hasPlaceholders).toBe(true);
  });

  it("falha se o versículo-chave difere do YAML ou não é referência", () => {
    expect(() => parseHandoff(mini({ keyVerse: "João 3.16" }))).toThrow(/difere do texto/);
    expect(() =>
      parseHandoff(mini({ yaml: { key_verse: '"Algum texto"' }, keyVerse: "Algum texto" })),
    ).toThrow(/não é uma referência bíblica/);
  });

  it("falha se o título do YAML difere do título da seção", () => {
    expect(() => parseHandoff(mini({ yaml: { title: '"Outro"' } }))).toThrow(/difere do título/);
  });

  it("falha se a resposta do quiz não está entre as alternativas", () => {
    const quiz = `**Pergunta 1.** Qual?

- A) Um
- B) Dois

**Resposta:** C. Nada.`;
    expect(() => parseHandoff(mini({ quiz }))).toThrow(/resposta válida/);
  });

  it("falha com conteúdo inesperado dentro do quiz", () => {
    const quiz = `Texto solto antes da primeira pergunta.`;
    expect(() => parseHandoff(mini({ quiz }))).toThrow(HandoffParseError);
  });

  it("falha se o handoff não tem a Parte 2", () => {
    expect(() => parseHandoff("# outra coisa")).toThrow(/PARTE 2/);
  });
});
