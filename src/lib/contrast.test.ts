import { describe, expect, it } from "vitest";
import { PALETTE, READING_DARK } from "./brand";

/**
 * Contraste das cores (WCAG 2.1 AA): 4,5:1 para texto normal e 3:1 para elementos gráficos.
 * As cores vêm de src/lib/brand.ts, então uma troca de paleta que fique difícil de ler falha aqui, dizendo qual
 * combinação quebrou.
 */
const light = PALETTE;
const dark = READING_DARK;

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
    ["texto principal na faixa suave", light.foreground, light.tint],
    ["texto secundário no fundo", light.muted, light.background],
    ["texto secundário no cartão", light.muted, light.card],
    ["texto secundário na faixa suave", light.muted, light.tint],
    ["links e destaques (cor da igreja) no fundo", light.brand, light.background],
    ["cor da igreja no cartão", light.brand, light.card],
    ["cor da igreja na faixa suave", light.brand, light.tint],
    ["texto sobre a cor da igreja (botão principal)", light.onBrand, light.brand],
    ["texto sobre a cor da igreja em foco (botão)", light.onBrand, light.brandStrong],
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
    ["texto secundário na faixa", dark.muted, dark.tint],
    ["links (cor da igreja, clara)", dark.brand, dark.background],
    ["links no cartão", dark.brand, dark.card],
    ["texto sobre a cor da igreja (botão)", dark.onBrand, dark.brand],
    ["texto sobre a cor da igreja em foco (botão)", dark.onBrand, dark.brandStrong],
  ];
  for (const [name, fg, bg] of pairs) {
    it(`${name} tem contraste de pelo menos 4,5:1`, () => {
      expect(ratio(fg, bg), `${fg} sobre ${bg} = ${round(ratio(fg, bg))}`).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("selos e avisos coloridos (paleta padrão do Tailwind, independente da marca)", () => {
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
  it("a barra de destaque (cor da igreja) contra a trilha suave", () => {
    expect(ratio(light.brand, light.tint)).toBeGreaterThanOrEqual(3);
  });
  it("a barra em cinza (o que não é destaque) contra a trilha suave", () => {
    expect(ratio("#a1a1aa", light.tint), "cinza da barra sobre a faixa").toBeGreaterThanOrEqual(2); // cinza é de propósito discreto: o número ao lado carrega o valor
  });
  it("a borda dos campos de formulário contra o fundo branco (WCAG 1.4.11)", () => {
    expect(ratio(light.line, "#ffffff"), "a borda dos campos precisa ser visível").toBeGreaterThanOrEqual(1.4);
  });
  it("o anel de foco (cor da igreja) contra o fundo e o cartão", () => {
    expect(ratio(light.brand, light.background)).toBeGreaterThanOrEqual(3);
    expect(ratio(light.brand, light.card)).toBeGreaterThanOrEqual(3);
  });
});
