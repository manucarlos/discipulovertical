"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { loadSettings } from "@/lib/features";
import { hasPassedQuiz, loadQuiz, readAnswers, submitQuizAnswers, validateReflection } from "@/lib/quiz";
import { loadTrail } from "@/lib/trail/queries";
import { findLesson } from "@/lib/trail/view";
import { isCycleComplete, type ReleaseLesson, type ReleaseProgress } from "@/lib/lessons/release";
import type { QuizState } from "./quiz-state";

/** Carrega a trilha e devolve a lição só se ela já está liberada para esta pessoa (RN-01). */
async function accessibleLesson(slug: string) {
  const { supabase, user } = await requireMember();
  const now = new Date();
  const trail = await loadTrail(supabase, user.id, now);
  const item = findLesson(trail, slug);
  if (!item || item.state.state === "locked") return null;
  const cycle = trail.cycles.find((c) => c.slug === item.cycleSlug);
  if (!cycle) return null;
  return { supabase, user, trail, item, cycle, now };
}

/** Registra a abertura da lição (primeiro acesso): cria o progresso "em andamento". */
export async function openLesson(slug: string): Promise<void> {
  const ctx = await accessibleLesson(slug);
  if (!ctx || ctx.item.state.state !== "available") return;
  const { supabase, user, item, cycle, now } = ctx;

  // ignoreDuplicates: se outra aba já abriu, não mexe no que existe.
  await supabase.from("lesson_progress").upsert(
    {
      user_id: user.id,
      lesson_id: item.id,
      status: "in_progress",
      released_at: now.toISOString(),
      started_at: now.toISOString(),
    },
    { onConflict: "user_id,lesson_id", ignoreDuplicates: true },
  );
  await supabase.from("cycle_progress").upsert(
    { user_id: user.id, cycle_id: cycle.id, status: "in_progress", started_at: now.toISOString() },
    { onConflict: "user_id,cycle_id", ignoreDuplicates: true },
  );
}

/** RF-09: guarda até onde a pessoa leu, para retomar depois. */
export async function saveReadingPosition(slug: string, position: number): Promise<void> {
  if (!Number.isFinite(position)) return;
  const ctx = await accessibleLesson(slug);
  if (!ctx || ctx.item.state.state === "completed") return;
  const clamped = Math.min(1, Math.max(0, position));

  await ctx.supabase
    .from("lesson_progress")
    .update({ last_position: Number(clamped.toFixed(4)), updated_at: ctx.now.toISOString() })
    .eq("user_id", ctx.user.id)
    .eq("lesson_id", ctx.item.id)
    .neq("status", "completed");
}

/** RF-10: botão "Concluir lição" (no MVP, sem quiz). Depois volta para a lista do ciclo. */
export async function completeLesson(slug: string): Promise<void> {
  const ctx = await accessibleLesson(slug);
  if (!ctx) redirect("/");
  const { supabase, user, item, cycle, now } = ctx;
  const nowIso = now.toISOString();

  // Já concluída: nada a gravar. Não reabre o ciclo, não mexe na data de conclusão e não repete a
  // comemoração de "ciclo concluído".
  if (item.state.state === "completed") redirect(`/ciclo/${cycle.slug}?concluida=${item.slug}`);

  // RN-02: com o quiz ligado, uma lição que tem perguntas só conclui depois de uma tentativa aprovada
  // (o banco também recusa, caso alguém contorne a tela).
  if ((await loadSettings(supabase)).flags.quiz) {
    const questions = await loadQuiz(supabase, item.id);
    if (questions.length > 0 && !(await hasPassedQuiz(supabase, user.id, item.id))) redirect(`/licao/${slug}?quiz=1`);
  }

  const { data: existing } = await supabase
    .from("lesson_progress")
    .select("released_at, started_at")
    .eq("user_id", user.id)
    .eq("lesson_id", item.id)
    .maybeSingle();

  const { error } = await supabase.from("lesson_progress").upsert(
    {
      user_id: user.id,
      lesson_id: item.id,
      status: "completed",
      released_at: existing?.released_at ?? nowIso,
      started_at: existing?.started_at ?? nowIso,
      completed_at: nowIso,
      last_position: 1,
      updated_at: nowIso,
    },
    { onConflict: "user_id,lesson_id" },
  );
  if (error) throw new Error(`Não foi possível concluir a lição: ${error.message}`);

  // RN-04: o ciclo termina quando todas as lições obrigatórias estão concluídas.
  const releaseLessons: ReleaseLesson[] = cycle.lessons.map((l) => ({
    id: l.id,
    cyclePosition: cycle.position,
    position: l.position,
    required: l.required,
    releaseIntervalDays: 0,
    maxLessonsPerWeek: 1,
  }));
  const progress: ReleaseProgress[] = cycle.lessons
    .filter((l) => l.state.state === "completed" || l.id === item.id)
    .map((l) => ({ lessonId: l.id, releasedAt: now, startedAt: now, completedAt: now }));
  const cycleDone = isCycleComplete(releaseLessons, progress);

  if (cycleDone) {
    await supabase.from("cycle_progress").upsert(
      { user_id: user.id, cycle_id: cycle.id, status: "completed", completed_at: nowIso },
      { onConflict: "user_id,cycle_id" },
    );
  }

  const params = new URLSearchParams({ concluida: item.slug });
  if (cycleDone) params.set("ciclo", "1");
  redirect(`/ciclo/${cycle.slug}?${params.toString()}`);
}

