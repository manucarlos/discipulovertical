import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { CHURCH_LIMITS } from "@/lib/admin/church";
import { loadChurchPages } from "@/lib/trail/queries";
import { saveChurchPage } from "./actions";

export const metadata = { title: "Nossa Igreja · Conteúdo" };

const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand";

/** Editor das páginas de "Nossa Igreja" (RF-15): missão, visão, valores, história e ministérios. */
export default async function EditChurchPage(props: PageProps<"/admin/igreja">) {
  await connection();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const { supabase } = await requireAdmin();
  const pages = await loadChurchPages(supabase);
  const erro = first(search.erro);
  const ok = first(search.ok);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="font-serif text-3xl leading-tight">Nossa Igreja</h1>
      <p className="mt-2 text-muted">
        Textos que todos os membros leem na página <strong>Nossa Igreja</strong>. Uma linha em branco separa os parágrafos.
        Página sem texto aparece para o membro como &ldquo;Em breve&rdquo;.
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

      <div className="mt-8 space-y-6">
        {pages.map((page) => (
          <form
            key={page.slug}
            id={`p-${page.slug}`}
            action={saveChurchPage.bind(null, page.slug)}
            className="space-y-3 rounded-2xl border border-line bg-card p-5"
          >
            <label className="block text-sm font-medium">
              Título
              <input name="title" defaultValue={page.title} required maxLength={CHURCH_LIMITS.title} className={inputClass} />
            </label>
            <label className="block text-sm font-medium">
              Texto
              <textarea
                name="body"
                defaultValue={page.body}
                rows={page.body.length > 400 ? 10 : 5}
                maxLength={CHURCH_LIMITS.body}
                className={inputClass}
              />
            </label>
            <button type="submit" className="rounded-xl bg-brand px-5 py-2.5 font-medium text-white hover:bg-brand-strong">
              Salvar
            </button>
          </form>
        ))}
      </div>
    </main>
  );
}
