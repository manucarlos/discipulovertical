import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Envio do logotipo em Administração > Marca: até 2 MB por imagem (o logotipo e o símbolo) e o arquivo de importação.
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [
      {
        // Cabeçalhos de segurança básicos em todas as páginas.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" }, // ninguém embute o app em outro site (clickjacking)
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
      {
        // O service worker precisa ser rebaixado do servidor a cada visita, senão uma versão nova demora a valer.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
