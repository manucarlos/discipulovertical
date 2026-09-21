import Link from "next/link";
import { connection } from "next/server";
import { requireDiscipler } from "@/lib/auth";
import { WEEKDAY_LABEL } from "@/lib/groups/forms";
import { createGroup } from "../actions";

export const metadata = { title: "Criar grupo" };

const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand";

/** "Criar grupo" (seção 18): nome, trilha oficial, data de início, dias ativos, horário e dia do encontro. */
export default async function NewGroupPage(props: PageProps<"/discipulador/novo">) {
  await connection();
  const search = await props.searchParams;
  const erro = Array.isArray(search.erro) ? search.erro[0] : search.erro;
  const { supabase } = await requireDiscipler();

  const { data } = await supabase.from("tracks").select("id, title, description").eq("status", "published").order("title");
  const tracks = (data ?? []) as { id: string; title: string; description: string }[];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
      <Link href="/discipulador" className="text-sm text-muted underline">
        ← Meus grupos
      </Link>
      <h1 className="mt-3 font-serif text-3xl leading-tight">Criar grupo</h1>

      {erro && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}

      {tracks.length === 0 ? (
        <p className="mt-4 rounded-xl bg-lilac px-4 py-3 text-sm">Ainda não há trilhas oficiais publicadas. Peça ao administrador que publique uma.</p>
      ) : (
        <form action={createGroup} className="mt-5 space-y-4">
          <label className="block text-sm font-medium">
            Nome do grupo
            <input name="name" required maxLength={80} className={inputClass} placeholder="Grupo de terça de manhã" />
          </label>
          <label className="block text-sm font-medium">
            Trilha
            <select name="track" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Escolha…
              </option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Data de início
            <input name="start_date" type="date" required defaultValue={today} className={inputClass} />
          </label>
          <fieldset>
            <legend className="text-sm font-medium">Dias de leitura</legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <label key={n} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" name="weekday" value={n} defaultChecked={n <= 6} className="size-5 accent-[var(--brand)]" />
                  {WEEKDAY_LABEL[n]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Hora em que a lição libera
              <select name="hour" defaultValue="6" className={inputClass}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {h}h
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Dia do encontro
              <select name="meeting_weekday" defaultValue="" className={inputClass}>
                <option value="">Sem dia fixo</option>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {WEEKDAY_LABEL[n]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" className="w-full rounded-xl bg-brand px-5 py-3 font-medium text-on-brand hover:bg-brand-strong">
            Criar grupo
          </button>
        </form>
      )}
    </main>
  );
}
