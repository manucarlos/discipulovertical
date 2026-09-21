import Link from "next/link";
import { connection } from "next/server";
import { BrandLogo } from "@/components/brand-logo";
import { createAnonClient } from "@/lib/supabase/anon";
import { getSupabaseEnv } from "@/lib/supabase/config";
import { FeedbackForm } from "./feedback-form";

export const metadata = { title: "Conte como foi" };

/** O Admin abriu o formulário? Se a consulta falhar, o padrão é fechado. */
async function feedbackOpen(): Promise<boolean> {
  const supabase = createAnonClient();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("public_features");
  return !error && (data as { feedback?: boolean } | null)?.feedback === true;
}

/**
 * Formulário público de feedback do piloto (RF-32). Não exige login: quem não conseguiu entrar também
 * precisa poder contar. Só aparece quando o Admin liga "Formulário de feedback do piloto" em Configurações.
 */
export default async function FeedbackPage() {
  await connection();
  const configured = getSupabaseEnv() !== null;
  const open = configured && (await feedbackOpen());

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
      <BrandLogo height={72} />
      <h1 className="mt-4 font-serif text-3xl leading-tight">Conte como foi</h1>

      {open ? (
        <>
          <p className="mt-3 text-muted">
            Você testou a plataforma de discipulado. Em 2 minutos, ajude-nos a melhorá-la. Não há resposta certa ou errada.
          </p>
          <FeedbackForm />
        </>
      ) : (
        <p role="status" className="mt-4 rounded-xl bg-lilac px-4 py-3">
          O formulário de feedback não está aberto no momento. Obrigado pelo interesse!
        </p>
      )}

      <p className="mt-8 text-sm">
        <Link href="/" className="underline">
          Ir para a plataforma
        </Link>
      </p>
    </main>
  );
}
