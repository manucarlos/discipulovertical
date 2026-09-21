import Link from "next/link";
import { connection } from "next/server";
import { CODE_FORMAT, normalizeCode, type Verification } from "@/lib/closures";
import { createAnonClient } from "@/lib/supabase/anon";

export const metadata = { title: "Verificar certificado" };

const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" });

/** Confere o código no banco (função pública, sem login). Devolve nulo se não existir. */
async function verify(code: string): Promise<Verification | null> {
  const supabase = createAnonClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("verify_certificate", { p_code: code });
  if (error) throw new Error(`Falha ao verificar o certificado: ${error.message}`);
  const row = ((data ?? []) as { holder_name: string; cycle_title: string; issued_at: string }[])[0];
  return row ? { holderName: row.holder_name, cycleTitle: row.cycle_title, issuedAt: row.issued_at } : null;
}

/**
 * Página pública de verificação de certificados (RF-19). Mostra só nome, ciclo e data de emissão para quem
 * tiver o código. Um formulário com método GET leva o código para a própria página.
 */
export default async function VerifyPage(props: PageProps<"/verificar">) {
  await connection();
  const search = await props.searchParams;
  const raw = Array.isArray(search.codigo) ? search.codigo[0] : search.codigo;
  const code = raw ? normalizeCode(raw) : "";
  const result = code && CODE_FORMAT.test(code) ? await verify(code) : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <h1 className="font-serif text-3xl leading-tight">Verificar certificado</h1>
      <p className="mt-2 text-muted">Digite o código que está no certificado (por exemplo, VC-1A2B-3C4D-5E6F).</p>

      <form method="get" action="/verificar" className="mt-5 space-y-3">
        <label htmlFor="codigo" className="block text-sm font-medium">
          Código do certificado
        </label>
        <input
          id="codigo"
          name="codigo"
          defaultValue={raw ?? ""}
          required
          maxLength={40}
          autoComplete="off"
          autoCapitalize="characters"
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-base uppercase text-foreground focus:border-brand"
        />
        <button type="submit" className="w-full rounded-xl bg-brand px-5 py-3 font-medium text-on-brand hover:bg-brand-strong">
          Verificar
        </button>
      </form>

      {code &&
        (result ? (
          <section role="status" aria-labelledby="valido" className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
            <h2 id="valido" className="font-serif text-xl">
              Certificado válido
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-emerald-900">Concedido a</dt>
                <dd className="text-base font-medium">{result.holderName}</dd>
              </div>
              <div>
                <dt className="text-emerald-900">Ciclo concluído</dt>
                <dd className="text-base font-medium">{result.cycleTitle}</dd>
              </div>
              <div>
                <dt className="text-emerald-900">Emitido em</dt>
                <dd className="text-base font-medium">{date.format(new Date(result.issuedAt))}</dd>
              </div>
            </dl>
          </section>
        ) : (
          <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-red-800">
            Nenhum certificado foi encontrado com esse código. Confira se digitou tudo certo.
          </p>
        ))}

      <p className="mt-8 text-sm">
        <Link href="/" className="underline">
          Ir para a plataforma
        </Link>
      </p>
    </main>
  );
}
