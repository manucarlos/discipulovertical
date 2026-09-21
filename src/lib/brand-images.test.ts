import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ImageError, MAX_UPLOAD_BYTES, processLogo } from "./brand-images";

/** Um "logotipo" de teste: um retângulo laranja e um traço preto, sobre o fundo escolhido. */
async function makeLogo(opts: { size?: number; background?: { r: number; g: number; b: number; alpha: number }; format?: "png" | "jpeg" } = {}) {
  const size = opts.size ?? 600;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect x="${size * 0.2}" y="${size * 0.3}" width="${size * 0.6}" height="${size * 0.25}" fill="#c14602"/>
    <rect x="${size * 0.25}" y="${size * 0.6}" width="${size * 0.5}" height="${size * 0.06}" fill="#171717"/>
  </svg>`;
  const image = sharp({ create: { width: size, height: size, channels: 4, background: opts.background ?? { r: 255, g: 255, b: 255, alpha: 1 } } }).composite([
    { input: Buffer.from(svg) },
  ]);
  return opts.format === "jpeg" ? image.flatten({ background: "#ffffff" }).jpeg({ quality: 95 }).toBuffer() : image.png().toBuffer();
}

const pixelAt = async (base64: string, x: number, y: number) => {
  const { data, info } = await sharp(Buffer.from(base64, "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3], width: info.width, height: info.height };
};

describe("processLogo", () => {
  it("de um logotipo em PNG com fundo branco gera as sete imagens, com os tamanhos certos", async () => {
    const images = await processLogo(await makeLogo());
    expect(images.map((i) => i.key)).toEqual(["logo", "icon-192", "icon-512", "icon-maskable", "icon-apple", "icon-tab", "logo-jpeg"]);
    const size = Object.fromEntries(images.map((i) => [i.key, [i.width, i.height]]));
    expect(size["icon-192"]).toEqual([192, 192]);
    expect(size["icon-512"]).toEqual([512, 512]);
    expect(size["icon-maskable"]).toEqual([512, 512]);
    expect(size["icon-apple"]).toEqual([180, 180]);
    expect(size["icon-tab"]).toEqual([64, 64]);
    expect(size["logo"][0]).toBeLessThanOrEqual(560);
    expect(images.find((i) => i.key === "logo-jpeg")!.content_type).toBe("image/jpeg");
    for (const i of images.filter((x) => x.key !== "logo-jpeg")) expect(i.content_type).toBe("image/png");
    // O que fica guardado é o resultado recodificado, em base64 puro.
    for (const i of images) expect(i.data).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });

  it("torna o fundo branco transparente e mantém as cores do desenho", async () => {
    const logo = (await processLogo(await makeLogo())).find((i) => i.key === "logo")!;
    const corner = await pixelAt(logo.data, 1, 1);
    expect(corner.a).toBe(0); // canto: fundo, transparente
    const middle = await pixelAt(logo.data, Math.floor(logo.width / 2), Math.floor(logo.height * 0.3));
    expect(middle.a).toBe(255);
    expect([middle.r, middle.g, middle.b]).toEqual([193, 70, 2]); // o laranja, intacto
  });

  it("os ícones têm fundo branco opaco (o sistema não os deixa transparentes)", async () => {
    for (const image of (await processLogo(await makeLogo())).filter((i) => i.key.startsWith("icon-"))) {
      const p = await pixelAt(image.data, 1, 1);
      expect([p.r, p.g, p.b, p.a], image.key).toEqual([255, 255, 255, 255]);
    }
  });

  it("o ícone 'maskable' deixa o desenho dentro da zona de segurança (circulo de 80% do quadrado)", async () => {
    const icon = (await processLogo(await makeLogo())).find((i) => i.key === "icon-maskable")!;
    const { data, info } = await sharp(Buffer.from(icon.data, "base64")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const center = info.width / 2;
    const safe = info.width * 0.4;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const i = (y * info.width + x) * 4;
        const isInk = data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200;
        if (isInk) expect(Math.hypot(x - center, y - center), `(${x},${y})`).toBeLessThanOrEqual(safe);
      }
    }
  });

  it("aceita JPG e PNG já transparente", async () => {
    expect((await processLogo(await makeLogo({ format: "jpeg" }))).length).toBe(7);
    const transparent = await makeLogo({ background: { r: 0, g: 0, b: 0, alpha: 0 } });
    const logo = (await processLogo(transparent)).find((i) => i.key === "logo")!;
    expect((await pixelAt(logo.data, 1, 1)).a).toBe(0);
  });

  it("usa o símbolo no ícone da aba, quando enviado", async () => {
    const symbol = await makeLogo({ size: 300 });
    const withSymbol = (await processLogo(await makeLogo(), { symbol })).find((i) => i.key === "icon-tab")!;
    const without = (await processLogo(await makeLogo())).find((i) => i.key === "icon-tab")!;
    expect(withSymbol.data).not.toBe(without.data);
    expect([withSymbol.width, withSymbol.height]).toEqual([64, 64]);
  });

  it("recusa o que não é PNG ou JPG: SVG, GIF, texto e arquivo vazio, com mensagem clara", async () => {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><script>alert(1)</script></svg>`);
    const gif = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#fff" } }).gif().toBuffer();
    for (const [name, buffer] of [["svg", svg], ["gif", gif], ["texto", Buffer.from("isto não é uma imagem")], ["vazio", Buffer.alloc(0)]] as const) {
      await expect(processLogo(buffer), name).rejects.toBeInstanceOf(ImageError);
    }
    await expect(processLogo(svg)).rejects.toThrow(/PNG ou JPG/);
  });

  it("recusa imagem pequena demais, grande demais em bytes, e em branco", async () => {
    await expect(processLogo(await makeLogo({ size: 64 }))).rejects.toThrow(/pequena demais/);
    await expect(processLogo(Buffer.alloc(MAX_UPLOAD_BYTES + 1))).rejects.toThrow(/2 MB/);
    const blank = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#ffffff" } }).png().toBuffer();
    await expect(processLogo(blank)).rejects.toThrow(/em branco/);
  });
});
