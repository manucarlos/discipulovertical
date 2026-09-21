import type { MetadataRoute } from "next";
import { BROWSER } from "@/lib/brand";
import { ASSET_FILES, assetUrl, loadIdentity } from "@/lib/brand-store";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const identity = await loadIdentity();
  const icon = (file: (typeof ASSET_FILES)[keyof typeof ASSET_FILES]) => assetUrl(file, identity.version);
  return {
    name: `Discipulado · ${identity.name}`,
    short_name: "Discipulado",
    description: `Plataforma de discipulado da ${identity.name}.`,
    start_url: "/",
    display: "standalone",
    lang: "pt-BR",
    // Cores em src/lib/brand.ts (padrão) ou da tela de Marca: a abertura do app combina com os ícones (fundo branco)
    // e a barra do celular usa a cor da igreja.
    background_color: BROWSER.splashBackground,
    theme_color: identity.palette.brand,
    icons: [
      { src: icon(ASSET_FILES["icon-192"]), sizes: "192x192", type: "image/png" },
      { src: icon(ASSET_FILES["icon-512"]), sizes: "512x512", type: "image/png" },
      // "maskable": o sistema recorta o ícone (círculo, quadrado arredondado); esta versão tem margem de segurança.
      { src: icon(ASSET_FILES["icon-maskable"]), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
