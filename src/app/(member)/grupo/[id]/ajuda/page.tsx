import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireGroups } from "@/lib/auth";
import { HELP_LIMITS, isUuid, SENSITIVE_NOTICE } from "@/lib/groups/forms";
import { loadMyGroups } from "@/lib/groups/queries";
import { requestGroupHelp } from "../../actions";

export const metadata = { title: "Pedir ajuda pastoral" };

const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand";

/** Pedido de ajuda pastoral (RG-10): vai primeiro ao discipulador, ou, se preferir, direto à equipe pastoral. */
export default async function HelpPage(props: PageProps<"/grupo/[id]/ajuda">) {
  await connection();
  const { id } = await props.params;
  if (!isUuid(id)) notFound();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { supabase, user } = await requireGroups();
  const membership = (await loadMyGroups(supabase, user.id)).find((m) => m.group.id === id);
  if (!membership) notFound();
  const erro = first(search.erro);
  const lesson = first(search.licao) ?? "";

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
      <Link href={`/grupo/${id}`} className="text-sm text-muted underline">
        ← {membership.group.name}
      </Link>
      <h1 className="mt-3 font-serif text-3xl leading-tight">Pedir ajuda pastoral</h1>
      <p className="mt-2 text-muted">Você não está sozinho(a). Conte com poucas palavras o que está pesando.</p>
      <p role="note" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
        {SENSITIVE_NOTICE}
      </p>

      {erro && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      <form action={requestGroupHelp.bind(null, id)} className="mt-5 space-y-4">
        {isUuid(lesson) && <input type="hidden" name="lesson" value={lesson} />}
        <label className="block text-sm font-medium">
          Assunto (opcional)
          <input name="topic" maxLength={HELP_LIMITS.topic} className={inputClass} />
        </label>
        <label className="block text-sm font-medium">
          O que você precisa?
          <textarea name="message" required rows={6} maxLength={HELP_LIMITS.message} className={inputClass} />
        </label>
        <fieldset>
          <legend className="text-sm font-medium">Para quem enviar?</legend>
          <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-3">
            <input type="radio" name="destination" value="discipler" defaultChecked className="mt-1 size-5 shrink-0 accent-[var(--brand)]" />
            <span className="text-sm">
              <strong>Ao meu discipulador</strong> (recomendado). Ele atende e, se precisar, leva à equipe pastoral.
            </span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="radio" name="destination" value="pastoral" className="mt-1 size-5 shrink-0 accent-[var(--brand)]" />
            <span className="text-sm">
              <strong>Direto à equipe pastoral</strong>, com prioridade. Use quando for grave ou quando envolver o próprio discipulador. Ele não vê este pedido.
            </span>
          </label>
        </fieldset>
        <button type="submit" className="w-full rounded-xl bg-brand px-5 py-3 font-medium text-on-brand hover:bg-brand-strong">
          Enviar pedido
        </button>
      </form>
    </main>
  );
}
