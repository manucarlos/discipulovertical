import type { Metadata, Viewport } from "next";
import { Geist, Lora } from "next/font/google";
import type { CSSProperties } from "react";
import { ServiceWorker } from "@/components/service-worker";
import { cssVariables, readingDarkCss } from "@/lib/brand";
import { ASSET_FILES, assetUrl, loadIdentity } from "@/lib/brand-store";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

// O nome da igreja, as cores e as imagens vêm da identidade da igreja (padrão em src/lib/brand.ts; personalizada em
// Administração > Marca). Se o banco não responder, vale o padrão.
export async function generateMetadata(): Promise<Metadata> {
  const identity = await loadIdentity();
  return {
    title: {
      default: `Discipulado · ${identity.name}`,
      template: `%s · ${identity.name}`,
    },
    description: `Plataforma de discipulado da ${identity.name}.`,
    applicationName: "Discipulado",
    icons: {
      icon: [{ url: assetUrl(ASSET_FILES["icon-tab"], identity.version), sizes: "64x64", type: "image/png" }],
      apple: [{ url: assetUrl(ASSET_FILES["icon-apple"], identity.version), sizes: "180x180", type: "image/png" }],
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const identity = await loadIdentity();
  return {
    themeColor: identity.palette.brand,
    width: "device-width",
    initialScale: 1,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const identity = await loadIdentity();
  return (
    // As cores entram aqui como variáveis CSS; o globals.css só dá nomes a elas para o Tailwind.
    <html lang="pt-BR" className={`${geistSans.variable} ${lora.variable} h-full antialiased`} style={cssVariables(identity.palette) as CSSProperties}>
      <head>
        {/* Só cores já validadas como #rrggbb (readingDarkCss recusa qualquer outra coisa): a regra do modo escuro da leitura. */}
        <style dangerouslySetInnerHTML={{ __html: readingDarkCss(identity.readingDark) }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
