import { NextResponse } from "next/server";
import { loadAsset, type AssetKey } from "@/lib/brand-store";

/**
 * Imagens da marca: /marca/logo.png, /marca/icone-192.png etc. Serve a imagem que a igreja enviou em
 * Administração > Marca; se não enviou, serve a imagem padrão do projeto. É PÚBLICO de propósito (a tela de login e
 * o app instalado também usam a marca) e só lê pela função pública do banco, que devolve apenas imagens da marca.
 */
const FILES: Record<string, { key: AssetKey; fallback: string }> = {
  "logo.png": { key: "logo", fallback: "/brand/logo.png" },
  "icone-192.png": { key: "icon-192", fallback: "/icons/icon-192.png" },
  "icone-512.png": { key: "icon-512", fallback: "/icons/icon-512.png" },
  "icone-maskable.png": { key: "icon-maskable", fallback: "/icons/icon-maskable-512.png" },
  "icone-apple.png": { key: "icon-apple", fallback: "/icons/icon-apple.png" },
  "icone-aba.png": { key: "icon-tab", fallback: "/icons/icon-tab.png" },
};

// Cinco minutos no navegador; depois ele confere de novo (ETag) e, se nada mudou, não baixa a imagem outra vez.
const CACHE = "public, max-age=300, stale-while-revalidate=86400";

export async function GET(request: Request, ctx: { params: Promise<{ arquivo: string }> }) {
  const { arquivo } = await ctx.params;
  const entry = FILES[arquivo];
  if (!entry) return new NextResponse("Não encontrado", { status: 404 });

  const custom = await loadAsset(entry.key);
  if (custom) {
    const etag = `"v${custom.version}-${entry.key}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": CACHE } });
    }
    return new NextResponse(new Uint8Array(custom.bytes), {
      headers: { "Content-Type": custom.contentType, "Cache-Control": CACHE, ETag: etag, "X-Content-Type-Options": "nosniff" },
    });
  }

  // Sem imagem própria: entrega a padrão (o arquivo estático do projeto), sem redirecionar, para o app instalado.
  try {
    const fallback = await fetch(new URL(entry.fallback, request.url));
    if (fallback.ok) {
      return new NextResponse(await fallback.arrayBuffer(), {
        headers: { "Content-Type": "image/png", "Cache-Control": CACHE, "X-Content-Type-Options": "nosniff" },
      });
    }
  } catch {
    // cai no redirecionamento abaixo
  }
  return NextResponse.redirect(new URL(entry.fallback, request.url), 307);
}
