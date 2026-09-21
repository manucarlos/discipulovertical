// Gera as imagens da marca a partir do logotipo original (assets/brand/vertical-church-logo.jpg):
//   public/brand/logo.png            logo com fundo transparente (telas do site)
//   public/icons/icon-192.png        ícone do app (PWA), fundo branco
//   public/icons/icon-512.png        ícone do app (PWA), fundo branco
//   public/icons/icon-maskable-512.png  ícone "maskable" (o sistema recorta em círculo/quadrado: margem de segurança)
//   src/app/icon.png                 ícone da aba do navegador
//   src/app/apple-icon.png           ícone ao "adicionar à tela de início" no iPhone
//   src/lib/certificates/logo-data.ts   logo (JPEG em base64) para o PDF do certificado
//
// Uso: node scripts/make-brand-assets.mjs
// Usa o "sharp", que o Next.js já traz instalado (não é uma dependência direta do projeto).
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SOURCE = "assets/brand/vertical-church-logo.jpg";
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const INK = 23; // o preto do logotipo (#171717): daqui para baixo, a tinta é 100% opaca

// 1. Caixa do desenho: tudo o que não é (quase) branco, com uma folga.
const grey = await sharp(SOURCE).greyscale().raw().toBuffer({ resolveWithObject: true });
let minX = grey.info.width, minY = grey.info.height, maxX = 0, maxY = 0;
for (let y = 0; y < grey.info.height; y++) {
  for (let x = 0; x < grey.info.width; x++) {
    if (grey.data[y * grey.info.width + x] < 200) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
}
const PAD = 8;
const box = { left: minX - PAD, top: minY - PAD, width: maxX - minX + 1 + 2 * PAD, height: maxY - minY + 1 + 2 * PAD };
const aspect = box.width / box.height;
const cropped = sharp(SOURCE).extract(box);

// 2. Fundo branco -> transparente. O que era branco vira transparente; o que era tinta mantém a cor
//    (desfaz a mistura com o branco das bordas suavizadas).
const { data: rgb, info } = await cropped.clone().raw().toBuffer({ resolveWithObject: true });
const rgba = Buffer.alloc(info.width * info.height * 4);
for (let i = 0; i < info.width * info.height; i++) {
  const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
  const alpha = Math.min(1, Math.max(0, (255 - Math.min(r, g, b)) / (255 - INK)));
  const un = (c) => (alpha === 0 ? 0 : Math.min(255, Math.max(0, Math.round((c - 255 * (1 - alpha)) / alpha))));
  rgba.set([un(r), un(g), un(b), Math.round(alpha * 255)], i * 4);
}
const transparent = sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } });

mkdirSync("public/brand", { recursive: true });
mkdirSync("public/icons", { recursive: true });
const logoPng = await transparent.clone().resize({ width: 560 }).png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 }).toBuffer();
writeFileSync("public/brand/logo.png", logoPng);
const logoH = Math.round(560 / aspect);
console.log(`public/brand/logo.png  560x${logoH}`);

// 3. Ícones: o logotipo centralizado num quadrado branco. `share` = largura do logo em relação ao quadrado.
async function square(size, share, file) {
  const w = Math.round(size * share);
  const h = Math.round(w / aspect);
  const logo = await cropped.clone().resize({ width: w, height: h }).png().toBuffer();
  const out = await sharp({ create: { width: size, height: size, channels: 4, background: WHITE } })
    .composite([{ input: logo, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .flatten({ background: WHITE })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(file, out);
  console.log(`${file}  ${size}x${size}`);
}
await square(192, 0.86, "public/icons/icon-192.png");
await square(512, 0.86, "public/icons/icon-512.png");
await square(512, 0.62, "public/icons/icon-maskable-512.png"); // cabe no círculo de segurança (raio de 40%)
await square(180, 0.86, "src/app/apple-icon.png");

// Ícone da aba do navegador (16 a 32 px): o nome inteiro não se lê nesse tamanho, então usa só a cruz laranja,
// o símbolo da marca (o "t" de Vertical). Ela é isolada pela cor: só os pixels laranja do logotipo.
{
  const ORANGE = { r: 0xc1, g: 0x46, b: 0x02 };
  const cross = Buffer.alloc(info.width * info.height * 4);
  let cMinX = info.width, cMinY = info.height, cMaxX = 0, cMaxY = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = y * info.width + x;
      const r = rgb[i * 3], b = rgb[i * 3 + 2];
      const orangeness = Math.min(1, Math.max(0, (r - b - 60) / 120)); // 0 (preto/branco) a 1 (laranja)
      if (orangeness > 0.5) { cMinX = Math.min(cMinX, x); cMaxX = Math.max(cMaxX, x); cMinY = Math.min(cMinY, y); cMaxY = Math.max(cMaxY, y); }
      cross.set([ORANGE.r, ORANGE.g, ORANGE.b, Math.round(orangeness * 255)], i * 4);
    }
  }
  const crossBox = { left: cMinX, top: cMinY, width: cMaxX - cMinX + 1, height: cMaxY - cMinY + 1 };
  const SIZE = 64;
  const inner = Math.round(SIZE * 0.86);
  const scale = Math.min(inner / crossBox.width, inner / crossBox.height);
  const cw = Math.round(crossBox.width * scale);
  const ch = Math.round(crossBox.height * scale);
  const crossPng = await sharp(cross, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(crossBox)
    .resize({ width: cw, height: ch })
    .png()
    .toBuffer();
  const icon = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: WHITE } })
    .composite([{ input: crossPng, left: Math.round((SIZE - cw) / 2), top: Math.round((SIZE - ch) / 2) }])
    .flatten({ background: WHITE })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync("src/app/icon.png", icon);
  console.log(`src/app/icon.png  ${SIZE}x${SIZE} (cruz ${cw}x${ch})`);
}

// 4. Certificado: JPEG sobre fundo branco (o PDF embute o JPEG direto), guardado como texto em base64.
const jpeg = await cropped.clone().resize({ width: 480 }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
const jpegMeta = await sharp(jpeg).metadata();
writeFileSync(
  "src/lib/certificates/logo-data.ts",
  `// GERADO por scripts/make-brand-assets.mjs a partir do logotipo oficial. Não edite à mão.\n` +
    `export const LOGO_JPEG_WIDTH = ${jpegMeta.width};\n` +
    `export const LOGO_JPEG_HEIGHT = ${jpegMeta.height};\n` +
    `export const LOGO_JPEG_BASE64 =\n  "${jpeg.toString("base64")}";\n`,
);
console.log(`src/lib/certificates/logo-data.ts  ${jpegMeta.width}x${jpegMeta.height}, ${jpeg.length} bytes`);
