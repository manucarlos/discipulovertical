import { notFound } from "next/navigation";
import { connection } from "next/server";
import { LessonView } from "@/components/lesson-view";
import { ReadingShell } from "@/components/reading-shell";
import { createExternalLinkProvider } from "@/lib/bible/provider";
import { resolvePassageLinks } from "@/lib/bible/resolve";
import { collectLessonTexts } from "@/lib/content/text";
import { DEV_BIBLE_VERSIONS, loadDevCycles } from "@/lib/dev-fixtures";

/** Pré-visualização de uma lição do handoff, como o membro vê. Só em desenvolvimento. */
export default async function DevLessonPage(props: PageProps<"/dev/licao/[slug]">) {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();
  const { slug } = await props.params;
  const search = await props.searchParams;
  const version = search.v === "NVI" ? "NVI" : "NTLH";

  const lesson = loadDevCycles().flatMap((c) => c.lessons).find((l) => l.id === slug);
  if (!lesson) notFound();

  const links = await resolvePassageLinks(
    createExternalLinkProvider(DEV_BIBLE_VERSIONS),
    [...collectLessonTexts(lesson.content), lesson.keyVerse],
    version,
  );

  return (
    <ReadingShell initialPosition={null} completed={false}>
      <p className="mb-4 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
        Pré-visualização (só em desenvolvimento){lesson.hasPlaceholders ? " · rascunho com [PREENCHER]" : ""}.
      </p>
      <LessonView
        title={lesson.title}
        objective={lesson.objective}
        estimatedMinutes={lesson.estimatedMinutes}
        tags={lesson.tags}
        keyVerse={lesson.keyVerse}
        content={lesson.content}
        links={links}
        versionCode={version}
        footer={
          <button type="button" className="w-full rounded-xl bg-brand px-5 py-4 text-lg font-medium text-white">
            Concluir lição
          </button>
        }
      />
    </ReadingShell>
  );
}
