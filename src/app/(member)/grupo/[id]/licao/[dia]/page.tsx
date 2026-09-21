import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { LessonView } from "@/components/lesson-view";
import { ReadingShell } from "@/components/reading-shell";
import { createExternalLinkProvider } from "@/lib/bible/provider";
import { resolvePassageLinks } from "@/lib/bible/resolve";
import { requireGroups } from "@/lib/auth";
import { collectLessonTexts } from "@/lib/content/text";
import { loadSettings } from "@/lib/features";
import { releasedDays } from "@/lib/groups/calendar";
import { isUuid, SENSITIVE_NOTICE } from "@/lib/groups/forms";
import { loadGroupContext, loadMyDayProgress, loadMyGroups } from "@/lib/groups/queries";
import { REFLECTION_MAX } from "@/lib/quiz";
import { loadBibleVersions, loadLessonDetail } from "@/lib/trail/queries";
import { completeGroupLesson, saveGroupReflection, toggleGroupChallenge } from "../../../actions";

export const metadata = { title: "Lição do dia" };

const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand";

/** Lição do dia do grupo: texto, reflexão (com a escolha de compartilhar), desafio e, nas sensíveis, o pedido de ajuda (RG-09). */
export default async function GroupLessonPage(props: PageProps<"/grupo/[id]/licao/[dia]">) {
  await connection();
  const { id, dia } = await props.params;
  const day = Number(dia);
  if (!isUuid(id) || !Number.isInteger(day) || day < 1) notFound();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { supabase, user, profile } = await requireGroups();

  const membership = (await loadMyGroups(supabase, user.id)).find((m) => m.group.id === id);
  if (!membership) notFound();
  const ctx = await loadGroupContext(supabase, id);
  const lesson = ctx?.days.find((d) => d.day === day);
  if (!ctx || !lesson) notFound();
  // RG-01: lição ainda não liberada volta para o calendário do grupo.
  if (releasedDays(ctx.schedule, new Date()) < day) redirect(`/grupo/${id}`);

  const [detail, versions, mine, settings] = await Promise.all([
    loadLessonDetail(supabase, lesson.slug),
    loadBibleVersions(supabase),
    loadMyDayProgress(supabase, user.id, id, lesson.lessonId),
    loadSettings(supabase),
  ]);
  if (!detail) notFound();
  const links = await resolvePassageLinks(
    createExternalLinkProvider(versions),
    [...collectLessonTexts(detail.content), ...(detail.keyVerseRef ? [detail.keyVerseRef] : [])],
    profile.bible_version,
  );

  const saved = first(search.salvo);
  const erro = first(search.erro);
  // Reflexões começam compartilhadas nas lições comuns e privadas nas sensíveis (RG-07); o discípulo muda quando quiser.
  const shareDefault = mine.reflection ? mine.shared : !lesson.sensitive;

  return (
    <ReadingShell initialPosition={null} completed={mine.completed}>
      <p className="mb-4 text-sm">
        <Link href={`/grupo/${id}`} className="text-muted underline">
          ← {ctx.group.name}
        </Link>{" "}
        · Dia {day} de {ctx.days.length}
      </p>
      {lesson.sensitive && (
        <div role="note" className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <p className="text-sm">{SENSITIVE_NOTICE}</p>
          <Link href={`/grupo/${id}/ajuda?licao=${lesson.lessonId}`} className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 py-2 text-sm font-medium text-on-brand hover:bg-brand-strong">
            Pedir ajuda pastoral
          </Link>
        </div>
      )}
      <LessonView
        title={detail.title}
        objective={detail.objective}
        estimatedMinutes={detail.estimatedMinutes}
        tags={detail.tags}
        keyVerse={detail.keyVerseRef}
        content={detail.content}
        links={links}
        versionCode={profile.bible_version}
        video={settings.flags.video ? (detail.content.video ?? null) : null}
        extras={
          <>
            {erro && (
              <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
                {erro}
              </p>
            )}
            <section aria-labelledby="desafio" className="mt-6 rounded-2xl border border-line bg-card p-5">
              <h2 id="desafio" className="font-serif text-2xl">
                Seu desafio de hoje
              </h2>
              <form action={toggleGroupChallenge.bind(null, id, day)} className="mt-3">
                <input type="hidden" name="done" value={mine.challengeDone ? "0" : "1"} />
                <button
                  type="submit"
                  aria-pressed={mine.challengeDone}
                  className={`inline-flex min-h-11 items-center rounded-xl border px-4 py-2 font-medium ${mine.challengeDone ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-line hover:bg-tint"}`}
                >
                  {mine.challengeDone ? "✓ Desafio feito (toque para desmarcar)" : "Marcar o desafio como feito"}
                </button>
                {saved === "desafio" && (
                  <span role="status" className="ml-3 text-sm text-muted">
                    Salvo.
                  </span>
                )}
              </form>
            </section>

            <section aria-labelledby="reflexao-titulo" className="mt-6 rounded-2xl border border-line bg-card p-5">
              <h2 id="reflexao-titulo" className="font-serif text-2xl">
                Sua reflexão
              </h2>
              {detail.content.reflection && <p className="mt-2 font-serif text-lg">{detail.content.reflection}</p>}
              <form action={saveGroupReflection.bind(null, id, day)} className="mt-3 space-y-3">
                <label htmlFor="reflexao" className="sr-only">
                  Sua reflexão
                </label>
                <textarea id="reflexao" name="body" defaultValue={mine.reflection} rows={5} maxLength={REFLECTION_MAX} className={inputClass} />
                <label className="flex min-h-11 cursor-pointer items-start gap-3">
                  <input type="checkbox" name="shared" defaultChecked={shareDefault} className="mt-1 size-5 shrink-0 accent-[var(--brand)]" />
                  <span className="text-sm">
                    Compartilhar esta reflexão com o meu discipulador.
                    {lesson.sensitive && <span className="block text-muted">Nesta lição ela começa privada; você decide.</span>}
                  </span>
                </label>
                <div className="flex items-center gap-3">
                  <button type="submit" className="rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong">
                    Salvar reflexão
                  </button>
                  {saved === "reflexao" && (
                    <span role="status" className="text-sm text-muted">
                      Reflexão salva.
                    </span>
                  )}
                </div>
              </form>
            </section>
          </>
        }
        footer={
          mine.completed ? (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">Você já concluiu esta lição.</p>
          ) : (
            <form action={completeGroupLesson.bind(null, id, day)}>
              <button type="submit" className="w-full rounded-xl bg-brand px-5 py-4 text-lg font-medium text-on-brand hover:bg-brand-strong">
                Concluir lição
              </button>
            </form>
          )
        }
      />
    </ReadingShell>
  );
}
