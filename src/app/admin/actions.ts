"use server";

import { redirect } from "next/navigation";
import { describeEditorError } from "@/lib/admin/errors";
import { validateCycleSettings } from "@/lib/admin/cycle";
import { requireStaff } from "@/lib/auth";

const back = (params: Record<string, string>): never => redirect(`/admin/trilha?${new URLSearchParams(params).toString()}`);

/** Cria uma lição vazia (rascunho) no fim do ciclo e abre o editor. */
export async function createLesson(cycleId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireStaff();
  const title = String(formData.get("title") ?? "").trim();
  if (title === "") back({ erro: "Escreva o título da nova lição." });

  const { data, error } = await supabase.rpc("create_lesson", { p_cycle_id: cycleId, p_title: title });
  if (error) back({ erro: describeEditorError(error).message });
  redirect(`/admin/licao/${data as string}`);
}

/** Sobe ou desce uma lição dentro do ciclo. */
export async function moveLesson(lessonId: string, direction: "up" | "down"): Promise<void> {
  const { supabase } = await requireStaff();
  const { error } = await supabase.rpc("move_lesson", { p_lesson_id: lessonId, p_direction: direction });
  if (error) back({ erro: describeEditorError(error).message });
  redirect("/admin/trilha");
}

/** Configurações do ciclo (nome, semanas e regras de liberação): só o Admin. */
export async function saveCycleSettings(cycleId: string, formData: FormData): Promise<void> {
  const { supabase, role } = await requireStaff();
  if (role !== "admin") back({ erro: "Só o administrador altera as configurações do ciclo." });

  const parsed = validateCycleSettings({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    plannedWeeks: String(formData.get("plannedWeeks") ?? ""),
    releaseIntervalDays: String(formData.get("releaseIntervalDays") ?? ""),
    maxLessonsPerWeek: String(formData.get("maxLessonsPerWeek") ?? ""),
    active: formData.get("active") === "on",
  });
  if (!parsed.ok) back({ erro: parsed.error });
  else {
    const { error } = await supabase.from("cycles").update(parsed.values).eq("id", cycleId);
    if (error) back({ erro: describeEditorError(error).message });
    back({ ok: "Configurações do ciclo salvas." });
  }
}
