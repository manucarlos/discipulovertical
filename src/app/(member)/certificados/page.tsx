import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireMember } from "@/lib/auth";
import { loadMyCertificates } from "@/lib/closures";
import { loadSettings } from "@/lib/features";

export const metadata = { title: "Meus certificados" };

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" });

/** "Meus certificados" (seção 6): lista e download em PDF. */
export default async function CertificatesPage() {
  await connection();
  const { supabase, user } = await requireMember();
  if (!(await loadSettings(supabase)).flags.certificates) redirect("/");
  const certificates = await loadMyCertificates(supabase, user.id);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="font-serif text-3xl leading-tight">Meus certificados</h1>
      {certificates.length === 0 ? (
        <p className="mt-3 text-muted">
          Você ainda não tem certificados. Eles são emitidos depois que você conclui um ciclo e a liderança confirma a sua presença no
          encontro de encerramento.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {certificates.map((c) => (
            <li key={c.code} className="rounded-2xl border border-line bg-card p-5">
              <p className="font-serif text-xl">{c.cycleTitle}</p>
              <p className="text-sm text-muted">
                Emitido em {date.format(new Date(c.issuedAt))} · código {c.code}
              </p>
              <Link
                href={`/certificados/${c.code}/pdf`}
                prefetch={false}
                className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong"
              >
                Baixar em PDF
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
