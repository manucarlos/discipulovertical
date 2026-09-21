import type { SupabaseClient } from "@supabase/supabase-js";

export interface QuizQuestion {
  position: number;
  prompt: string;
  options: Record<string, string>;
}

export interface QuizResult {
  correctCount: number;
  total: number;
  passed: boolean;
  results: { position: number; correct: boolean; explanation: string }[];
}

export const REFLECTION_MAX = 5000;

/** Quantos acertos aprovam (RN-02): 2 de 3; nunca menos de 1. Espelha a regra do banco, só para mostrar ao membro. */
export const passingScore = (total: number): number => Math.max(1, Math.ceil((total * 2) / 3));

/** As perguntas da lição, sem a resposta certa (a função do banco não a entrega). Vazio se o quiz estiver desligado. */
export async function loadQuiz(supabase: SupabaseClient, lessonId: string): Promise<QuizQuestion[]> {
  const { data, error } = await supabase.rpc("get_quiz", { p_lesson: lessonId });
  if (error) throw new Error(`Falha ao carregar o quiz: ${error.message}`);
  return ((data ?? []) as QuizQuestion[]).map((q) => ({ position: q.position, prompt: q.prompt, options: q.options }));
}

interface AttemptPayload {
  correct_count: number;
  total: number;
  passed: boolean;
  results: { position: number; correct: boolean; explanation: string }[];
}

/** Corrige as respostas no banco e devolve o resultado. */
export async function submitQuizAnswers(
  supabase: SupabaseClient,
  lessonId: string,
  answers: Record<string, string>,
): Promise<QuizResult> {
  const { data, error } = await supabase.rpc("submit_quiz", { p_lesson: lessonId, p_answers: answers });
  if (error) throw new Error(error.message);
  const r = data as AttemptPayload;
  return { correctCount: r.correct_count, total: r.total, passed: r.passed, results: r.results };
}

/** Lê as respostas do formulário: uma alternativa por pergunta (campo `q<posição>`), só das alternativas que existem. */
export function readAnswers(form: { get(name: string): FormDataEntryValue | null }, questions: QuizQuestion[]): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const q of questions) {
    const value = form.get(`q${q.position}`);
    if (typeof value === "string" && value in q.options) answers[String(q.position)] = value;
  }
  return answers;
}

/** A pessoa já foi aprovada no quiz desta lição? */
export async function hasPassedQuiz(supabase: SupabaseClient, userId: string, lessonId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("quiz_attempts")
    .select("id")
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .eq("passed", true)
    .limit(1);
  if (error) throw new Error(`Falha ao consultar o quiz: ${error.message}`);
  return (data ?? []).length > 0;
}

export type ReflectionCheck = { ok: true; body: string } | { ok: false; error: string };

/** Valida o texto da reflexão. Texto vazio não é erro no formulário: quem o envia vazio quer apagar (tratado na ação). */
export function validateReflection(raw: string): ReflectionCheck {
  const body = raw.replace(/\r\n/g, "\n").trim();
  if (body.length > REFLECTION_MAX) return { ok: false, error: `A reflexão pode ter no máximo ${REFLECTION_MAX} caracteres.` };
  return { ok: true, body };
}
