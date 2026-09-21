import Link from "next/link";
import { connection } from "next/server";

export const metadata = { title: "Lembretes por e-mail" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Página pública (sem login) para desligar os lembretes por e-mail. O link do e-mail traz um código só da pessoa;
 * abrir o link não desliga nada, é preciso confirmar no botão (para que verificadores automáticos não descadastrem ninguém).
 */
export default async function UnsubscribePage(props: PageProps<"/desinscrever">) {
  await connection();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const token = first(search.t) ?? "";
  const done = first(search.feito) === "1";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <h1 className="font-serif text-3xl leading-tight">Lembretes por e-mail</h1>
      {done ? (
        <>
          <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900">
            Pronto. Você não vai mais receber lembretes por e-mail da trilha de discipulado.
          </p>
          <p className="mt-4 text-muted">
            Se mudar de ideia, é só ligar de novo em <strong>Meu perfil</strong>, na plataforma.
          </p>
        </>
      ) : UUID.test(token) ? (
        <>
          <p className="mt-4 text-muted">Quer parar de receber os lembretes e avisos por e-mail? Você continua com acesso à trilha normalmente.</p>
          <form method="post" action={`/api/descadastro?t=${encodeURIComponent(token)}`} className="mt-6">
            <button type="submit" className="w-full rounded-xl bg-brand px-5 py-3 font-medium text-on-brand hover:bg-brand-strong">
              Sim, parar de receber
            </button>
          </form>
        </>
      ) : (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-red-800">
          Este link não é válido. Abra o link diretamente pelo e-mail que você recebeu, ou desligue os lembretes em Meu perfil.
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
