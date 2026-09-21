import { describe, expect, it } from "vitest";
import { buildCertificatePdf, textWidth } from "./pdf";

const data = {
  holderName: "João da Silva Conceição",
  cycleTitle: "Fundamentos",
  churchName: "Vertical Church",
  code: "VC-1A2B-3C4D-5E6F",
  issuedAt: new Date("2026-09-20T15:00:00Z"),
  eventDate: new Date("2026-09-27T13:00:00Z"),
  verifyUrl: "https://discipulado.example.org/verificar?codigo=VC-1A2B-3C4D-5E6F",
};
const text = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("buildCertificatePdf", () => {
  it("é um PDF bem formado: cabeçalho, fim, e a tabela xref aponta para cada objeto", () => {
    const pdf = text(buildCertificatePdf(data));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);

    const startxref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe("xref");
    const entries = [...pdf.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(7);
    entries.forEach((offset, i) => expect(pdf.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(/trailer\n<< \/Size 8 \/Root 1 0 R/.test(pdf)).toBe(true);
  });

  it("embute o logotipo: imagem JPEG íntegra, com o tamanho declarado, desenhada na página", () => {
    const bytes = Buffer.from(buildCertificatePdf(data));
    const pdf = bytes.toString("latin1");
    expect(pdf).toContain("/Subtype /Image");
    expect(pdf).toContain("/Filter /DCTDecode");
    expect(pdf).toContain("/XObject << /Im1 7 0 R >>");
    expect(pdf).toContain("/Im1 Do");

    const declared = Number(/\/Filter \/DCTDecode \/Length (\d+) >>\nstream\n/.exec(pdf)![1]);
    const start = pdf.indexOf("stream\n", pdf.indexOf("/Subtype /Image")) + "stream\n".length;
    const image = bytes.subarray(start, start + declared);
    expect([image[0], image[1]]).toEqual([0xff, 0xd8]); // começa como todo JPEG
    expect([image[image.length - 2], image[image.length - 1]]).toEqual([0xff, 0xd9]); // e termina como todo JPEG
    expect(bytes.subarray(start + declared, start + declared + "\nendstream".length).toString("latin1")).toBe("\nendstream");
  });

  it("o comprimento declarado do conteúdo é o real", () => {
    const pdf = text(buildCertificatePdf(data));
    const declared = Number(/<< \/Length (\d+) >>\nstream\n/.exec(pdf)![1]);
    const body = pdf.slice(pdf.indexOf("stream\n") + 7, pdf.indexOf("\nendstream"));
    expect(body.length).toBe(declared);
  });

  it("traz nome, ciclo, código e o endereço de verificação, com acentos em Latin-1", () => {
    const pdf = text(buildCertificatePdf(data));
    expect(pdf).toContain("(Jo\xe3o da Silva Concei\xe7\xe3o)");
    expect(pdf).toContain("(Fundamentos)");
    expect(pdf).toContain("(C\xf3digo de verifica\xe7\xe3o: VC-1A2B-3C4D-5E6F)");
    expect(pdf).toContain("verificar?codigo=VC-1A2B-3C4D-5E6F");
    expect(pdf).toContain("(CERTIFICADO)");
    expect(pdf).toContain("27 de setembro de 2026");
  });

  it("sem data de encerramento, não inventa uma", () => {
    const pdf = text(buildCertificatePdf({ ...data, eventDate: null }));
    expect(pdf).toContain("na trilha de discipulado.");
    expect(pdf).not.toContain("encerramento presencial em");
  });

  it("parênteses, barras e letras fora do alfabeto latino não quebram o arquivo", () => {
    const pdf = text(buildCertificatePdf({ ...data, holderName: "Ana (Aninha) \\ Łukasz 李" }));
    expect(pdf).toContain("(Ana \\(Aninha\\) \\\\ ?ukasz ?)");
    // Ainda fecha.
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("um nome muito longo encolhe para caber na página", () => {
    const long = "Maria das Dores Aparecida de Nossa Senhora dos Santos Albuquerque de Souza Nascimento Filho";
    const pdf = text(buildCertificatePdf({ ...data, holderName: long }));
    const size = Number(new RegExp(`/F1 ([0-9.]+) Tf [0-9.]+ 355 Td \\(${long}\\)`).exec(pdf)![1]);
    expect(size).toBeLessThan(32);
    expect(textWidth(long, size)).toBeLessThanOrEqual(682 + 0.5);
  });
});

describe("textWidth", () => {
  it("mede pela Helvetica: acentuada igual à base, e cresce com o corpo da letra", () => {
    expect(textWidth("a", 10)).toBeCloseTo(5.56, 2);
    expect(textWidth("ã", 10)).toBe(textWidth("a", 10));
    expect(textWidth("AB", 20)).toBeCloseTo(((667 + 667) * 20) / 1000, 5);
  });
});
