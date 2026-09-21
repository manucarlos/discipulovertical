import { describe, expect, it } from "vitest";
import { csvCell, csvDate, neutralizeFormula, toCsv } from "./csv";

describe("csv", () => {
  it("neutraliza células que a planilha leria como fórmula", () => {
    for (const evil of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(neutralizeFormula(evil).startsWith("'")).toBe(true);
    }
    expect(neutralizeFormula("Maria")).toBe("Maria");
    expect(neutralizeFormula("a=b")).toBe("a=b");
  });

  it("põe aspas quando precisa e dobra as aspas de dentro", () => {
    expect(csvCell('diz "oi"')).toBe('"diz ""oi"""');
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
    expect(csvCell("simples")).toBe("simples");
  });

  it("tipos: número, booleano, nulo", () => {
    expect(csvCell(42)).toBe("42");
    expect(csvCell(true)).toBe("sim");
    expect(csvCell(false)).toBe("não");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("monta o arquivo com BOM, ponto e vírgula e CRLF", () => {
    const csv = toCsv(["Nome", "E-mail"], [["Ana", "ana@x.org"], ["=cmd", 'a"b']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('Nome;E-mail\r\nAna;ana@x.org\r\n\'=cmd;"a""b"\r\n');
  });

  it("data em Brasília", () => {
    expect(csvDate("2026-09-20T15:30:00Z")).toBe("20/09/2026 12:30");
    expect(csvDate(null)).toBe("");
  });
});
