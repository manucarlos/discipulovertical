import type { Metadata, Viewport } from "next";
import { Geist, Lora } from "next/font/google";
import type { CSSProperties } from "react";
import { ServiceWorker } from "@/components/service-worker";
import { BROWSER, READING_DARK_CSS, ROOT_STYLE } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Discipulado · Vertical Church",
    template: "%s · Vertical Church",
  },
  description: "Plataforma de discipulado da Vertical Church.",
  applicationName: "Discipulado Vertical",
};

export const viewport: Viewport = {
  themeColor: BROWSER.themeColor,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // As cores da marca (src/lib/brand.ts) entram aqui como variáveis CSS; o globals.css só dá nomes a elas.
    <html lang="pt-BR" className={`${geistSans.variable} ${lora.variable} h-full antialiased`} style={ROOT_STYLE as CSSProperties}>
      <head>
        {/* Só texto fixo do brand.ts (nunca dado de usuário): a regra do modo escuro da leitura. */}
        <style dangerouslySetInnerHTML={{ __html: READING_DARK_CSS }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
