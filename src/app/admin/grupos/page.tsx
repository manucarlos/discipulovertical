import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadSettings } from "@/lib/features";
import { memberDays, releasedDays } from "@/lib/groups/calendar";
import { TRACK_LIMITS } from "@/lib/groups/tracks";
import { loadGroupCompletion, loadGroupContext, loadRoster } from "@/lib/groups/queries";
import { addDiscipler, createTrack, setDiscipler, setTrackStatus, transferGroup } from "./actions";

export const metadata = { title: "Grupos · Conteúdo" };

const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand";
const primary = "rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong";
const secondary = "inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-sm font-medium hover:bg-tint";
const TRACK_STATUS: Record<string, string> = { draft: "Rascunho", published: "Publicada", archived: "Arquivada" };
const LESSON_STATUS: Record<string, string> = { draft: "Rascunho", in_review: "Em revisão", published: "Publicada", archived: "Arquivada" };

/** Grupos de Discipulado (Admin): visão geral, discipuladores, trilhas e a biblioteca de lições. */
export default async function AdminGroupsPage(props: PageProps<"/admin/grupos">) {
  await connection();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { supabase } = await requireAdmin();
  const now = new Date();
  const settings = await loadSettings(supabase);

  const [groupsRes, tracksRes, trackDaysRes, disciplersRes, libraryRes] = await Promise.all([
    supabase.from("discipleship_groups").select("id, name, discipler_id, status").order("created_at"),
    supabase.from("tracks").select("id, title, description, status").order("created_at"),
    supabase.from("track_days").select("track_id"),
    supabase.from("profiles").select("id, display_name, email").eq("is_discipler", true).order("display_name"),
    supabase.from("lessons").select("slug, title, status, sensitive, themes, position").eq("kind", "library").order("position"),
  ]);
  for (const res of [groupsRes, tracksRes, trackDaysRes, disciplersRes, libraryRes]) {
    if (res.error) throw new Error(`Falha ao carregar os grupos: ${res.error.message}`);
  }
  const disciplers = (disciplersRes.data ?? []) as { id: string; display_name: string; email: string }[];
  const nameOf = new Map(disciplers.map((d) => [d.id, d.display_name]));
  const dayCount = new Map<string, number>();
  for (const d of (trackDaysRes.data ?? []) as { track_id: string }[]) dayCount.set(d.track_id, (dayCount.get(d.track_id) ?? 0) + 1);
  const tracks = (tracksRes.data ?? []) as { id: string; title: string; description: string; status: string }[];
  const library = (libraryRes.data ?? []) as { slug: string; title: string; status: string; sensitive: boolean; themes: string[] }[];

  const groups = await Promise.all(
    ((groupsRes.data ?? []) as { id: string; name: string; discipler_id: string | null; status: string }[]).map(async (g) => {
      const ctx = await loadGroupContext(supabase, g.id);
      const roster = ctx ? (await loadRoster(supabase, g.id)).filter((m) => m.status === "active") : [];
      const completion = ctx ? await loadGroupCompletion(supabase, g.id, ctx.days) : new Map<string, Set<number>>();
      let due = 0;
      let read = 0;
      if (ctx) {
        for (const m of roster) {
          const days = memberDays(ctx.schedule, completion.get(m.userId) ?? new Set(), new Date(m.joinedAt), now).filter((d) => d.state !== "not_released" && d.state !== "available");
          due += days.length;
          read += days.filter((d) => d.state === "done").length;
        }
      }
      return { ...g, day: ctx ? releasedDays(ctx.schedule, now) : 0, total: ctx?.days.length ?? 0, members: roster.length, percent: due === 0 ? 0 : Math.round((read / due) * 100) };
    }),
  );
  const erro = first(search.erro);
  const ok = first(search.ok);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="font-serif text-3xl leading-tight">Grupos de Discipulado</h1>
      <p className="mt-2 text-muted">
        Quem conduz, quais grupos existem, as trilhas oficiais e a biblioteca de lições. <Link href="/admin/pedidos-de-ajuda" className="underline">Pedidos de ajuda</Link>.
      </p>
      {!settings.flags.groups && (
        <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950">
          O recurso <strong>Grupo de Discipulado</strong> está desligado: ninguém vê nada disto ainda. Ligue em <Link href="/admin/configuracoes" className="underline">Configurações</Link> quando quiser abrir.
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

      <section id="grupos" aria-labelledby="grupos-titulo" className="mt-8">
        <h2 id="grupos-titulo" className="font-serif text-2xl">
          Grupos
        </h2>
        {groups.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nenhum grupo criado ainda.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {groups.map((g) => (
              <li key={g.id} className="rounded-2xl border border-line bg-card p-4">
                <p className="font-medium">
                  {g.name} <span className="text-sm font-normal text-muted">{g.status !== "active" ? "· encerrado" : ""}</span>
                </p>
                <p className="text-sm text-muted">
                  {g.discipler_id ? `Discipulador: ${nameOf.get(g.discipler_id) ?? "—"}` : "Sem discipulador"} · dia {g.day} de {g.total} · {g.members} discípulos · {g.percent}% de leitura
                </p>
                {disciplers.length > 0 && (
                  <form action={transferGroup.bind(null, g.id)} className="mt-2 flex flex-wrap items-end gap-2">
                    <label className="min-w-44 flex-1 text-sm font-medium">
                      Passar para
                      <select name="discipler" defaultValue="" required className={inputClass}>
                        <option value="" disabled>
                          Escolha…
                        </option>
                        {disciplers.filter((d) => d.id !== g.discipler_id).map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.display_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className={secondary}>
                      Transferir
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="discipuladores" aria-labelledby="disc-titulo" className="mt-10 rounded-2xl border border-line bg-card p-5">
        <h2 id="disc-titulo" className="font-serif text-xl">
          Discipuladores
        </h2>
        {disciplers.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Ninguém marcado ainda.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {disciplers.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{d.display_name}</span>
                <form action={setDiscipler.bind(null, d.id)}>
                  <input type="hidden" name="value" value="0" />
                  <button type="submit" className="inline-flex min-h-11 items-center underline">
                    Remover
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addDiscipler} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 text-sm font-medium">
            E-mail da pessoa (já precisa ter entrado)
            <input name="email" type="email" required className={inputClass} />
          </label>
          <button type="submit" className={primary}>
            Marcar como discipulador
          </button>
        </form>
      </section>

      <section id="trilhas" aria-labelledby="trilhas-titulo" className="mt-10">
        <h2 id="trilhas-titulo" className="font-serif text-2xl">
          Trilhas oficiais
        </h2>
        {tracks.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nenhuma trilha ainda. Crie uma abaixo, com as lições da biblioteca.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {tracks.map((t) => (
              <li key={t.id} className="rounded-2xl border border-line bg-card p-4">
                <p className="font-medium">
                  {t.title} <span className="ml-1 rounded-full bg-tint px-2 py-0.5 text-xs font-normal">{TRACK_STATUS[t.status]}</span>
                </p>
                <p className="text-sm text-muted">
                  {dayCount.get(t.id) ?? 0} dias{t.description ? ` · ${t.description}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.status !== "published" && (
                    <form action={setTrackStatus.bind(null, t.id, "published")}>
                      <button type="submit" className={secondary}>
                        Publicar
                      </button>
                    </form>
                  )}
                  {t.status === "published" && (
                    <form action={setTrackStatus.bind(null, t.id, "archived")}>
                      <button type="submit" className={secondary}>
                        Arquivar
                      </button>
                    </form>
                  )}
                  {t.status === "archived" && (
                    <form action={setTrackStatus.bind(null, t.id, "draft")}>
                      <button type="submit" className={secondary}>
                        Voltar a rascunho
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <form id="nova-trilha" action={createTrack} className="mt-5 space-y-3 rounded-2xl border border-line bg-card p-5">
          <h3 className="font-serif text-xl">Nova trilha</h3>
          <label className="block text-sm font-medium">
            Título
            <input name="title" required maxLength={TRACK_LIMITS.title} className={inputClass} />
          </label>
          <label className="block text-sm font-medium">
            Descrição (opcional)
            <input name="description" maxLength={TRACK_LIMITS.description} className={inputClass} />
          </label>
          <label className="block text-sm font-medium">
            Lições, na ordem dos dias <span className="font-normal text-muted">(uma por linha; use o identificador da tabela abaixo)</span>
            <textarea name="lessons" required rows={6} className={`${inputClass} font-mono text-sm`} placeholder={"lib-01-andar-com-deus\nlib-02-biblia-e-oracao"} />
          </label>
          <button type="submit" className={primary}>
            Criar trilha
          </button>
        </form>
      </section>

      <section aria-labelledby="biblioteca" className="mt-10">
        <h2 id="biblioteca" className="font-serif text-2xl">
          Biblioteca de lições
        </h2>
        <p className="mt-1 text-sm text-muted">Edite cada lição no mesmo editor da trilha de novos convertidos. Lição sensível traz o aviso e o botão de pedir ajuda.</p>
        {library.length === 0 ? (
          <p className="mt-2 text-sm text-muted">A biblioteca ainda não foi importada. Veja o passo a passo em docs/CONTAS.md.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <caption className="sr-only">Lições da biblioteca</caption>
              <thead className="bg-tint">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Identificador</th>
                  <th scope="col" className="px-3 py-2 font-medium">Lição</th>
                  <th scope="col" className="px-3 py-2 font-medium">Tema</th>
                  <th scope="col" className="px-3 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {library.map((l) => (
                  <tr key={l.slug} className="border-t border-line align-top">
                    <td className="px-3 py-2 font-mono text-xs">{l.slug}</td>
                    <td className="px-3 py-2">
                      <Link href={`/admin/licao/${l.slug}`} className="underline">
                        {l.title}
                      </Link>
                      {l.sensitive && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">sensível</span>}
                    </td>
                    <td className="px-3 py-2">{l.themes.join(", ")}</td>
                    <td className="px-3 py-2">{LESSON_STATUS[l.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
