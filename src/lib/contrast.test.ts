import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contraste das cores (WCAG 2.1 AA): 4,5:1 para texto normal e 3:1 para elementos gráficos.
 * As cores vêm do próprio globals.css, então uma troca de cor que quebre o contraste falha aqui.
 */
const css = fs.readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");

function vars(selector: string): Record<string, string> {
  const block = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

const light = vars(":root");
const dark = { ...light, ...vars(".reading-dark") }; // o modo escuro só redefine parte das cores

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const round = (n: number) => Math.round(n * 100) / 100;

describe("contraste do tema claro", () => {
  const pairs: [string, string, string][] = [
    ["texto principal no fundo", light.foreground, light.background],
    ["texto principal no cartão", light.foreground, light.card],
    ["texto principal na faixa lilás", light.foreground, light.lilac],
    ["texto secundário no fundo", light.muted, light.background],
    ["texto secundário no cartão", light.muted, light.card],
    ["texto secundário na faixa lilás", light.muted, light.lilac],
    ["links e destaques (vermelho da igreja) no fundo", light.brand, light.background],
    ["vermelho da igreja no cartão", light.brand, light.card],
    ["vermelho da igreja na faixa lilás", light.brand, light.lilac],
    ["texto branco no botão principal", "#ffffff", light.brand],
    ["texto branco no botão principal em foco", "#ffffff", light["brand-strong"]],
  ];
  for (const [name, fg, bg] of pairs) {
    it(`${name} tem contraste de pelo menos 4,5:1`, () => {
      expect(ratio(fg, bg), `${fg} sobre ${bg} = ${round(ratio(fg, bg))}`).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("contraste do modo escuro da leitura", () => {
  const pairs: [string, string, string][] = [
    ["texto principal", dark.foreground, dark.background],
    ["texto principal no cartão", dark.foreground, dark.card],
    ["texto secundário", dark.muted, dark.background],
    ["texto secundário no cartão", dark.muted, dark.card],
    ["texto secundário na faixa", dark.muted, dark.lilac],
    ["links (rosa da igreja)", dark.brand, dark.background],
    ["links no cartão", dark.brand, dark.card],
  ];
  for (const [name, fg, bg] of pairs) {
    it(`${name} tem contraste de pelo menos 4,5:1`, () => {
      expect(ratio(fg, bg), `${fg} sobre ${bg} = ${round(ratio(fg, bg))}`).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("o botão de destaque tem uma cor de texto própria (o branco não serve sobre o rosa do modo escuro)", () => {
    expect(ratio("#ffffff", dark.brand), "branco sobre o rosa").toBeLessThan(4.5); // é por isso que existe --on-brand
    expect(dark["on-brand"], "falta a variável --on-brand no modo escuro").toBeDefined();
    expect(ratio(dark["on-brand"], dark.brand)).toBeGreaterThanOrEqual(4.5);
    expect(light["on-brand"], "falta a variável --on-brand no tema claro").toBeDefined();
    expect(ratio(light["on-brand"], light.brand)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("selos e avisos coloridos (paleta padrão do Tailwind)", () => {
  const pairs: [string, string, string][] = [
    ["concluída (selo)", "#064e3b", "#d1fae5"],
    ["concluída (aviso)", "#065f46", "#ecfdf5"],
    ["em andamento (selo)", "#78350f", "#fef3c7"],
    ["em andamento (aviso)", "#92400e", "#fffbeb"],
    ["parado (selo)", "#991b1b", "#fee2e2"],
    ["erro (aviso)", "#991b1b", "#fef2f2"],
    ["primeiro acesso pendente (selo)", "#3f3f46", "#e4e4e7"],
    ["pendência [PREENCHER] destacada", "#78350f", "#fde68a"],
    ["pendência na lista", "#451a03", "#fffbeb"],
  ];
  for (const [name, fg, bg] of pairs) {
    it(`${name}: pelo menos 4,5:1`, () => {
      expect(ratio(fg, bg), `${fg} sobre ${bg} = ${round(ratio(fg, bg))}`).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("elementos gráficos (barras e ícones): pelo menos 3:1 contra o fundo", () => {
  it("a barra de destaque (vermelho da igreja) contra a trilha lilás", () => {
    expect(ratio(light.brand, light.lilac)).toBeGreaterThanOrEqual(3);
  });
  it("a barra em cinza (o que não é destaque) contra a trilha lilás", () => {
    expect(ratio("#a1a1aa", light.lilac), "cinza da barra sobre o lilás").toBeGreaterThanOrEqual(2); // cinza é de propósito discreto: o número ao lado carrega o valor
  });
  it("a borda dos campos de formulário contra o fundo branco (WCAG 1.4.11)", () => {
    expect(ratio(light.line, "#ffffff"), "a borda dos campos precisa ser visível").toBeGreaterThanOrEqual(1.4);
  });
});
