/** Cores em hexadecimal (#rrggbb): conversões, mistura e contraste (WCAG 2.1). Sem dependências. */

export const HEX_RE = /^#[0-9a-f]{6}$/;

export type RGB = [number, number, number];
export type HSL = [number, number, number]; // matiz 0-360, saturação 0-1, luminosidade 0-1

/** Aceita "#1d4ed8", "1D4ED8" e "#c40" e devolve "#rrggbb" em minúsculas; nulo se não for uma cor. */
export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw)) return `#${raw.split("").map((c) => c + c).join("")}`;
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  return null;
}

export function hexToRgb(hex: string): RGB {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

const clamp = (n: number, lo = 0, hi = 255) => Math.min(hi, Math.max(lo, n));

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((c) => Math.round(clamp(c)).toString(16).padStart(2, "0")).join("")}`;
}

/** Luminância relativa (0 = preto, 1 = branco), como define a WCAG. */
export function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** Razão de contraste entre duas cores (1 a 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Mistura duas cores: `weightOfB` = 0 devolve `a`; 1 devolve `b`. */
export function mix(a: string, b: string, weightOfB: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return rgbToHex(ra.map((c, i) => c * (1 - weightOfB) + rb[i] * weightOfB) as RGB);
}

export function hexToHsl(hex: string): HSL {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToHex([h, s, l]: HSL): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const light = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

/** A mesma cor com outra luminosidade (HSL). */
export function withLightness(hex: string, lightness: number): string {
  const [h, s] = hexToHsl(hex);
  return hslToHex([h, s, lightness]);
}
