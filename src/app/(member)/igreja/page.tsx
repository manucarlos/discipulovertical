import { connection } from "next/server";
import { requireMember } from "@/lib/auth";
import { loadChurchPages } from "@/lib/trail/queries";

export const metadata = { title: "Nossa Igreja" };

export default async function ChurchPage() {
  // Depende de quem está logado: nunca pode ser pré-renderizada no build.
  await connection();
  const { supabase } = await requireMember();
  const pages = await loadChurchPages(supabase);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <h1 className="font-serif text-3xl leading-tight">Nossa Igreja</h1>
      <p className="mt-2 text-muted">Quem somos e para onde vamos.</p>

      <div className="mt-8 space-y-8">
        {pages.map((page) => (
          <section key={page.slug} aria-labelledby={`p-${page.slug}`}>
            <h2 id={`p-${page.slug}`} className="font-serif text-2xl">
              {page.title}
            </h2>
            {page.body.trim() ? (
              <div className="mt-2 space-y-3 leading-relaxed">
                {page.body.split(/\n{2,}/).map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-muted">Em breve.</p>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
