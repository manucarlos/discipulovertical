import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Discipulado · Vertical Church",
    short_name: "Discipulado",
    description: "Plataforma de discipulado da Vertical Church.",
    start_url: "/",
    display: "standalone",
    lang: "pt-BR",
    // Branco: é o fundo dos ícones (o logotipo é preto e laranja), então a tela de abertura do app combina com eles.
    background_color: "#ffffff",
    theme_color: "#8a1c2b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // "maskable": o sistema recorta o ícone (círculo, quadrado arredondado); esta versão tem margem de segurança.
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
