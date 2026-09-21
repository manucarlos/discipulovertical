"use server";

import { describeEditorError } from "@/lib/admin/errors";
import { validateFeedback } from "@/lib/feedback";
import { createAnonClient } from "@/lib/supabase/anon";

export type FeedbackState = { error: string } | { done: true } | null;

/**
 * Grava a resposta do formulário de feedback (RF-32). É PÚBLICO de propósito (quem não consegue entrar também
 * precisa avisar), então não há sessão para conferir: o que protege é (1) o campo-isca abaixo, (2) a validação
 * daqui e (3) a função do banco, que confere a chave "feedback" ligada e o limite de respostas por hora.
 */
export async function submitFeedback(_previous: FeedbackState, formData: FormData): Promise<FeedbackState> {
  // Campo-isca, escondido das pessoas: só robôs o preenchem. Finge sucesso e não grava.
  if (String(formData.get("website") ?? "") !== "") return { done: true };

  const text = (name: string) => String(formData.get(name) ?? "");
  const result = validateFeedback({
    device: text("device"),
    entered: text("entered"),
    lessonDone: text("lessonDone"),
    ease: text("ease"),
    alone: text("alone"),
    liked: text("liked"),
    confusing: text("confusing"),
    suggestion: text("suggestion"),
    contactName: text("contactName"),
    contact: text("contact"),
  });
  if (!result.ok) return { error: result.error };

  const supabase = createAnonClient();
  if (!supabase) return { error: "O formulário não está disponível agora." };

  const v = result.value;
  const { error } = await supabase.rpc("submit_feedback", {
    p_device: v.device,
    p_entered: v.entered,
    p_lesson_done: v.lessonDone,
    p_ease: v.ease,
    p_alone: v.alone,
    p_liked: v.liked,
    p_confusing: v.confusing,
    p_suggestion: v.suggestion,
    p_contact_name: v.contactName,
    p_contact: v.contact,
  });
  if (error) return { error: describeEditorError(error).message };
  return { done: true };
}
