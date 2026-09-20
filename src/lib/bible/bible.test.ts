import { describe, expect, it } from "vitest";
import { findReferences, parseReference } from "./references";
import { createExternalLinkProvider } from "./provider";
import { estimateReadingMinutes } from "../lessons/reading-time";

describe("findReferences", () => {
  it("encontra referências simples, com intervalo e só capítulo", () => {
    const text = "Leia João 3.16, depois Efésios 2.8-9 e Salmos 23.";
    const labels = findReferences(text).map((r) => r.reference.label);
    expect(labels).toEqual(["João 3.16", "Efésios 2.8-9", "Salmos 23"]);
  });

  it("devolve as posições exatas no texto", () => {
    const text = "Veja (João 1.12) agora.";
    const [r] = findReferences(text);
    expect(text.slice(r.start, r.end)).toBe("João 1.12");
  });

  it("distingue 1 João de João e livros numerados", () => {
    const refs = findReferences("1 João 4.8 e João 4.8 e 1 Coríntios 10.13");
    expect(refs.map((r) => [r.reference.bookCode, r.reference.label])).toEqual([
      ["1JN", "1 João 4.8"],
      ["JHN", "João 4.8"],
      ["1CO", "1 Coríntios 10.13"],
    ]);
  });

  it("aceita dois-pontos e o singular 'Salmo', normalizando o nome", () => {
    const [a, b] = findReferences("Salmo 23:1 e João 3:16-18");
    expect(a.reference).toMatchObject({ bookName: "Salmos", chapter: 23, verseStart: 1 });
    expect(b.reference.label).toBe("João 3.16-18");
  });

  it("ignora texto que não é referência", () => {
    expect(findReferences("Ele orou por 3 dias. Tiago disse que não. João e Maria.")).toEqual([]);
    expect(findReferences("Marcos 0.1")).toEqual([]);
  });

  it("não confunde com palavras coladas", () => {
    expect(findReferences("Joãozinho 3.16")).toEqual([]);
  });
});

describe("parseReference", () => {
  it("lê o versículo-chave inteiro", () => {
    expect(parseReference(" João 1.12 ")?.label).toBe("João 1.12");
  });
  it("recusa texto que não é só uma referência", () => {
    expect(parseReference("Leia João 1.12")).toBeNull();
    expect(parseReference("")).toBeNull();
  });
});

describe("provedor de link externo", () => {
  const provider = createExternalLinkProvider([
    {
      code: "NTLH",
      name: "NTLH",
      copyrightNotice: null,
      externalReaderUrl: "https://leitor.example/passage/?search={query}&version=NTLH",
    },
    { code: "NVI", name: "NVI", copyrightNotice: null, externalReaderUrl: null },
  ]);
  const ref = parseReference("João 3.16")!;

  it("devolve só um link, nunca o texto", async () => {
    const result = await provider.getPassage(ref, "NTLH");
    expect(result).toEqual({
      kind: "external",
      label: "João 3.16",
      url: "https://leitor.example/passage/?search=Jo%C3%A3o%203.16&version=NTLH",
    });
    expect(result).not.toHaveProperty("text");
  });

  it("informa indisponível para versão sem leitor ou desconhecida", async () => {
    expect(await provider.getPassage(ref, "NVI")).toEqual({ kind: "unavailable", label: "João 3.16" });
    expect(await provider.getPassage(ref, "XYZ")).toEqual({ kind: "unavailable", label: "João 3.16" });
  });
});

describe("estimateReadingMinutes", () => {
  it("arredonda para cima, com mínimo de 1 minuto", () => {
    expect(estimateReadingMinutes("")).toBe(1);
    expect(estimateReadingMinutes("palavra ".repeat(200))).toBe(1);
    expect(estimateReadingMinutes("palavra ".repeat(201))).toBe(2);
    expect(estimateReadingMinutes("palavra ".repeat(1000))).toBe(5);
  });
});
