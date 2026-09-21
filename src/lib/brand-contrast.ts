import type { Palette } from "./brand";
import { contrast } from "./color";

/** Uma combinação de cores conferida contra o padrão de acessibilidade (WCAG 2.1 AA). */
export interface PairCheck {
  name: string;
  fg: string;
  bg: string;
  /** Contraste mínimo exigido (4,5 para texto, 3 para elementos gráficos...). */
  min: number;
  ratio: number;
  ok: boolean;
}

const check = (name: string, fg: string, bg: string, min: number): PairCheck => {
  const ratio = contrast(fg, bg);
  return { name, fg, bg, min, ratio, ok: ratio >= min };
};

/**
 * Todas as combinações de cor que o site usa, nos dois temas. É a mesma lista que os testes de contraste conferem e que
 * a tela de Marca mostra: uma paleta só é aceita se TODAS passarem.
 */
export function checkPalette(light: Palette, dark: Palette): PairCheck[] {
  return [
    check("texto principal no fundo", light.foreground, light.background, 4.5),
    check("texto principal no cartão", light.foreground, light.card, 4.5),
    check("texto principal na faixa suave", light.foreground, light.tint, 4.5),
    check("texto secundário no fundo", light.muted, light.background, 4.5),
    check("texto secundário no cartão", light.muted, light.card, 4.5),
    check("texto secundário na faixa suave", light.muted, light.tint, 4.5),
    check("links e destaques (cor da igreja) no fundo", light.brand, light.background, 4.5),
    check("cor da igreja no cartão", light.brand, light.card, 4.5),
    check("cor da igreja na faixa suave", light.brand, light.tint, 4.5),
    check("texto sobre a cor da igreja (botão principal)", light.onBrand, light.brand, 4.5),
    check("texto sobre a cor da igreja em foco (botão)", light.onBrand, light.brandStrong, 4.5),
    check("barra de progresso (cor da igreja) na trilha suave", light.brand, light.tint, 3),
    check("borda dos campos de formulário no fundo branco", light.line, "#ffffff", 1.4),
    check("anel de foco (cor da igreja) no fundo", light.brand, light.background, 3),
    check("anel de foco (cor da igreja) no cartão", light.brand, light.card, 3),
    check("modo escuro: texto principal", dark.foreground, dark.background, 4.5),
    check("modo escuro: texto principal no cartão", dark.foreground, dark.card, 4.5),
    check("modo escuro: texto secundário", dark.muted, dark.background, 4.5),
    check("modo escuro: texto secundário no cartão", dark.muted, dark.card, 4.5),
    check("modo escuro: texto secundário na faixa", dark.muted, dark.tint, 4.5),
    check("modo escuro: links (cor da igreja, clara)", dark.brand, dark.background, 4.5),
    check("modo escuro: links no cartão", dark.brand, dark.card, 4.5),
    check("modo escuro: texto sobre a cor da igreja (botão)", dark.onBrand, dark.brand, 4.5),
    check("modo escuro: texto sobre a cor da igreja em foco (botão)", dark.onBrand, dark.brandStrong, 4.5),
  ];
}

/** As combinações que falharam. */
export const failures = (checks: PairCheck[]) => checks.filter((c) => !c.ok);
