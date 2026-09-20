"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { loadTrail } from "@/lib/trail/queries";
import { findLesson } from "@/lib/trail/view";
import { isCycleComplete, type ReleaseLesson, type ReleaseProgress } from "@/lib/lessons/release";

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

  if (item.state.state !== "completed") {
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
  }

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
