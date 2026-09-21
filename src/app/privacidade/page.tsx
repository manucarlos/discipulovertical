import { connection } from "next/server";
import { LegalPage } from "@/components/legal-document";
import { PRIVACY } from "@/lib/legal-text";

export const metadata = { title: "Política de Privacidade" };

export default async function PrivacidadePage() {
  await connection(); // renderizada a cada acesso: a política de segurança (CSP) usa um código novo por requisição
  return <LegalPage doc={PRIVACY} other={{ href: "/termos", label: "Termos de Uso" }} />;
}
