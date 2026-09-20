import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { StatusBadge } from "@/components/admin/lesson-editor";
import { LessonView } from "@/components/lesson-view";
import { ReadingShell } from "@/components/reading-shell";
import { loadLessonForEditing } from "@/lib/admin/queries";
import { requireStaff } from "@/lib/auth";
import { createExternalLinkProvider } from "@/lib/bible/provider";
import { resolvePassageLinks } from "@/lib/bible/resolve";
import { collectLessonTexts } from "@/lib/content/text";
import { loadBibleVersions } from "@/lib/trail/queries";

export const metadata = { title: "Pré-visualização · Conteúdo" };

/** Mostra a versão SALVA da lição exatamente como o membro a vê (mesmos componentes da tela de leitura). */
export default async function LessonPreviewPage(props: PageProps<"/admin/licao/[slug]/previa">) {
  await connection();
  const { slug } = await props.params;
  const { supabase, profile } = await requireStaff();

  const lesson = await loadLessonForEditing(supabase, slug);
  if (!lesson) notFound();

  const versions = await loadBibleVersions(supabase);
  const links = await resolvePassageLinks(
    createExternalLinkProvider(versions),
    [...collectLessonTexts(lesson.content), ...(lesson.keyVerse ? [lesson.keyVerse] : [])],
    profile.bible_version,
  );

  return (
    <ReadingShell initialPosition={null} completed={false}>
      <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">
          Pré-visualização da versão salva <StatusBadge status={lesson.status} />
        </p>
        <p className="mt-1">
          É assim que o membro verá a lição. Alterações ainda não salvas no editor não aparecem aqui.{" "}
          {lesson.hasPlaceholders && "Trechos [PREENCHER] aparecem destacados e só existem em rascunho."}
        </p>
        <Link href={`/admin/licao/${slug}`} className="mt-2 inline-block underline">
          ← Voltar ao editor
        </Link>
      </div>

      <LessonView
        title={lesson.title}
        objective={lesson.objective}
        estimatedMinutes={lesson.estimatedMinutes}
        tags={lesson.tags}
        keyVerse={lesson.keyVerse || null}
        content={lesson.content}
        links={links}
        versionCode={profile.bible_version}
        footer={
          <button type="button" disabled className="w-full rounded-xl bg-brand px-5 py-4 text-lg font-medium text-on-brand opacity-60">
            Concluir lição
          </button>
        }
      />
    </ReadingShell>
  );
}
