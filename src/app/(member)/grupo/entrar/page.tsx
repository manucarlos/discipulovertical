import Link from "next/link";
import { connection } from "next/server";
import { requireGroups } from "@/lib/auth";
import { GROUP_CONSENT_EXIT, GROUP_CONSENT_ITEMS } from "@/lib/groups/forms";
import { joinGroup } from "../actions";

export const metadata = { title: "Entrar em um grupo" };

/** Convite por código (RF do módulo, RG-08): a pessoa vê a que grupo vai entrar e exatamente o que o discipulador enxerga. */
export default async function JoinGroupPage(props: PageProps<"/grupo/entrar">) {
  await connection();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const code = (first(search.codigo) ?? "").trim();
  const erro = first(search.erro);
  const { supabase } = await requireGroups();

  const { data } = code ? await supabase.rpc("group_invite_preview", { p_code: code }) : { data: [] };
  const preview = ((data ?? []) as { group_name: string; discipler_name: string; track_title: string }[])[0] ?? null;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
      <Link href="/grupo" className="text-sm text-muted underline">
        ← Meu grupo
      </Link>
      <h1 className="mt-3 font-serif text-3xl leading-tight">Entrar em um grupo</h1>

      {erro && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      {!preview ? (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          Não encontramos um grupo ativo com esse código. Confira o convite com o seu discipulador.
        </p>
      ) : (
        <>
          <section aria-labelledby="grupo" className="mt-5 rounded-2xl border border-line bg-card p-5">
            <h2 id="grupo" className="font-serif text-2xl">
              {preview.group_name}
            </h2>
            <p className="text-sm text-muted">
              {preview.discipler_name ? `Discipulador: ${preview.discipler_name} · ` : ""}Trilha: {preview.track_title}
            </p>
          </section>

          <form action={joinGroup} className="mt-5 space-y-4">
            <input type="hidden" name="codigo" value={code} />
            <fieldset className="rounded-2xl border border-line bg-card p-5">
              <legend className="px-1 font-medium">O que o seu discipulador vai ver</legend>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {GROUP_CONSENT_ITEMS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-muted">{GROUP_CONSENT_EXIT}</p>
            </fieldset>
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input type="checkbox" name="consent" className="mt-1 size-5 shrink-0 accent-[var(--brand)]" required />
              <span className="text-sm">Li e aceito que o meu discipulador veja o que está descrito acima.</span>
            </label>
            <button type="submit" className="w-full rounded-xl bg-brand px-5 py-3 font-medium text-on-brand hover:bg-brand-strong">
              Entrar no grupo
            </button>
          </form>
        </>
      )}
    </main>
  );
}
