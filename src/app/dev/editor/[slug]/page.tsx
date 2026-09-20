import { notFound } from "next/navigation";
import { connection } from "next/server";
import { LessonEditor } from "@/components/admin/lesson-editor";
import type { LessonForEditing } from "@/lib/admin/queries";
import type { LessonStatus } from "@/lib/admin/status";
import { loadDevCycles } from "@/lib/dev-fixtures";
import { devChangeStatus, devRestore, devSave } from "./actions";

/**
 * Pré-visualização do editor de lições com conteúdo do handoff e ações de mentirinha.
 * Só em desenvolvimento. Use ?role=editor|admin e ?status=draft|in_review|published|archived.
 */
export default async function DevEditorPage(props: PageProps<"/dev/editor/[slug]">) {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();
  const { slug } = await props.params;
  const search = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const cycles = loadDevCycles();
  const cycle = cycles.find((c) => c.lessons.some((l) => l.id === slug));
  const l = cycle?.lessons.find((x) => x.id === slug);
  if (!cycle || !l) notFound();

  const role = one(search.role) === "editor" ? "editor" : "admin";
  const status = (["draft", "in_review", "published", "archived"] as const).find((s) => s === one(search.status)) ?? "draft";

  const lesson: LessonForEditing = {
    id: l.id,
    slug: l.id,
    cycleId: cycle.slug,
    cycleTitle: `Ciclo ${cycle.number} · ${cycle.title}`,
    title: l.title,
    objective: l.objective,
    keyVerse: l.keyVerse,
    estimatedMinutes: l.estimatedMinutes,
    tags: l.tags,
    required: true,
    sensitive: false,
    status: status as LessonStatus,
    hasPlaceholders: l.hasPlaceholders,
    currentVersionId: "dev-v3",
    content: l.content,
    notes: {
      pastoralReviewNote: l.internal.pastoralReviewNote ?? "",
      videoSuggestion: l.internal.videoSuggestion ?? "",
      draftNotice: l.internal.draftNotice ?? "",
      buttonSuggestion: l.internal.buttonSuggestion ?? "",
    },
    quiz: l.quiz.map((q) => ({ prompt: q.prompt, options: q.options, correct: q.correct, explanation: q.explanation })),
    versions: [
      { id: "dev-v3", createdAt: "2026-09-19T17:30:00Z", note: "Ajuste da abertura", authorName: "Maria (editora)" },
      { id: "dev-v2", createdAt: "2026-09-18T13:10:00Z", note: null, authorName: "Pastor" },
      { id: "dev-v1", createdAt: "2026-09-14T09:00:00Z", note: "Importação inicial do handoff", authorName: null },
    ],
  };

  return (
    <main className="flex-1 px-4 pb-16">
      <p className="mx-auto mb-4 mt-4 max-w-3xl rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
        Pré-visualização do editor (só em desenvolvimento): nada é gravado. Papel: <strong>{role}</strong> · status: <strong>{status}</strong>.
      </p>
      <LessonEditor
        lesson={lesson}
        role={role}
        previewHref={`/dev/licao/${slug}`}
        actions={{ save: devSave, changeStatus: devChangeStatus, restore: devRestore }}
      />
    </main>
  );
}
