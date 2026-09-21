import { connection } from "next/server";
import { LegalPage } from "@/components/legal-document";
import { TERMS } from "@/lib/legal-text";

export const metadata = { title: "Termos de Uso" };

export default async function TermosPage() {
  await connection(); // renderizada a cada acesso: a política de segurança (CSP) usa um código novo por requisição
  return <LegalPage doc={TERMS} other={{ href: "/privacidade", label: "Política de Privacidade" }} />;
}
