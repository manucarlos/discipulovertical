import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LessonView } from "@/components/lesson-view";
import { ReadingShell } from "@/components/reading-shell";
import { createExternalLinkProvider } from "@/lib/bible/provider";
import { resolvePassageLinks } from "@/lib/bible/resolve";
import { requireMember } from "@/lib/auth";
import { collectLessonTexts } from "@/lib/content/text";
import { loadBibleVersions, loadLessonDetail, loadTrail } from "@/lib/trail/queries";
import { findLesson } from "@/lib/trail/view";
import { completeLesson, openLesson, saveReadingPosition } from "./actions";

export const metadata = { title: "Lição" };

export default async function LessonPage(props: PageProps<"/licao/[slug]">) {
  const { slug } = await props.params;
  const { supabase, user, profile } = await requireMember();

  const trail = await loadTrail(supabase, user.id);
  const item = findLesson(trail, slug);
  if (!item) notFound();
  // RN-01: lição ainda não liberada volta para a lista do ciclo, que mostra quando ela abre.
  if (item.state.state === "locked") redirect(`/ciclo/${item.cycleSlug}?bloqueada=1`);

  const [detail, versions] = await Promise.all([loadLessonDetail(supabase, slug), loadBibleVersions(supabase)]);
  if (!detail) notFound();

  const provider = createExternalLinkProvider(versions);
  const links = await resolvePassageLinks(
    provider,
    [...collectLessonTexts(detail.content), ...(detail.keyVerseRef ? [detail.keyVerseRef] : [])],
    profile.bible_version,
  );

  const completed = item.state.state === "completed";
  const next = trail.current?.lessons.find(
    (l) => l.slug !== slug && (l.state.state === "available" || l.state.state === "in_progress"),
  );

  const footer = completed ? (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
      <p className="font-serif text-xl">Você já concluiu esta lição.</p>
      <Link href={`/ciclo/${item.cycleSlug}`} className="mt-2 inline-block text-sm underline">
        Voltar para o ciclo
      </Link>
    </div>
  ) : (
    <form action={completeLesson.bind(null, slug)}>
      <button
        type="submit"
        className="w-full rounded-xl bg-brand px-5 py-4 text-lg font-medium text-on-brand transition hover:bg-brand-strong"
      >
        Concluir lição
      </button>
      <p className="mt-2 text-center text-sm text-muted">
        {next ? "Depois você segue para a próxima quando ela for liberada." : "Você pode reler esta lição quando quiser."}
      </p>
    </form>
  );

  return (
    <ReadingShell
      initialPosition={item.lastPosition}
      completed={completed}
      openAction={openLesson.bind(null, slug)}
      saveAction={saveReadingPosition.bind(null, slug)}
    >
      <LessonView
        title={detail.title}
        objective={detail.objective}
        estimatedMinutes={detail.estimatedMinutes}
        tags={detail.tags}
        keyVerse={detail.keyVerseRef}
        content={detail.content}
        links={links}
        versionCode={profile.bible_version}
        footer={footer}
      />
    </ReadingShell>
  );
}
