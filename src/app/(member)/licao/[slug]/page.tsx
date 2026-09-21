import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LessonView } from "@/components/lesson-view";
import { PracticeSection } from "@/components/practice-section";
import { QuizForm } from "@/components/quiz-form";
import { ReadingShell } from "@/components/reading-shell";
import { createExternalLinkProvider } from "@/lib/bible/provider";
import { resolvePassageLinks } from "@/lib/bible/resolve";
import { requireMember } from "@/lib/auth";
import { collectLessonTexts } from "@/lib/content/text";
import { loadSettings } from "@/lib/features";
import { hasPassedQuiz, loadQuiz, passingScore } from "@/lib/quiz";
import { loadBibleVersions, loadLessonDetail, loadTrail } from "@/lib/trail/queries";
import { findLesson } from "@/lib/trail/view";
import { completeLesson, openLesson, saveReadingPosition, saveReflection, submitQuiz, togglePractice } from "./actions";

export const metadata = { title: "Lição" };

/**
 * RN-11: uma lição que saiu da trilha (arquivada) continua aberta, só para leitura, para quem já a concluiu.
 * Para os demais ela não existe (a RLS do banco não a entrega a quem não tem progresso nela).
 */
async function archivedLesson(slug: string) {
  const { supabase, profile } = await requireMember();
  const [detail, versions] = await Promise.all([loadLessonDetail(supabase, slug, "archived"), loadBibleVersions(supabase)]);
  if (!detail) notFound();

  const links = await resolvePassageLinks(
    createExternalLinkProvider(versions),
    [...collectLessonTexts(detail.content), ...(detail.keyVerseRef ? [detail.keyVerseRef] : [])],
    profile.bible_version,
  );
  return (
    <ReadingShell initialPosition={null} completed>
      <p role="status" className="mb-6 rounded-xl bg-lilac px-4 py-3 text-sm text-muted">
        Esta lição saiu da trilha (foi arquivada), mas você a concluiu e pode reler quando quiser.
      </p>
      <LessonView
        title={detail.title}
        objective={detail.objective}
        estimatedMinutes={detail.estimatedMinutes}
        tags={detail.tags}
        keyVerse={detail.keyVerseRef}
        content={detail.content}
        links={links}
        versionCode={profile.bible_version}
        footer={
          <Link href="/" className="text-sm underline">
            ← Minha trilha
          </Link>
        }
      />
    </ReadingShell>
  );
}

export default async function LessonPage(props: PageProps<"/licao/[slug]">) {
  const { slug } = await props.params;
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const { supabase, user, profile } = await requireMember();

  const trail = await loadTrail(supabase, user.id);
  const item = findLesson(trail, slug);
  if (!item) return await archivedLesson(slug);
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
  const { flags } = await loadSettings(supabase);

  // RF-12 / RN-02: com o quiz ligado, a lição que tem perguntas só conclui depois de acertar 2 de 3.
  const questions = flags.quiz && !completed ? await loadQuiz(supabase, item.id) : [];
  const quizPassed = questions.length > 0 ? await hasPassedQuiz(supabase, user.id, item.id) : true;

  // RF-13: prática autodeclarada e reflexão privada.
  let practiceDone = false;
  let reflection = "";
  if (flags.reflections) {
    const [progressRes, reflectionRes] = await Promise.all([
      supabase.from("lesson_progress").select("practice_done").eq("user_id", user.id).eq("lesson_id", item.id).maybeSingle(),
      supabase.from("reflections").select("body").eq("user_id", user.id).eq("lesson_id", item.id).maybeSingle(),
    ]);
    practiceDone = progressRes.data?.practice_done === true;
    reflection = (reflectionRes.data?.body as string | undefined) ?? "";
  }
  const saved = first(search.salvo) === "pratica" || first(search.salvo) === "reflexao" ? (first(search.salvo) as "pratica" | "reflexao") : undefined;
  const errorMessage = first(search.erro);

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
  ) : !quizPassed ? (
    <p role={first(search.quiz) === "1" ? "alert" : undefined} className="rounded-xl bg-lilac px-4 py-3 text-center text-sm">
      Responda ao quiz acima e acerte pelo menos {passingScore(questions.length)} de {questions.length} para concluir a lição.
    </p>
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
        video={flags.video ? (detail.content.video ?? null) : null}
        extras={
          <>
            {errorMessage && (
              <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
                {errorMessage}
              </p>
            )}
            {flags.reflections && (
              <PracticeSection
                practiceDone={practiceDone}
                reflection={reflection}
                question={detail.content.reflection}
                practiceAction={togglePractice.bind(null, slug)}
                reflectionAction={saveReflection.bind(null, slug)}
                saved={saved}
              />
            )}
            {questions.length > 0 && <QuizForm questions={questions} action={submitQuiz.bind(null, slug)} alreadyPassed={quizPassed} />}
          </>
        }
        footer={footer}
      />
    </ReadingShell>
  );
}
