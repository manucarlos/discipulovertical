// Gera as imagens PADRÃO da marca a partir do logotipo original (assets/brand/vertical-church-logo.jpg):
//   public/brand/logo.png               logo com fundo transparente (telas do site)
//   public/icons/icon-192.png, icon-512.png   ícone do app (PWA), fundo branco
//   public/icons/icon-maskable-512.png  ícone "maskable" (margem de segurança para o recorte do sistema)
//   public/icons/icon-apple.png         ícone ao "adicionar à tela de início" no iPhone
//   public/icons/icon-tab.png           ícone da aba do navegador (a cruz laranja)
//   src/lib/certificates/logo-data.ts   logo (JPEG em base64) para o PDF do certificado
//
// São as imagens usadas enquanto a igreja não enviar as suas em Administração > Marca. O processamento é o mesmo
// da tela (src/lib/brand-images.ts).
//
// Uso: npm run icons
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { processLogo } from "../src/lib/brand-images";

const SOURCE = "assets/brand/vertical-church-logo.jpg";
const logo = readFileSync(SOURCE);

// Ícone da aba do navegador (16 a 32 px): o nome inteiro não se lê nesse tamanho, então usa só a cruz laranja, o
// símbolo da marca (o "t" de Vertical). Ela é isolada pela cor: só os pixels laranja do logotipo.
async function orangeCross(): Promise<Buffer> {
  const ORANGE = { r: 0xc1, g: 0x46, b: 0x02 };
  const { data, info } = await sharp(logo).raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const orangeness = Math.min(1, Math.max(0, (data[i * 3] - data[i * 3 + 2] - 60) / 120)); // 0 (preto/branco) a 1 (laranja)
    rgba.set([ORANGE.r, ORANGE.g, ORANGE.b, Math.round(orangeness * 255)], i * 4);
  }
  return sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function main() {
  const images = await processLogo(logo, { symbol: await orangeCross() });
  const byKey = Object.fromEntries(images.map((i) => [i.key, i]));
  const bytes = (key: string) => Buffer.from(byKey[key].data, "base64");

  mkdirSync("public/brand", { recursive: true });
  mkdirSync("public/icons", { recursive: true });
  const files: [string, string][] = [
    ["logo", "public/brand/logo.png"],
    ["icon-192", "public/icons/icon-192.png"],
    ["icon-512", "public/icons/icon-512.png"],
    ["icon-maskable", "public/icons/icon-maskable-512.png"],
    ["icon-apple", "public/icons/icon-apple.png"],
    ["icon-tab", "public/icons/icon-tab.png"],
  ];
  for (const [key, file] of files) {
    writeFileSync(file, bytes(key));
    console.log(`${file}  ${byKey[key].width}x${byKey[key].height}`);
  }

  const jpeg = byKey["logo-jpeg"];
  writeFileSync(
    "src/lib/certificates/logo-data.ts",
    `// GERADO por scripts/make-brand-assets.ts a partir do logotipo oficial. Não edite à mão.\n` +
      `export const LOGO_JPEG_WIDTH = ${jpeg.width};\n` +
      `export const LOGO_JPEG_HEIGHT = ${jpeg.height};\n` +
      `export const LOGO_JPEG_BASE64 =\n  "${jpeg.data}";\n`,
  );
  console.log(`src/lib/certificates/logo-data.ts  ${jpeg.width}x${jpeg.height}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
