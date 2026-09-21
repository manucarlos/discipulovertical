import { connection } from "next/server";
import { LegalPage } from "@/components/legal-document";
import { loadIdentity } from "@/lib/brand-store";
import { termsFor } from "@/lib/legal-text";

export const metadata = { title: "Termos de Uso" };

export default async function TermosPage() {
  await connection(); // renderizada a cada acesso: a política de segurança (CSP) usa um código novo por requisição
  const { name } = await loadIdentity();
  return <LegalPage doc={termsFor(name)} other={{ href: "/privacidade", label: "Política de Privacidade" }} />;
}
