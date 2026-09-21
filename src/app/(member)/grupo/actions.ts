"use server";

import { redirect } from "next/navigation";
import { describeEditorError } from "@/lib/admin/errors";
import { requireGroups } from "@/lib/auth";
import { releasedDays } from "@/lib/groups/calendar";
import { GROUP_CONSENT_VERSION, isUuid, validateHelpRequest } from "@/lib/groups/forms";
import { loadGroupContext } from "@/lib/groups/queries";
import { REFLECTION_MAX } from "@/lib/quiz";

/** Entrar num grupo pelo código do convite, aceitando o consentimento (RG-08). */
export async function joinGroup(formData: FormData): Promise<void> {
  const { supabase } = await requireGroups();
  const code = String(formData.get("codigo") ?? "").trim();
  if (formData.get("consent") !== "on") redirect(`/grupo/entrar?codigo=${encodeURIComponent(code)}&erro=${encodeURIComponent("Para entrar, aceite o que o discipulador vai ver.")}`);
  const { data, error } = await supabase.rpc("join_group", { p_code: code, p_consent_version: GROUP_CONSENT_VERSION });
  if (error) redirect(`/grupo/entrar?codigo=${encodeURIComponent(code)}&erro=${encodeURIComponent(describeEditorError(error).message)}`);
  redirect(`/grupo/${data as string}?ok=${encodeURIComponent("Você entrou no grupo. Bem-vindo(a)!")}`);
}

/** Sair do grupo: o discipulador deixa de ver a leitura e as reflexões (RG-08). */
export async function leaveGroup(groupId: string): Promise<void> {
  const { supabase } = await requireGroups();
  if (!isUuid(groupId)) redirect("/grupo");
  const { error } = await supabase.rpc("leave_group", { p_group: groupId });
  if (error) redirect(`/grupo/${groupId}?erro=${encodeURIComponent(describeEditorError(error).message)}`);
  redirect(`/grupo?ok=${encodeURIComponent("Você saiu do grupo.")}`);
}

/** Confere que a lição do dia N já foi liberada para o grupo (RG-01) e devolve o que a ação precisa. */
async function releasedLesson(groupId: string, day: number) {
  const ctx = await requireGroups();
  if (!isUuid(groupId) || !Number.isInteger(day) || day < 1) return null;
  const group = await loadGroupContext(ctx.supabase, groupId);
  const lesson = group?.days.find((d) => d.day === day);
  if (!group || !lesson || releasedDays(group.schedule, new Date()) < day) return null;
  return { ...ctx, group, lesson };
}

const backToLesson = (groupId: string, day: number, params: Record<string, string>): never =>
  redirect(`/grupo/${groupId}/licao/${day}?${new URLSearchParams(params).toString()}`);

/** Conclui a lição do dia (ou de um dia em atraso). Não bloqueia nada: lida depois, conta do mesmo jeito (RG-02). */
export async function completeGroupLesson(groupId: string, day: number): Promise<void> {
  const ctx = await releasedLesson(groupId, day);
  if (!ctx) redirect("/grupo");
  const { supabase, user, lesson } = ctx;
  const { error } = await supabase
    .from("group_progress")
    .upsert({ user_id: user.id, group_id: groupId, lesson_id: lesson.lessonId, completed_at: new Date().toISOString() }, { onConflict: "user_id,group_id,lesson_id" });
  if (error) backToLesson(groupId, day, { erro: "Não foi possível concluir agora. Tente de novo." });
  redirect(`/grupo/${groupId}?ok=${encodeURIComponent(`Lição do dia ${day} concluída. Muito bem!`)}`);
}

/** Marca (ou desmarca) o desafio do dia. */
export async function toggleGroupChallenge(groupId: string, day: number, formData: FormData): Promise<void> {
  const ctx = await releasedLesson(groupId, day);
  if (!ctx) redirect("/grupo");
  const { supabase, user, lesson } = ctx;
  const { error } = await supabase
    .from("group_progress")
    .upsert({ user_id: user.id, group_id: groupId, lesson_id: lesson.lessonId, challenge_done: formData.get("done") === "1" }, { onConflict: "user_id,group_id,lesson_id" });
  if (error) backToLesson(groupId, day, { erro: "Não foi possível salvar agora." });
  backToLesson(groupId, day, { salvo: "desafio" });
}

/** Guarda a reflexão e escolhe se o discipulador a vê (RG-07). Texto em branco apaga a reflexão. */
export async function saveGroupReflection(groupId: string, day: number, formData: FormData): Promise<void> {
  const ctx = await releasedLesson(groupId, day);
  if (!ctx) redirect("/grupo");
  const { supabase, user, lesson } = ctx;
  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  if (body.length > REFLECTION_MAX) backToLesson(groupId, day, { erro: `A reflexão pode ter no máximo ${REFLECTION_MAX} caracteres.` });
  if (body === "") {
    await supabase.from("group_reflections").delete().eq("user_id", user.id).eq("group_id", groupId).eq("lesson_id", lesson.lessonId);
  } else {
    const { error } = await supabase.from("group_reflections").upsert(
      { user_id: user.id, group_id: groupId, lesson_id: lesson.lessonId, body, shared: formData.get("shared") === "on", updated_at: new Date().toISOString() },
      { onConflict: "user_id,group_id,lesson_id" },
    );
    if (error) backToLesson(groupId, day, { erro: "Não foi possível salvar a reflexão. Tente de novo." });
  }
  backToLesson(groupId, day, { salvo: "reflexao" });
}

/** Pedido de ajuda pastoral: ao discipulador (padrão) ou direto à equipe pastoral (RG-10). */
export async function requestGroupHelp(groupId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireGroups();
  if (!isUuid(groupId)) redirect("/grupo");
  const parsed = validateHelpRequest(formData);
  const lessonId = String(formData.get("lesson") ?? "");
  const to = (params: Record<string, string>) => `/grupo/${groupId}/ajuda?${new URLSearchParams(params).toString()}`;
  if (!parsed.ok) redirect(to({ erro: parsed.error }));
  else {
    const { error } = await supabase.rpc("request_help", {
      p_group: groupId,
      p_lesson: isUuid(lessonId) ? lessonId : null,
      p_topic: parsed.topic,
      p_message: parsed.message,
      p_destination: parsed.destination,
    });
    if (error) redirect(to({ erro: describeEditorError(error).message }));
    redirect(`/grupo/${groupId}?ok=${encodeURIComponent(parsed.destination === "pastoral" ? "Seu pedido foi enviado direto à equipe pastoral." : "Seu pedido foi enviado ao seu discipulador.")}`);
  }
}
