import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { HELP_LIMITS } from "@/lib/groups/forms";
import { HELP_STATUS_LABEL, loadHelpRequests } from "@/lib/groups/help";
import { handlePastoralHelp } from "./actions";

export const metadata = { title: "Pedidos de ajuda · Conteúdo" };

const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand";
const dateTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Fila da equipe pastoral (seção 18): pedidos enviados direto (com prioridade) e os escalados pelos discipuladores. */
export default async function PastoralHelpPage(props: PageProps<"/admin/pedidos-de-ajuda">) {
  await connection();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { supabase } = await requireAdmin();
  const all = await loadHelpRequests(supabase);
  // Prioridade: direto à equipe pastoral primeiro; dentro de cada grupo, abertos antes dos encerrados e os mais antigos antes.
  const rank = (r: (typeof all)[number]) => (r.status === "closed" ? 2 : 0) + (r.destination === "pastoral" ? 0 : 1);
  const requests = [...all].sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt));
  const erro = first(search.erro);
  const ok = first(search.ok);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <Link href="/admin/grupos" className="text-sm text-muted underline">
        ← Grupos
      </Link>
      <h1 className="mt-3 font-serif text-3xl leading-tight">Pedidos de ajuda pastoral</h1>
      <p className="mt-2 text-muted">
        Os que chegaram direto à equipe pastoral têm prioridade. Os demais foram escalados pelos discipuladores. Trate tudo com sigilo.
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
        <p className="mt-4 text-sm text-muted">Nenhum pedido na fila.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {requests.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-card p-5">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.requesterName}</span>
                {r.destination === "pastoral" ? (
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800">Prioridade: direto à equipe</span>
                ) : (
                  <span className="rounded-full bg-tint px-2.5 py-1 text-xs font-medium">Escalado pelo discipulador</span>
                )}
                <span className="rounded-full bg-tint px-2.5 py-1 text-xs font-medium">{HELP_STATUS_LABEL[r.status]}</span>
              </p>
              <p className="text-xs text-muted">
                {dateTime.format(new Date(r.createdAt))}
                {r.topic ? ` · ${r.topic}` : ""}
              </p>
              <p className="mt-2 whitespace-pre-line text-sm">{r.message}</p>
              <form action={handlePastoralHelp.bind(null, r.id)} className="mt-3 space-y-2">
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
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
