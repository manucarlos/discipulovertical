import sharp, { type Metadata } from "sharp";
import type { AssetKey } from "./brand-store";

/**
 * Processa o logotipo enviado no painel (Administração > Marca) e gera todas as imagens da marca: logotipo
 * transparente do site, ícones do app (comum e "maskable"), ícone do iPhone, ícone da aba e o logotipo em JPEG do
 * certificado. É o mesmo código que `npm run icons` usa para gerar as imagens padrão do projeto.
 *
 * Só aceita PNG e JPG (SVG pode carregar código). Toda imagem é decodificada e recodificada aqui: o que fica
 * guardado nunca é o arquivo enviado, e sim o resultado.
 */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MIN_SIDE = 128;
const MAX_SIDE = 4000;
const MAX_PIXELS = 24_000_000;

export interface BrandImage {
  key: AssetKey;
  content_type: "image/png" | "image/jpeg";
  /** base64 */
  data: string;
  width: number;
  height: number;
}

/** Erro que pode ser mostrado à pessoa (mensagem em português). */
export class ImageError extends Error {}

interface Rgba {
  data: Buffer;
  width: number;
  height: number;
}

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/** Confere o arquivo (tamanho, formato, dimensões) e devolve os pixels em RGBA, já na orientação certa. */
async function decode(input: Buffer, what: string): Promise<Rgba> {
  if (input.length === 0) throw new ImageError(`${what}: o arquivo está vazio.`);
  if (input.length > MAX_UPLOAD_BYTES) throw new ImageError(`${what}: o arquivo passa de 2 MB.`);
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new ImageError(`${what}: não foi possível ler a imagem. Envie um arquivo PNG ou JPG.`);
  }
  if (meta.format !== "png" && meta.format !== "jpeg") throw new ImageError(`${what}: envie um arquivo PNG ou JPG.`);
  if ((meta.pages ?? 1) > 1) throw new ImageError(`${what}: imagens animadas não são aceitas.`);
  const [w, h] = [meta.width ?? 0, meta.height ?? 0];
  if (w < MIN_SIDE || h < MIN_SIDE) throw new ImageError(`${what}: a imagem é pequena demais (mínimo ${MIN_SIDE} px de cada lado).`);
  if (w > MAX_SIDE || h > MAX_SIDE) throw new ImageError(`${what}: a imagem é grande demais (máximo ${MAX_SIDE} px de cada lado).`);
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_PIXELS }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new ImageError(`${what}: não foi possível ler a imagem. Envie um arquivo PNG ou JPG.`);
  }
}

/**
 * Deixa só o desenho: se a imagem tem fundo transparente, usa o que há; se tem fundo branco, torna o branco
 * transparente (preservando as bordas suavizadas); se tem outro fundo, mantém como está. Corta as margens vazias.
 */
