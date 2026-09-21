import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseReference } from "@/lib/bible/references";
import { asLessonContent } from "@/lib/content/validate";
import { findPlaceholders } from "@/lib/content/placeholders";
import { parseInline } from "@/lib/content/inline";
import { collectLessonTexts } from "@/lib/content/text";
import { LIBRARY_LESSONS, LIBRARY_TRACKS } from "./index";
import { libraryContent } from "./to-sql";

const handoff = fs.readFileSync(path.resolve(__dirname, "../../../docs/HANDOFF.md"), "utf8");

/** A tabela "Biblioteca inicial de lições" da seção 19 do handoff: número, título, tema e se é sensível. */
function handoffTable() {
  const section = handoff.slice(handoff.indexOf("## 19. Biblioteca inicial de lições"), handoff.indexOf("## 20."));
  return [...section.matchAll(/^\| (\d+) \| (.+?) \| (.+?) \| (Sim|Não) \|$/gm)].map((m) => ({
    n: Number(m[1]),
    title: m[2],
    theme: m[3],
    sensitive: m[4] === "Sim",
  }));
}

const words = (lesson: (typeof LIBRARY_LESSONS)[number]) => collectLessonTexts(libraryContent(lesson)).join(" ").split(/\s+/).filter(Boolean).length;
const plain = (lesson: (typeof LIBRARY_LESSONS)[number]) => JSON.stringify(libraryContent(lesson));

describe("a biblioteca segue a tabela do handoff (seção 19)", () => {
  const table = handoffTable();

  it("a tabela foi lida: 24 lições", () => expect(table).toHaveLength(24));

  it("as 24 primeiras lições têm o mesmo título, tema e sensibilidade da tabela, na mesma ordem", () => {
    for (const row of table) {
      const lesson = LIBRARY_LESSONS.find((l) => l.n === row.n)!;
      expect(lesson, `lição ${row.n}`).toBeDefined();
      expect(lesson.title).toBe(row.title);
      expect(lesson.theme).toBe(row.theme);
      expect(lesson.sensitive, `sensível: ${row.title}`).toBe(row.sensitive);
    }
  });

  it("há 4 lições de formação do discipulador (25 a 28), e a de proteção é sensível", () => {
    const formation = LIBRARY_LESSONS.filter((l) => l.n > 24);
    expect(formation.map((l) => l.n)).toEqual([25, 26, 27, 28]);
    expect(formation.every((l) => l.theme === "Formação do discipulador")).toBe(true);
    expect(formation.find((l) => l.n === 28)!.sensitive).toBe(true);
  });

  it("as trilhas prontas têm as lições e os dias da tabela", () => {
    const byTitle = (t: string) => LIBRARY_TRACKS.find((x) => x.title === t)!;
    expect(byTitle("Caminhada e Coração").lessons).toEqual([1, 2, 3, 4, 12, 13, 14]);
    expect(byTitle("Mordomia e Finanças").lessons).toEqual([5, 6, 7, 8, 9, 10, 11]);
    expect(byTitle("Maturidade em Comunidade").lessons).toEqual([18, 19, 20, 21, 22, 23, 24]);
    expect(byTitle("Casamento Firme").lessons).toEqual([15, 16, 14, 17]); // a 14 está em duas trilhas
    expect(byTitle("Jornada Completa").lessons).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(byTitle("Formação do discipulador").lessons).toEqual([25, 26, 27, 28]);
    for (const track of LIBRARY_TRACKS) for (const n of track.lessons) expect(LIBRARY_LESSONS.some((l) => l.n === n), `${track.title}: lição ${n}`).toBe(true);
  });
});

