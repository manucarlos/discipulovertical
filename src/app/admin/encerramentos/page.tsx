import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { CLOSURE_LIMITS, formatEventWhen, loadAdminClosures } from "@/lib/closures";
import { loadSettings } from "@/lib/features";
import { createClosureEvent, deleteClosureEvent, issueCertificates, saveAttendance } from "./actions";

export const metadata = { title: "Encerramentos · Conteúdo" };

const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand";
const primary = "rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong";
const secondary = "inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-lilac";

/** Encerramentos presenciais (RF-18) e emissão de certificados (RF-19, RN-06). */
export default async function ClosuresPage(props: PageProps<"/admin/encerramentos">) {
  await connection();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const { supabase } = await requireAdmin();
  const [{ cycles, events }, settings] = await Promise.all([loadAdminClosures(supabase), loadSettings(supabase)]);
  const erro = first(search.erro);
  const ok = first(search.ok);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="font-serif text-3xl leading-tight">Encerramentos</h1>
      <p className="mt-2 text-muted">
        Cada ciclo termina com um encontro presencial. Aqui você marca o encontro, confirma quem esteve presente e emite os certificados de
        quem concluiu o ciclo. O encontro <strong>não trava</strong> o ciclo seguinte: quem ainda não teve a presença confirmada só fica com o
        marco pendente.
      </p>

      {(!settings.flags.closures || !settings.flags.certificates) && (
        <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {!settings.flags.closures && (
            <>
              O recurso <strong>Encerramentos presenciais</strong> está desligado: os membros ainda não veem os encontros.{" "}
            </>
          )}
          {!settings.flags.certificates && (
            <>
              O recurso <strong>Certificados</strong> está desligado: ainda não é possível emitir.{" "}
            </>
          )}
          Ligue em <Link href="/admin/configuracoes" className="underline">Configurações</Link>.
        </p>
      )}
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

      <form id="novo" action={createClosureEvent} className="mt-8 space-y-3 rounded-2xl border border-line bg-card p-5">
        <h2 className="font-serif text-xl">Novo encerramento</h2>
        <label className="block text-sm font-medium">
          Ciclo
          <select name="cycle" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Escolha…
            </option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                Ciclo {c.position} · {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Título
          <input name="title" required maxLength={CLOSURE_LIMITS.title} placeholder="Culto de boas-vindas" className={inputClass} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            Data e hora (horário de Brasília)
            <input name="starts_at" type="datetime-local" required className={inputClass} />
          </label>
          <label className="block text-sm font-medium">
            Tipo (opcional)
            <input name="kind" maxLength={CLOSURE_LIMITS.kind} placeholder="Culto, café, aula…" className={inputClass} />
          </label>
        </div>
        <label className="block text-sm font-medium">
          Local (opcional)
          <input name="location" maxLength={CLOSURE_LIMITS.location} placeholder="Templo principal" className={inputClass} />
        </label>
        <button type="submit" className={primary}>
          Criar encerramento
        </button>
      </form>

      <section aria-labelledby="lista" className="mt-10">
        <h2 id="lista" className="font-serif text-2xl">
          Encerramentos marcados
        </h2>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nenhum encerramento ainda.</p>
        ) : (
          <div className="mt-4 space-y-6">
            {events.map((e) => (
              <article key={e.id} id={`e-${e.id}`} className="space-y-4 rounded-2xl border border-line bg-card p-5">
                <header>
                  <p className="text-sm font-medium uppercase tracking-wide text-brand">{e.cycleTitle}</p>
                  <h3 className="font-serif text-xl">{e.title}</h3>
                  <p className="text-sm text-muted">
                    {formatEventWhen(e.startsAt)}
                    {e.location ? ` · ${e.location}` : ""}
                    {e.kind ? ` · ${e.kind}` : ""}
                  </p>
                  <p className="mt-1 text-sm">
                    {e.eligible.length} {e.eligible.length === 1 ? "pessoa concluiu" : "pessoas concluíram"} o ciclo · {e.presentCount} com presença
                    confirmada · {e.certificateCount} {e.certificateCount === 1 ? "certificado emitido" : "certificados emitidos"}
                  </p>
                </header>

                {e.eligible.length === 0 ? (
                  <p className="text-sm text-muted">Ninguém concluiu este ciclo ainda.</p>
                ) : (
                  <form action={saveAttendance.bind(null, e.id)} className="space-y-3">
                    <fieldset>
                      <legend className="text-sm font-medium">Quem esteve presente</legend>
                      <ul className="mt-2 space-y-1">
                        {e.eligible.map((m) => (
                          <li key={m.id}>
                            <input type="hidden" name="eligible" value={m.id} />
                            <label className="flex min-h-11 cursor-pointer items-center gap-3">
                              <input type="checkbox" name={`present_${m.id}`} defaultChecked={m.present === true} className="size-5 shrink-0 accent-[var(--brand)]" />
                              <span>
                                {m.name}
                                {m.present === null && <span className="ml-2 text-xs text-muted">(pendente)</span>}
                                {m.present === false && <span className="ml-2 text-xs text-muted">(ausente)</span>}
                                {m.hasCertificate && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">certificado emitido</span>}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </fieldset>
                    <button type="submit" className={primary}>
                      Salvar presença
                    </button>
                  </form>
                )}

                <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                  <form action={issueCertificates.bind(null, e.id)}>
                    <button type="submit" className={secondary}>
                      Emitir certificados
                    </button>
                  </form>
                  <form action={deleteClosureEvent.bind(null, e.id)}>
                    <button type="submit" className="inline-flex min-h-11 items-center text-sm underline">
                      Apagar encerramento
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
