"use server";

import { validateLessonDraft } from "@/lib/content/draft";
import { findPlaceholders } from "@/lib/content/placeholders";

/**
 * Ações de MENTIRINHA para a pré-visualização do editor (/dev/editor): não gravam nada, mas passam
 * pela validação de verdade, então erros de preenchimento aparecem como aparecerão em produção.
 */
export async function devSave(expectedVersion: string | null, input: unknown) {
  if (process.env.NODE_ENV === "production") throw new Error("indisponível");
  const parsed = validateLessonDraft(input);
  if (!parsed.ok) return { ok: false as const, error: parsed.error, conflict: false };
  const pending = findPlaceholders(parsed.draft.content, {
    pastoralReviewNote: parsed.draft.notes.pastoral_review_note,
    videoSuggestion: parsed.draft.notes.video_suggestion,
    draftNotice: parsed.draft.notes.draft_notice,
    buttonSuggestion: parsed.draft.notes.button_suggestion,
  });
  return { ok: true as const, versionId: `${expectedVersion ?? "v"}+`, hasPlaceholders: pending.length > 0 };
}

export async function devChangeStatus() {
  if (process.env.NODE_ENV === "production") throw new Error("indisponível");
  return { ok: true as const };
}

export async function devRestore() {
  if (process.env.NODE_ENV === "production") throw new Error("indisponível");
  return { ok: true as const };
}
