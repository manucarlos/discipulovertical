import type { Metadata, Viewport } from "next";
import { Geist, Lora } from "next/font/google";
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
  themeColor: "#8a1c2b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${lora.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