function isolate(img: Rgba): Rgba {
  const { data, width, height } = img;
  const px = width * height;

  let transparent = false;
  for (let i = 0; i < px; i++) {
    if (data[i * 4 + 3] < 250) {
      transparent = true;
      break;
    }
  }

  // O fundo é branco se os quatro cantos são (quase) brancos.
  const corner = (x0: number, y0: number) => {
    let sum = 0;
    let n = 0;
    for (let y = y0; y < y0 + 5; y++) for (let x = x0; x < x0 + 5; x++) {
      const i = (y * width + x) * 4;
      sum += Math.min(data[i], data[i + 1], data[i + 2]);
      n++;
    }
    return sum / n;
  };
  const whiteBackground = [corner(0, 0), corner(width - 5, 0), corner(0, height - 5), corner(width - 5, height - 5)].every((c) => c > 240);

  const out = Buffer.from(data);
  if (!transparent && whiteBackground) {
    // Tinta mais escura do desenho (percentil 0,5% dos pixels não brancos): daqui para baixo a tinta é 100% opaca.
    const hist = new Array<number>(256).fill(0);
    let dark = 0;
    for (let i = 0; i < px; i++) {
      const m = Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      if (m < 200) {
        hist[m]++;
        dark++;
      }
    }
    let ink = 0;
    for (let acc = 0, v = 0; v < 200; v++) {
      acc += hist[v];
      if (acc >= dark * 0.005) {
        ink = Math.min(v, 120);
        break;
      }
    }
    for (let i = 0; i < px; i++) {
      const [r, g, b] = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
      const alpha = Math.min(1, Math.max(0, (255 - Math.min(r, g, b)) / (255 - ink)));
      const un = (c: number) => (alpha === 0 ? 0 : Math.min(255, Math.max(0, Math.round((c - 255 * (1 - alpha)) / alpha))));
      out[i * 4] = un(r);
      out[i * 4 + 1] = un(g);
      out[i * 4 + 2] = un(b);
      out[i * 4 + 3] = Math.round(alpha * 255);
    }
  }

  // Caixa do desenho: pixels com alguma opacidade (imagem opaca de outra cor de fundo: a imagem toda).
  let [minX, minY, maxX, maxY] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (out[(y * width + x) * 4 + 3] > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new ImageError("A imagem parece estar em branco.");
  const pad = Math.max(8, Math.round(Math.max(maxX - minX, maxY - minY) * 0.02));
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const cw = Math.min(width, maxX + pad + 1) - left;
  const ch = Math.min(height, maxY + pad + 1) - top;
  const cropped = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.copy(cropped, y * cw * 4, ((top + y) * width + left) * 4, ((top + y) * width + left + cw) * 4);
  return { data: cropped, width: cw, height: ch };
}

const raw = (img: Rgba) => sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } });

async function toImage(key: AssetKey, buffer: Buffer, contentType: BrandImage["content_type"]): Promise<BrandImage> {
  const meta = await sharp(buffer).metadata();
  return { key, content_type: contentType, data: buffer.toString("base64"), width: meta.width ?? 1, height: meta.height ?? 1 };
}

/** O desenho centralizado num quadrado branco. `share` = quanto do quadrado o desenho ocupa (no lado maior). */
async function square(img: Rgba, size: number, share: number): Promise<Buffer> {
  const box = Math.round(size * share);
  const scaled = await raw(img).resize({ width: box, height: box, fit: "inside" }).png().toBuffer();
  const meta = await sharp(scaled).metadata();
  return sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: scaled, left: Math.round((size - (meta.width ?? box)) / 2), top: Math.round((size - (meta.height ?? box)) / 2) }])
    .flatten({ background: WHITE })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Gera as imagens da marca a partir do logotipo. `symbol` (opcional) é um desenho pequeno e simples, usado no
 * ícone da aba do navegador (16 a 32 px), onde o logotipo inteiro não se lê; sem ele, o ícone da aba usa o logotipo.
 */
export async function processLogo(logo: Buffer, options: { symbol?: Buffer } = {}): Promise<BrandImage[]> {
  const mark = isolate(await decode(logo, "Logotipo"));
  const symbol = options.symbol ? isolate(await decode(options.symbol, "Símbolo")) : null;

  const site = await raw(mark)
    .resize({ width: 560, height: 560, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 })
    .toBuffer();
  const certificate = await raw(mark)
    .flatten({ background: WHITE })
    .resize({ width: 480, withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  return Promise.all([
    toImage("logo", site, "image/png"),
    toImage("icon-192", await square(mark, 192, 0.86), "image/png"),
    toImage("icon-512", await square(mark, 512, 0.86), "image/png"),
    toImage("icon-maskable", await square(mark, 512, 0.62), "image/png"), // cabe no círculo de segurança do sistema
    toImage("icon-apple", await square(mark, 180, 0.86), "image/png"),
    toImage("icon-tab", await square(symbol ?? mark, 64, symbol ? 0.86 : 0.96), "image/png"),
    toImage("logo-jpeg", certificate, "image/jpeg"),
  ]);
}
