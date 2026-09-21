import type { MetadataRoute } from "next";
import { BROWSER } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Discipulado · Vertical Church",
    short_name: "Discipulado",
    description: "Plataforma de discipulado da Vertical Church.",
    start_url: "/",
    display: "standalone",
    lang: "pt-BR",
    // Cores em src/lib/brand.ts: a abertura do app combina com os ícones (fundo branco) e a barra usa a cor da igreja.
    background_color: BROWSER.splashBackground,
    theme_color: BROWSER.themeColor,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // "maskable": o sistema recorta o ícone (círculo, quadrado arredondado); esta versão tem margem de segurança.
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
