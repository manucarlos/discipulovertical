import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { SETTINGS_LIMITS } from "@/lib/admin/settings";
import { FEATURES, loadSettings } from "@/lib/features";
import { saveSettings } from "./actions";

export const metadata = { title: "Configurações · Conteúdo" };

const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand";

/** Configurações da igreja e recursos que podem ser ligados ou desligados (RF-28). */
export default async function SettingsPage(props: PageProps<"/admin/configuracoes">) {
  await connection();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const { supabase } = await requireAdmin();
  const settings = await loadSettings(supabase);
  const erro = first(search.erro);
  const ok = first(search.ok);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="font-serif text-3xl leading-tight">Configurações</h1>
      <p className="mt-2 text-muted">
        Os recursos abaixo estão prontos, mas <strong>desligados</strong> até você decidir. Ligue um de cada vez, conforme o
        piloto for validando a trilha.
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

      <form action={saveSettings} className="mt-8 space-y-8">
        <section aria-labelledby="igreja-titulo" className="space-y-3 rounded-2xl border border-line bg-card p-5">
          <h2 id="igreja-titulo" className="font-serif text-xl">
            A igreja
          </h2>
          <label className="block text-sm font-medium">
            Nome da igreja
            <input name="church_name" defaultValue={settings.church.name} required maxLength={SETTINGS_LIMITS.churchName} className={inputClass} />
          </label>
          <label className="block text-sm font-medium">
            E-mail de contato (aparece nos termos e nos e-mails enviados)
            <input
              name="contact_email"
              type="email"
              defaultValue={settings.church.contactEmail}
              maxLength={SETTINGS_LIMITS.contactEmail}
              className={inputClass}
            />
          </label>
        </section>

        <section aria-labelledby="recursos-titulo" className="rounded-2xl border border-line bg-card p-5">
          <h2 id="recursos-titulo" className="font-serif text-xl">
            Recursos
          </h2>
          <ul className="mt-3 divide-y divide-line">
            {FEATURES.map((f) => (
              <li key={f.key} className="py-3">
                <label className="flex min-h-11 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    name={`feature_${f.key}`}
                    defaultChecked={settings.flags[f.key]}
                    className="mt-1 size-5 shrink-0 accent-[var(--brand)]"
                  />
                  <span>
                    <span className="block font-medium">
                      {f.label} <span className="ml-1 rounded-full bg-line px-2 py-0.5 text-xs font-normal text-muted">{f.phase}</span>
                    </span>
                    <span className="block text-sm text-muted">{f.description}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>

        <button type="submit" className="rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong">
          Salvar configurações
        </button>
      </form>
    </main>
  );
}