/** RF-12: corrige o quiz. Refazer é ilimitado; o gabarito fica no banco. */
export async function submitQuiz(slug: string, _previous: QuizState, formData: FormData): Promise<QuizState> {
  const ctx = await accessibleLesson(slug);
  if (!ctx) redirect("/");
  const { supabase, item } = ctx;
  try {
    const questions = await loadQuiz(supabase, item.id);
    if (questions.length === 0) return { status: "error", message: "Esta lição não tem quiz." };
    const answers = readAnswers(formData, questions);
    if (Object.keys(answers).length < questions.length) {
      return { status: "error", message: "Responda todas as perguntas antes de conferir." };
    }
    const result = await submitQuizAnswers(supabase, item.id, answers);
    revalidatePath(`/licao/${slug}`);
    return { status: "done", result };
  } catch {
    return { status: "error", message: "Não foi possível corrigir agora. Tente de novo em instantes." };
  }
}

/** RF-13: marca (ou desmarca) a prática. Autodeclarada: não bloqueia a conclusão. */
export async function togglePractice(slug: string, formData: FormData): Promise<void> {
  const ctx = await accessibleLesson(slug);
  if (!ctx) redirect("/");
  const { supabase, user, item, now } = ctx;
  if (!(await loadSettings(supabase)).flags.reflections) redirect(`/licao/${slug}`);

  await supabase
    .from("lesson_progress")
    .update({ practice_done: formData.get("done") === "1", updated_at: now.toISOString() })
    .eq("user_id", user.id)
    .eq("lesson_id", item.id);
  redirect(`/licao/${slug}?salvo=pratica#reflexao-titulo`);
}

/** RF-13: guarda a reflexão privada (uma por lição). Texto em branco apaga a reflexão. */
export async function saveReflection(slug: string, formData: FormData): Promise<void> {
  const ctx = await accessibleLesson(slug);
  if (!ctx) redirect("/");
  const { supabase, user, item } = ctx;
  if (!(await loadSettings(supabase)).flags.reflections) redirect(`/licao/${slug}`);

  const checked = validateReflection(String(formData.get("body") ?? ""));
  if (!checked.ok) redirect(`/licao/${slug}?erro=${encodeURIComponent(checked.error)}#reflexao-titulo`);
  else if (checked.body === "") {
    await supabase.from("reflections").delete().eq("user_id", user.id).eq("lesson_id", item.id);
  } else {
    const { error } = await supabase
      .from("reflections")
      .upsert({ user_id: user.id, lesson_id: item.id, body: checked.body }, { onConflict: "user_id,lesson_id" });
    if (error) redirect(`/licao/${slug}?erro=${encodeURIComponent("Não foi possível salvar a reflexão. Tente de novo.")}#reflexao-titulo`);
  }
  redirect(`/licao/${slug}?salvo=reflexao#reflexao-titulo`);
}
