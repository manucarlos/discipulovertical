import Link from "next/link";
import { getSupabaseEnv } from "@/lib/supabase/config";
import { GoogleSignInButton } from "./google-sign-in-button";

export const metadata = { title: "Entrar" };

export default async function LoginPage(props: PageProps<"/login">) {
  const { erro } = await props.searchParams;
  const configured = getSupabaseEnv() !== null;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-widest text-brand">Vertical Church</p>
        <h1 className="mt-2 font-serif text-3xl leading-tight">Discipulado</h1>
        <p className="mt-3 text-muted">
          Sua caminhada com Jesus, um passo de cada vez. Entre com sua conta Google para começar.
        </p>

        {erro && (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            Não foi possível entrar. Tente de novo.
          </p>
        )}

        <div className="mt-6">
          {configured ? (
            <GoogleSignInButton />
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
