// Gera ícones PROVISÓRIOS do PWA (fundo vermelho com uma cruz branca).
// Troque public/icons/*.png pelo logotipo oficial quando o pastor enviar.
// Uso: node scripts/make-placeholder-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const RED = [0x8a, 0x1c, 0x2b];
const WHITE = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const bar = Math.round(size * 0.11); // espessura da cruz
  const vTop = Math.round(size * 0.24);
  const vBottom = Math.round(size * 0.78);
  const hY = Math.round(size * 0.4);
  const hHalf = Math.round(size * 0.2);
  const cx = Math.round(size / 2);

  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0; // filtro "nenhum"
    for (let x = 0; x < size; x++) {
      const vertical = Math.abs(x - cx) <= bar / 2 && y >= vTop && y <= vBottom;
      const horizontal = Math.abs(y - hY) <= bar / 2 && Math.abs(x - cx) <= hHalf;
      const [r, g, b] = vertical || horizontal ? WHITE : RED;
      raw.set([r, g, b], row + 1 + x * 3);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public/icons", { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, png(size));
  console.log(`public/icons/icon-${size}.png`);
}