describe("cada lição segue o molde do handoff", () => {
  it("números e identificadores únicos, na ordem", () => {
    expect(LIBRARY_LESSONS.map((l) => l.n)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    expect(new Set(LIBRARY_LESSONS.map((l) => l.slug)).size).toBe(28);
    for (const l of LIBRARY_LESSONS) expect(l.slug, l.slug).toMatch(new RegExp(`^lib-${String(l.n).padStart(2, "0")}-[a-z0-9-]+$`));
  });

  it("versículo-chave por referência (nunca o texto), que o app reconhece", () => {
    for (const l of LIBRARY_LESSONS) {
      const ref = parseReference(l.keyVerse);
      expect(ref, `${l.slug}: ${l.keyVerse}`).not.toBeNull();
      expect(l.keyVerse.length, l.slug).toBeLessThan(30); // referência curta, não um trecho
    }
  });

  it("leitura curta em linguagem pastoral (200 a 800 palavras) e tempo estimado coerente", () => {
    for (const l of LIBRARY_LESSONS) {
      const w = words(l);
      expect(w, `${l.slug}: ${w} palavras`).toBeGreaterThanOrEqual(200);
      expect(w, `${l.slug}: ${w} palavras`).toBeLessThanOrEqual(800);
      expect(l.minutes).toBeGreaterThanOrEqual(3);
      expect(l.minutes).toBeLessThanOrEqual(6);
    }
  });

  it("reflexão, desafio do dia e guia do discipulador (3 ou 4 perguntas)", () => {
    for (const l of LIBRARY_LESSONS) {
      expect(l.reflection.trim().length, l.slug).toBeGreaterThan(20);
      expect(l.challenge.trim().length, l.slug).toBeGreaterThan(20);
      expect(l.guide.length, `${l.slug}: guia`).toBeGreaterThanOrEqual(3);
      expect(l.guide.length, `${l.slug}: guia`).toBeLessThanOrEqual(4);
      expect(l.objective.length, l.slug).toBeGreaterThan(30);
      expect(l.reviewNote.length, l.slug).toBeGreaterThan(20);
    }
  });

  it("o conteúdo é válido no formato do app e todo texto com marcação **negrito**/*itálico* fecha certo", () => {
    for (const l of LIBRARY_LESSONS) {
      const content = libraryContent(l);
      const valid = asLessonContent(JSON.parse(JSON.stringify(content)));
      expect(valid, l.slug).not.toBeNull();
      expect(valid!.blocks, l.slug).toHaveLength(content.blocks.length); // nenhum bloco é descartado
      for (const text of collectLessonTexts(content)) {
        const nodes = parseInline(text);
        expect(nodes.length, `${l.slug}: ${text.slice(0, 30)}`).toBeGreaterThan(0);
        expect(text.split("**").length % 2, `${l.slug}: negrito aberto em "${text.slice(0, 40)}"`).toBe(1);
      }
    }
  });

  it("nenhum texto bíblico literal: sem blocos de citação e sem trechos longos entre aspas", () => {
    for (const l of LIBRARY_LESSONS) {
      expect(l.blocks.some((b) => b.type === "quote"), `${l.slug}: citação`).toBe(false);
      for (const text of collectLessonTexts(libraryContent(l))) {
        for (const m of text.matchAll(/["“]([^"”]{60,})["”]/g)) throw new Error(`${l.slug}: trecho longo entre aspas (pode ser citação bíblica): ${m[1].slice(0, 50)}…`);
      }
    }
  });
});

describe("avisos de segurança nas lições sensíveis (seção 19)", () => {
  const sensitive = LIBRARY_LESSONS.filter((l) => l.sensitive);

  it("as sensíveis dizem que não substituem acompanhamento profissional e têm nota de cuidado no guia", () => {
    expect(sensitive.map((l) => l.n)).toEqual([9, 10, 12, 13, 14, 16, 17, 28]);
    for (const l of sensitive) {
      expect(plain(l), `${l.slug}: aviso de que não substitui`).toMatch(/não substitui/);
      expect(l.guide.some((q) => q.startsWith("Nota de cuidado:")), `${l.slug}: nota de cuidado`).toBe(true);
      expect(l.reviewNote, l.slug).toMatch(/^SENSÍVEL\./);
    }
  });

  it("lições emocionais (12, 13, 14): CVV 188; lições conjugais (16, 17): Ligue 180 e 190, segurança primeiro", () => {
    for (const n of [12, 13]) expect(plain(LIBRARY_LESSONS[n - 1]), `lição ${n}`).toMatch(/188/);
    for (const n of [14, 16, 17]) {
      const text = plain(LIBRARY_LESSONS[n - 1]);
      expect(text, `lição ${n}`).toMatch(/Ligue 180/);
      expect(text, `lição ${n}`).toMatch(/190/);
      expect(text, `lição ${n}`).toMatch(/segurança vem primeiro|segurança/);
    }
    expect(plain(LIBRARY_LESSONS[27])).toMatch(/188/);
  });

  it("dinheiro e emocional trazem encaminhamento a profissionais e ao pastor", () => {
    for (const n of [9, 12, 13, 16, 17]) expect(plain(LIBRARY_LESSONS[n - 1]), `lição ${n}`).toMatch(/pastor|profissional/);
  });
});

describe("informações da igreja não são inventadas: ficam como [PREENCHER], que bloqueia a publicação", () => {
  it("as lições que dependem de contato ou política da igreja têm marcador; as demais, não", () => {
    const withPlaceholder = LIBRARY_LESSONS.filter((l) => findPlaceholders(libraryContent(l)).length > 0).map((l) => l.n);
    expect(withPlaceholder).toEqual([7, 9, 10, 12, 13, 14, 16, 17, 28]);
  });

  it("nenhuma lição inventa telefone, endereço ou e-mail da igreja", () => {
    for (const l of LIBRARY_LESSONS) {
      const text = plain(l);
      const numbers = [...text.matchAll(/\b\d{3,}\b/g)].map((m) => m[0]).filter((n) => !["188", "180", "190", "192"].includes(n));
      expect(numbers, `${l.slug}: números que parecem telefone`).toEqual([]);
      expect(text, l.slug).not.toMatch(/@|https?:\/\/|www\./);
    }
  });
});
