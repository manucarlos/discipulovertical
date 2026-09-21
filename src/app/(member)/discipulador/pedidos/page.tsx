import Link from "next/link";
import { connection } from "next/server";
import { requireDiscipler } from "@/lib/auth";
import { HELP_LIMITS } from "@/lib/groups/forms";
import { HELP_STATUS_LABEL, loadHelpRequests } from "@/lib/groups/help";
import { escalateGroupHelp, handleGroupHelp } from "../actions";

export const metadata = { title: "Pedidos de ajuda do grupo" };

const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand";
const dateTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Pedidos de ajuda dos discípulos dos grupos que o discipulador conduz: atender, registrar e escalar à equipe pastoral (RG-10). */
export default async function GroupHelpPage(props: PageProps<"/discipulador/pedidos">) {
  await connection();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { supabase } = await requireDiscipler();
  const requests = (await loadHelpRequests(supabase)).filter((r) => r.destination === "discipler");
  const erro = first(search.erro);
  const ok = first(search.ok);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/discipulador" className="text-sm text-muted underline">
        ← Meus grupos
      </Link>
      <h1 className="mt-3 font-serif text-3xl leading-tight">Pedidos de ajuda</h1>
      <p className="mt-2 text-muted">
        Atenda com cuidado e registre o que foi feito. Se o assunto for grave ou fugir do que você pode acompanhar, escale à equipe pastoral com o botão.
      </p>
      {erro && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {ok && (
        <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {ok}
        </p>
      )}

      {requests.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nenhum pedido no momento.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {requests.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-card p-5">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.requesterName}</span>
                <span className="rounded-full bg-lilac px-2.5 py-1 text-xs font-medium">{HELP_STATUS_LABEL[r.status]}</span>
                {r.escalatedAt && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800">Escalado à equipe pastoral</span>}
              </p>
              <p className="text-xs text-muted">{dateTime.format(new Date(r.createdAt))}{r.topic ? ` · ${r.topic}` : ""}</p>
              <p className="mt-2 whitespace-pre-line text-sm">{r.message}</p>
              {r.handledNote && <p className="mt-2 border-l-2 border-brand pl-3 text-sm text-muted">{r.handledNote}</p>}

              {!r.escalatedAt ? (
                <div className="mt-3 space-y-3">
                  <form action={handleGroupHelp.bind(null, r.id)} className="space-y-2">
                    <label className="block text-sm font-medium">
                      Registro do atendimento
                      <textarea name="note" rows={2} defaultValue={r.handledNote} maxLength={HELP_LIMITS.note} className={inputClass} />
                    </label>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-sm font-medium">
                        Situação
                        <select name="status" defaultValue={r.status} className={inputClass}>
                          {Object.entries(HELP_STATUS_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit" className="rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong">
                        Salvar
                      </button>
                    </div>
                  </form>
                  <form action={escalateGroupHelp.bind(null, r.id)}>
                    <button type="submit" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-lilac">
                      Escalar à equipe pastoral
                    </button>
                  </form>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">A equipe pastoral cuida deste pedido daqui em diante.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
