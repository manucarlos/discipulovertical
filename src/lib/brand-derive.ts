import type { Palette } from "./brand";
import { checkPalette, failures, type PairCheck } from "./brand-contrast";
import { contrast, hexToHsl, hslToHex, luminance, mix, normalizeHex, withLightness } from "./color";

/**
 * A tela de Marca pede só 3 cores. Daqui sai a paleta completa (as nove cores do brand.ts, nos dois temas), com o
 * contraste de leitura garantido: se a cor da igreja escolhida for clara demais para servir de botão e de link, ela é
 * escurecida o mínimo necessário, e a tela avisa.
 */
export interface BrandInputs {
  /** Cor da igreja: botões, links, destaques. */
  brand: string;
  /** Cor do texto principal (escura). */
  foreground: string;
  /** Cor de fundo das telas (clara). */
  background: string;
}

export type DeriveResult =
  | {
      ok: true;
      inputs: BrandInputs;
      light: Palette;
      readingDark: Palette;
      /** A cor da igreja depois do ajuste, se foi preciso escurecê-la para ficar legível; senão, nulo. */
      adjustedBrand: string | null;
      checks: PairCheck[];
    }
  | { ok: false; errors: string[] };

const WHITE = "#ffffff";
const MIN_TEXT = 4.5;

export function derivePalette(raw: BrandInputs): DeriveResult {
  const errors: string[] = [];
  const brand = normalizeHex(raw.brand);
  const foreground = normalizeHex(raw.foreground);
  const background = normalizeHex(raw.background);
  if (!brand) errors.push("A cor da igreja não é uma cor válida (use o formato #1d4ed8).");
  if (!foreground) errors.push("A cor do texto não é uma cor válida (use o formato #111111).");
  if (!background) errors.push("A cor do fundo não é uma cor válida (use o formato #fafafa).");
  if (!brand || !foreground || !background) return { ok: false, errors };

  if (luminance(background) < 0.8) errors.push("O fundo precisa ser uma cor clara (o modo escuro da leitura é gerado à parte).");
  else if (contrast(foreground, background) < 7) errors.push("O texto precisa contrastar mais com o fundo: escolha uma cor de texto mais escura.");
  if (errors.length > 0) return { ok: false, errors };

  const light = deriveLight(brand, foreground, background);
  const readingDark = deriveDark(light.brand);
  const checks = checkPalette(light, readingDark);
  const bad = failures(checks);
  if (bad.length > 0) {
    return { ok: false, errors: [`Não foi possível gerar uma paleta legível com essas cores (${bad.map((b) => b.name).join("; ")}).`] };
  }
  return {
    ok: true,
    inputs: { brand, foreground, background },
    light,
    readingDark,
    adjustedBrand: light.brand === brand ? null : light.brand,
    checks,
  };
}

/** Tema claro. A cor da igreja é escurecida (passo de 1%) até servir de texto e de botão em todas as superfícies. */
function deriveLight(brand: string, foreground: string, background: string): Palette {
  const card = WHITE;
  const [, , l0] = hexToHsl(brand);

  let chosen = brand;
  let tint = mix(background, brand, 0.02);
  for (let l = l0; l >= 0; l -= 0.01) {
    const candidate = l === l0 ? brand : withLightness(brand, Math.max(l, 0));
    // A faixa suave leva um toque da cor da igreja: o quanto der sem tirar a leitura da própria cor da igreja.
    const weight = [0.05, 0.04, 0.03, 0.02, 0].find((w) => contrast(candidate, mix(background, candidate, w)) >= MIN_TEXT);
    if (
      weight !== undefined &&
      contrast(candidate, background) >= MIN_TEXT &&
      contrast(candidate, card) >= MIN_TEXT &&
      contrast(WHITE, candidate) >= MIN_TEXT
    ) {
      chosen = candidate;
      tint = mix(background, candidate, weight);
      break;
    }
  }

  const [h, s, l] = hexToHsl(chosen);
  const brandStrong = hslToHex([h, s, l * 0.78]);

  // Texto secundário: o mais claro possível (o mais "apagado") que ainda passa nas três superfícies.
  const muted =
    [0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1, 0.05, 0]
      .map((w) => mix(foreground, background, w))
      .find((c) => contrast(c, background) >= MIN_TEXT && contrast(c, tint) >= MIN_TEXT && contrast(c, card) >= MIN_TEXT) ?? foreground;

  // Bordas: do fundo em direção ao texto, até serem visíveis contra o branco (campos de formulário).
  let line = mix(background, foreground, 0.12);
  for (let w = 0.12; w <= 0.5 && contrast(line, WHITE) < 1.45; w += 0.02) line = mix(background, foreground, w);

  return { background, foreground, brand: chosen, brandStrong, onBrand: WHITE, tint, muted, card, line };
}

/** Modo escuro da leitura: fundos quase pretos com o matiz da cor da igreja, e a cor da igreja clareada até ler bem. */
function deriveDark(brand: string): Palette {
  const [h, s] = hexToHsl(brand);
  const surface = (l: number, satCap: number) => hslToHex([h, Math.min(s, satCap), l]);

  const background = surface(0.07, 0.18);
  const card = surface(0.1, 0.18);
  const tint = surface(0.15, 0.18);
  const line = surface(0.24, 0.15);
  const foreground = surface(0.92, 0.15);

  let muted = surface(0.72, 0.1);
  for (let l = 0.72; l <= 0.95 && contrast(muted, tint) < MIN_TEXT; l += 0.01) muted = surface(l, 0.1);

  let bright = withLightness(brand, Math.max(hexToHsl(brand)[2], 0.55));
  for (let l = hexToHsl(bright)[2]; l <= 0.97; l += 0.01) {
    bright = withLightness(brand, l);
    if (contrast(bright, background) >= MIN_TEXT && contrast(bright, card) >= MIN_TEXT && contrast(bright, tint) >= MIN_TEXT) break;
  }
  const [bh, bs, bl] = hexToHsl(bright);
  const brandStrong = hslToHex([bh, bs, Math.min(bl + 0.08, 0.97)]);

  return { background, foreground, brand: bright, brandStrong, onBrand: background, tint, muted, card, line };
}
