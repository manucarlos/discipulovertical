import Link from "next/link";
import { connection } from "next/server";
import { BrandLogo } from "@/components/brand-logo";
import { createAnonClient } from "@/lib/supabase/anon";
import { getSupabaseEnv } from "@/lib/supabase/config";
import { EmailSignInForm } from "./email-sign-in-form";
import { GoogleSignInButton } from "./google-sign-in-button";

export const metadata = { title: "Entrar" };

/** O Admin ligou "Entrar com e-mail"? Se a consulta falhar, o padrão é desligado (só o Google). */
async function emailLoginEnabled(): Promise<boolean> {
  const supabase = createAnonClient();
  if (!supabase) return false;
  const { data, error } = await supabase.rpc("public_features");
  return !error && (data as { email_login?: boolean } | null)?.email_login === true;
}

export default async function LoginPage(props: PageProps<"/login">) {
  await connection();
  const { erro, conta } = await props.searchParams;
  const configured = getSupabaseEnv() !== null;
  const withEmail = configured && (await emailLoginEnabled());

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-8 shadow-sm">
        <BrandLogo height={96} />
        <h1 className="mt-4 font-serif text-3xl leading-tight">Discipulado</h1>
        <p className="mt-3 text-muted">
          Sua caminhada com Jesus, um passo de cada vez. Entre para começar.
        </p>

        {conta === "excluida" && (
          <p role="status" className="mt-5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Sua conta foi excluída e os seus dados pessoais foram removidos. Se um dia quiser voltar, é só entrar de novo.
          </p>
        )}

        {erro && (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            Não foi possível entrar. Tente de novo.
          </p>
        )}

        <div className="mt-6">
          {configured ? (
            <>
              <GoogleSignInButton />
              {withEmail && (
                <div className="mt-6 border-t border-line pt-6">
                  <EmailSignInForm />
                </div>
              )}
            </>
          ) : (
            <p className="rounded-lg bg-lilac px-3 py-2 text-sm text-muted">
              O login ainda não foi configurado. Siga o passo a passo em <code>docs/CONTAS.md</code>.
            </p>
          )}
        </div>

        <p className="mt-6 text-xs leading-relaxed text-muted">
          Ao entrar, você confirma que leu os{" "}
          <Link href="/termos" className="underline">
            Termos de Uso
          </Link>{" "}
          e a{" "}
          <Link href="/privacidade" className="underline">
            Política de Privacidade
          </Link>
          . Esta plataforma é para maiores de 18 anos.
        </p>
      </div>
    </main>
  );
}
