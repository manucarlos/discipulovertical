import { describe, expect, it } from "vitest";
import { PALETTE, READING_DARK } from "./brand";
import { checkPalette, failures } from "./brand-contrast";
import { derivePalette } from "./brand-derive";
import { HEX_RE, contrast, hexToHsl, hexToRgb, hslToHex, luminance, mix, normalizeHex, rgbToHex } from "./color";

describe("color", () => {
  it("normaliza hexadecimais e recusa lixo", () => {
    expect(normalizeHex("#C14602")).toBe("#c14602");
    expect(normalizeHex("c14602")).toBe("#c14602");
    expect(normalizeHex(" #c40 ")).toBe("#cc4400");
    for (const bad of ["", "#12345", "#gggggg", "rgb(1,2,3)", "#1234567", "vermelho", "#c14602; background:url(x)"]) expect(normalizeHex(bad), bad).toBeNull();
  });

  it("converte entre hexadecimal, RGB e HSL sem perder a cor", () => {
    expect(hexToRgb("#c14602")).toEqual([193, 70, 2]);
    expect(rgbToHex([193, 70, 2])).toBe("#c14602");
    for (const hex of ["#c14602", "#171717", "#ffffff", "#000000", "#1d4ed8", "#16a34a"]) {
      const back = hslToHex(hexToHsl(hex));
      // Ida e volta por HSL pode variar um nível de cor por arredondamento.
      const [a, b] = [hexToRgb(hex), hexToRgb(back)];
      a.forEach((c, i) => expect(Math.abs(c - b[i]), hex).toBeLessThanOrEqual(1));
    }
  });

  it("calcula o contraste como a WCAG (branco sobre preto = 21)", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("mistura duas cores", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("derivePalette", () => {
  it("com as cores do logotipo, mantém o laranja exato e gera uma paleta que passa em tudo", () => {
    const r = derivePalette({ brand: "#c14602", foreground: "#171717", background: "#fbf9f7" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.adjustedBrand).toBeNull();
    expect(r.light.brand).toBe("#c14602");
    expect(failures(r.checks)).toEqual([]);
    expect(Object.keys(r.light).sort()).toEqual(Object.keys(PALETTE).sort());
    expect(Object.keys(r.readingDark).sort()).toEqual(Object.keys(READING_DARK).sort());
    for (const color of [...Object.values(r.light), ...Object.values(r.readingDark)]) expect(color).toMatch(HEX_RE);
  });

  it("escurece uma cor clara demais para servir de botão e de link, e avisa", () => {
    const r = derivePalette({ brand: "#ffd400", foreground: "#171717", background: "#ffffff" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.adjustedBrand).not.toBeNull();
    expect(luminance(r.light.brand)).toBeLessThan(luminance("#ffd400"));
    expect(contrast(r.light.brand, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(failures(r.checks)).toEqual([]);
  });

  it("aceita entradas sem # e em maiúsculas, e devolve tudo normalizado", () => {
    const r = derivePalette({ brand: "1D4ED8", foreground: "111111", background: "FAFAFA" });
    expect(r.ok && r.inputs).toEqual({ brand: "#1d4ed8", foreground: "#111111", background: "#fafafa" });
  });

  it("recusa cores inválidas, fundo escuro e texto que não contrasta com o fundo", () => {
    const bad = (i: { brand: string; foreground: string; background: string }) => {
      const r = derivePalette(i);
      return r.ok ? [] : r.errors;
    };
    expect(bad({ brand: "azul", foreground: "#171717", background: "#ffffff" }).join(" ")).toContain("cor da igreja");
    expect(bad({ brand: "#c14602", foreground: "x", background: "#ffffff" }).join(" ")).toContain("cor do texto");
    expect(bad({ brand: "#c14602", foreground: "#171717", background: "#000000" }).join(" ")).toContain("fundo precisa ser uma cor clara");
    expect(bad({ brand: "#c14602", foreground: "#bbbbbb", background: "#ffffff" }).join(" ")).toContain("contrastar mais");
    expect(bad({ brand: "#c14602", foreground: "#171717", background: "#c14602; x" }).length).toBeGreaterThan(0);
  });

  it("qualquer cor da igreja, sobre fundos e textos válidos, gera uma paleta legível (300 sorteios)", () => {
    let seed = 20260921;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const anyHex = () => rgbHex(rand() * 256, rand() * 256, rand() * 256);
    const rgbHex = (r: number, g: number, b: number) => `#${[r, g, b].map((c) => Math.floor(c).toString(16).padStart(2, "0")).join("")}`;
    for (let i = 0; i < 300; i++) {
      const inputs = {
        brand: anyHex(),
        foreground: hslToHex([rand() * 360, rand() * 0.6, rand() * 0.2]), // escuro
        background: hslToHex([rand() * 360, rand() * 0.5, 0.94 + rand() * 0.06]), // claro
      };
      const r = derivePalette(inputs);
      expect(r.ok, JSON.stringify(inputs)).toBe(true);
      if (r.ok) expect(failures(checkPalette(r.light, r.readingDark)).map((f) => `${f.name} ${f.ratio.toFixed(2)}`), JSON.stringify(inputs)).toEqual([]);
    }
  });

  it("o padrão do projeto passa em todas as combinações", () => {
    expect(failures(checkPalette(PALETTE, READING_DARK))).toEqual([]);
  });
});
