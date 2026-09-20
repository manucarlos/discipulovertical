"use server";

import { describeEditorError } from "@/lib/admin/errors";
import { findTransition, type LessonStatus } from "@/lib/admin/status";
import { requireStaff } from "@/lib/auth";
import { validateLessonDraft } from "@/lib/content/draft";
import { findPlaceholders } from "@/lib/content/placeholders";

export type SaveResult =
  | { ok: true; versionId: string; hasPlaceholders: boolean }
  | { ok: false; error: string; conflict: boolean };

export type SimpleResult = { ok: true } | { ok: false; error: string };

/**
 * Salva a lição inteira numa transação (save_lesson). `expectedVersion` é a versão que a pessoa viu;
 * se outra pessoa salvou depois, o banco recusa em vez de sobrescrever.
 */
export async function saveLesson(slug: string, expectedVersion: string | null, input: unknown): Promise<SaveResult> {
  const { supabase } = await requireStaff();

  const parsed = validateLessonDraft(input);
  if (!parsed.ok) return { ok: false, error: parsed.error, conflict: false };
  const draft = parsed.draft;

  const { data: lesson } = await supabase.from("lessons").select("id").eq("slug", slug).maybeSingle();
  if (!lesson) return { ok: false, error: "Lição não encontrada.", conflict: false };

  const { data, error } = await supabase.rpc("save_lesson", {
    p_lesson_id: lesson.id,
    p_expected_version: expectedVersion,
    p_fields: draft.fields,
    p_content: draft.content,
    p_notes: draft.notes,
    p_quiz: draft.quiz,
    p_note: draft.note,
  });
  if (error) {
    const friendly = describeEditorError(error);
    return { ok: false, error: friendly.message, conflict: friendly.conflict };
  }

  const pending = findPlaceholders(draft.content, {
    pastoralReviewNote: draft.notes.pastoral_review_note,
    videoSuggestion: draft.notes.video_suggestion,
    draftNotice: draft.notes.draft_notice,
    buttonSuggestion: draft.notes.button_suggestion,
  });
  return { ok: true, versionId: data as string, hasPlaceholders: pending.length > 0 };
}

/** Muda o status da lição (enviar para revisão, publicar, arquivar...), conforme o papel da pessoa. */
export async function changeLessonStatus(slug: string, to: LessonStatus): Promise<SimpleResult> {
  const { supabase, role } = await requireStaff();

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, status, has_placeholders")
    .eq("slug", slug)
    .maybeSingle();
  if (!lesson) return { ok: false, error: "Lição não encontrada." };

  const transition = findTransition(role, lesson.status as LessonStatus, to, lesson.has_placeholders);
  if (!transition) return { ok: false, error: "Esta mudança de status não é permitida para o seu perfil." };
  if (transition.blockedReason) return { ok: false, error: transition.blockedReason };

  // .eq("status", ...) garante que só muda se ninguém mudou antes.
  const { data, error } = await supabase
    .from("lessons")
    .update({ status: to })
    .eq("id", lesson.id)
    .eq("status", lesson.status)
    .select("id");
  if (error) return { ok: false, error: describeEditorError(error).message };
  if (!data || data.length === 0) {
    return { ok: false, error: "O status da lição mudou enquanto você olhava. Recarregue a página." };
  }
  return { ok: true };
}

/** Restaura uma versão antiga como versão nova (o histórico só cresce). */
export async function restoreLessonVersion(
  slug: string,
  versionId: string,
  expectedVersion: string | null,
): Promise<SimpleResult> {
  const { supabase } = await requireStaff();
  const { data: lesson } = await supabase.from("lessons").select("id").eq("slug", slug).maybeSingle();
  if (!lesson) return { ok: false, error: "Lição não encontrada." };

  const { error } = await supabase.rpc("restore_lesson_version", {
    p_lesson_id: lesson.id,
    p_version_id: versionId,
    p_expected_version: expectedVersion,
  });
  if (error) return { ok: false, error: describeEditorError(error).message };
  return { ok: true };
}
