import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BROWSER, PALETTE, READING_DARK, READING_DARK_CSS, ROOT_STYLE, cssVariables, pdfColor } from "./brand";

const SRC = path.resolve(__dirname, "..");
const HEX = /^#[0-9a-f]{6}$/;

describe("paleta da marca (src/lib/brand.ts)", () => {
  it("toda cor é um hexadecimal de 6 dígitos em minúsculas, nos dois temas", () => {
    for (const [tema, palette] of [["claro", PALETTE], ["escuro", READING_DARK]] as const) {
      for (const [papel, cor] of Object.entries(palette)) expect(cor, `${tema}.${papel}`).toMatch(HEX);
    }
    expect(BROWSER.themeColor).toMatch(HEX);
    expect(BROWSER.splashBackground).toMatch(HEX);
  });

  it("os dois temas definem os mesmos papéis (nenhum fica sem cor)", () => {
    expect(Object.keys(READING_DARK).sort()).toEqual(Object.keys(PALETTE).sort());
  });

  it("vira variáveis CSS com os nomes que o Tailwind espera", () => {
    expect(Object.keys(ROOT_STYLE).sort()).toEqual(
      ["--background", "--brand", "--brand-strong", "--card", "--foreground", "--line", "--muted", "--on-brand", "--tint"].sort(),
    );
    expect(ROOT_STYLE["--brand"]).toBe(PALETTE.brand);
    expect(cssVariables(READING_DARK)["--on-brand"]).toBe(READING_DARK.onBrand);
  });

  it("a regra do modo escuro da leitura traz todas as variáveis, dentro de .reading-dark", () => {
    expect(READING_DARK_CSS.startsWith(".reading-dark{")).toBe(true);
    for (const [nome, valor] of Object.entries(cssVariables(READING_DARK))) expect(READING_DARK_CSS).toContain(`${nome}:${valor}`);
  });

  it("a barra do navegador usa a cor da igreja", () => {
    expect(BROWSER.themeColor).toBe(PALETTE.brand);
  });

  it("converte cores para o formato do PDF", () => {
    expect(pdfColor("#000000")).toBe("0.00 0.00 0.00");
    expect(pdfColor("#ffffff")).toBe("1.00 1.00 1.00");
    expect(pdfColor("#c14602")).toBe("0.76 0.27 0.01");
  });
});

describe("a paleta tem um lugar só", () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? walk(full) : [full];
    });
  const sources = walk(SRC).filter((f) => /\.(ts|tsx|css)$/.test(f) && !/\.test\./.test(f) && !f.endsWith(`${path.sep}brand.ts`));

  it("nenhum outro arquivo escreve à mão uma cor da paleta (todos leem do brand.ts)", () => {
    const colors = new Set([...Object.values(PALETTE), ...Object.values(READING_DARK)].filter((c) => c !== "#ffffff"));
    for (const file of sources) {
      const text = fs.readFileSync(file, "utf8").toLowerCase();
      for (const color of colors) expect(text, `${path.relative(SRC, file)} repete ${color}: use src/lib/brand.ts`).not.toContain(color);
    }
  });

  it("o globals.css não define as variáveis da marca (elas vêm do layout)", () => {
    const css = fs.readFileSync(path.join(SRC, "app/globals.css"), "utf8");
    expect(css).not.toMatch(/^\s*--(background|foreground|brand|brand-strong|on-brand|tint|muted|card|line)\s*:/m);
  });

  it("o manifesto do app é dinâmico: sem isso o Next o gera uma vez no build e a marca do painel nunca chega ao app instalado", () => {
    const manifest = fs.readFileSync(path.join(SRC, "app/manifest.ts"), "utf8");
    expect(manifest).toMatch(/export const dynamic = "force-dynamic"/);
    expect(manifest).toContain("loadIdentity()");
  });

  it("o layout grava a paleta da igreja (personalizada ou padrão) e o modo escuro da leitura na página", () => {
    const layout = fs.readFileSync(path.join(SRC, "app/layout.tsx"), "utf8");
    expect(layout).toContain("cssVariables(identity.palette)");
    expect(layout).toContain("readingDarkCss(identity.readingDark)");
    expect(layout).toContain("themeColor: identity.palette.brand");
  });
});
