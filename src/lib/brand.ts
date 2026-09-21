/**
 * PALETA DA MARCA: o ÚNICO lugar onde as cores do site são definidas.
 *
 * Para trocar as cores, edite os valores abaixo e rode `npm test`: se alguma combinação ficar difícil de ler
 * (contraste abaixo do padrão de acessibilidade WCAG AA), os testes de contraste avisam qual. Nada mais precisa
 * mudar: as telas, o tema do navegador, o manifesto do app e o certificado em PDF leem tudo daqui.
 * Guia completo: docs/MARCA.md.
 *
 * As cores atuais vêm do logotipo: laranja #C14602 e preto #171717. Os ícones e o logotipo em si são imagens
 * (ver `npm run icons`) e não dependem desta paleta.
 */

/** As nove cores de que o site precisa. Cada uma tem um PAPEL (não um nome de cor), para a troca ser segura. */
export interface Palette {
  /** Fundo das telas. */
  background: string;
  /** Texto principal. */
  foreground: string;
  /** Cor da igreja: botões, links, destaques e foco. Precisa ler bem como texto sobre o fundo, o cartão e a faixa. */
  brand: string;
  /** Versão mais escura da cor da igreja (botão ao passar o mouse). */
  brandStrong: string;
  /** Texto SOBRE a cor da igreja (dentro dos botões). */
  onBrand: string;
  /** Faixa suave de destaque (caixas de aviso, cabeçalhos de tabela, trilhas de progresso). */
  tint: string;
  /** Texto secundário. */
  muted: string;
  /** Fundo dos cartões. */
  card: string;
  /** Bordas e divisórias. */
  line: string;
}

/** Tema normal (claro). */
export const PALETTE: Palette = {
  background: "#fbf9f7",
  foreground: "#171717", // o preto do logotipo
  brand: "#c14602", // o laranja do logotipo
  brandStrong: "#9b3902",
  onBrand: "#ffffff",
  tint: "#f9f1ea",
  muted: "#5d5751",
  card: "#ffffff",
  line: "#d8cfc6",
};

/** Modo escuro da leitura (só dentro da área de leitura da lição). */
export const READING_DARK: Palette = {
  background: "#151210",
  foreground: "#efe9e4",
  brand: "#f08a4b", // laranja mais claro: o escuro do tema claro não se lê sobre fundo escuro
  brandStrong: "#f6a674",
  onBrand: "#151210", // o branco não serve sobre o laranja claro
  tint: "#2a2521",
  muted: "#b9b0a7",
  card: "#1f1b18",
  line: "#3b352f",
};

/** Cores usadas fora das telas (barra do navegador e abertura do app instalado). */
export const BROWSER = {
  /** Cor da barra do navegador no celular. */
  themeColor: PALETTE.brand,
  /** Fundo da tela de abertura do app instalado: combina com os ícones, que têm fundo branco. */
  splashBackground: "#ffffff",
};

const CSS_NAMES: Record<keyof Palette, string> = {
  background: "--background",
  foreground: "--foreground",
  brand: "--brand",
  brandStrong: "--brand-strong",
  onBrand: "--on-brand",
  tint: "--tint",
  muted: "--muted",
  card: "--card",
  line: "--line",
};

/** A paleta como variáveis CSS (`--brand: #c14602` etc.). */
export function cssVariables(palette: Palette): Record<string, string> {
  return Object.fromEntries((Object.keys(CSS_NAMES) as (keyof Palette)[]).map((key) => [CSS_NAMES[key], palette[key]]));
}

/** As variáveis CSS do tema normal, para o atributo `style` da página. */
export const ROOT_STYLE = cssVariables(PALETTE);

/**
 * A regra CSS do modo escuro da leitura. Só entra no CSS uma paleta válida (isPalette), então um valor estranho
 * vindo do banco nunca vira código na página.
 */
export function readingDarkCss(palette: Palette): string {
  if (!isPalette(palette)) palette = READING_DARK;
  return `.reading-dark{${Object.entries(cssVariables(palette))
    .map(([name, value]) => `${name}:${value}`)
    .join(";")}}`;
}

/** A regra do modo escuro da leitura com a paleta padrão do código. */
export const READING_DARK_CSS = readingDarkCss(READING_DARK);

/** É mesmo uma paleta: os nove papéis, cada um um "#rrggbb" em minúsculas (e nada mais)? */
export function isPalette(value: unknown): value is Palette {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(CSS_NAMES);
  const entries = Object.entries(value);
  return entries.length === keys.length && keys.every((k) => typeof (value as Record<string, unknown>)[k] === "string" && /^#[0-9a-f]{6}$/.test((value as Record<string, string>)[k]));
}

/** Converte "#c14602" para o formato de cor do PDF ("0.76 0.27 0.01"). */
export function pdfColor(hex: string): string {
  const channel = (i: number) => (parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255).toFixed(2);
  return `${channel(0)} ${channel(1)} ${channel(2)}`;
}
