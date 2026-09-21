"use server";

import { redirect } from "next/navigation";
import { describeEditorError } from "@/lib/admin/errors";
import { requireDiscipler } from "@/lib/auth";
import { HELP_LIMITS, isUuid, validateGroupForm, validateMeeting, validatePause } from "@/lib/groups/forms";

const to = (path: string, params: Record<string, string>, hash = "") => `${path}?${new URLSearchParams(params).toString()}${hash}`;

/** Cria um grupo (RG-05: a trilha é uma das oficiais publicadas pelo Admin). */
export async function createGroup(formData: FormData): Promise<void> {
  const { supabase } = await requireDiscipler();
  const parsed = validateGroupForm(formData);
  if (!parsed.ok) redirect(to("/discipulador/novo", { erro: parsed.error }));
  else {
    const { data, error } = await supabase.rpc("create_group", {
      p_name: parsed.name,
      p_track: parsed.trackId,
      p_start: parsed.startDate,
      p_weekdays: parsed.weekdays,
      p_hour: parsed.hour,
      p_meeting_weekday: parsed.meetingWeekday,
    });
    if (error) redirect(to("/discipulador/novo", { erro: describeEditorError(error).message }));
    redirect(to(`/discipulador/${data as string}`, { ok: "Grupo criado. Compartilhe o código do convite com os discípulos." }));
  }
}

const groupPage = (groupId: string) => `/discipulador/${groupId}`;

/** Pausa o grupo por alguns dias (RG-04): os dias da pausa não têm lição e o calendário se desloca. */
export async function addGroupPause(groupId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireDiscipler();
  if (!isUuid(groupId)) redirect("/discipulador");
  const parsed = validatePause(formData);
  if (!parsed.ok) redirect(to(groupPage(groupId), { erro: parsed.error }, "#pausas"));
  else {
    const { error } = await supabase.rpc("add_group_pause", { p_group: groupId, p_from: parsed.from, p_until: parsed.until });
    if (error) redirect(to(groupPage(groupId), { erro: describeEditorError(error).message }, "#pausas"));
    redirect(to(groupPage(groupId), { ok: "Pausa registrada." }, "#pausas"));
  }
}

export async function removeGroupPause(groupId: string, pauseId: string): Promise<void> {
  const { supabase } = await requireDiscipler();
  if (!isUuid(groupId) || !isUuid(pauseId)) redirect("/discipulador");
  const { error } = await supabase.rpc("remove_group_pause", { p_pause: pauseId });
  if (error) redirect(to(groupPage(groupId), { erro: describeEditorError(error).message }, "#pausas"));
  redirect(to(groupPage(groupId), { ok: "Pausa removida." }, "#pausas"));
}

/** Encerra ou reabre o grupo. */
export async function setGroupStatus(groupId: string, status: string): Promise<void> {
  const { supabase } = await requireDiscipler();
  if (!isUuid(groupId)) redirect("/discipulador");
  const { error } = await supabase.rpc("set_group_status", { p_group: groupId, p_status: status });
  if (error) redirect(to(groupPage(groupId), { erro: describeEditorError(error).message }));
  redirect(to(groupPage(groupId), { ok: status === "active" ? "Grupo reaberto." : "Grupo encerrado." }));
}

/** Registra o encontro: notas e presença (RG-06). */
export async function saveMeeting(groupId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireDiscipler();
  if (!isUuid(groupId)) redirect("/discipulador");
  const here = `${groupPage(groupId)}/encontro`;
  const parsed = validateMeeting(formData);
  if (!parsed.ok) redirect(to(here, { erro: parsed.error }));
  else {
    const { error } = await supabase.rpc("save_group_meeting", { p_group: groupId, p_date: parsed.date, p_notes: parsed.notes, p_attendees: parsed.attendees });
    if (error) redirect(to(here, { erro: describeEditorError(error).message }));
    redirect(to(here, { ok: "Encontro registrado.", data: parsed.date }));
  }
}

const HELP_STATUSES = ["open", "in_progress", "answered", "closed"];

/** Atende um pedido de ajuda do grupo: muda a situação e registra o atendimento (RG-10). */
export async function handleGroupHelp(requestId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireDiscipler();
  if (!isUuid(requestId)) redirect("/discipulador/pedidos");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!HELP_STATUSES.includes(status)) redirect(to("/discipulador/pedidos", { erro: "Situação inválida." }));
  if (note.length > HELP_LIMITS.note) redirect(to("/discipulador/pedidos", { erro: `A nota pode ter no máximo ${HELP_LIMITS.note} caracteres.` }));
  const { error } = await supabase.rpc("handle_help_request", { p_id: requestId, p_status: status, p_note: note });
  if (error) redirect(to("/discipulador/pedidos", { erro: describeEditorError(error).message }));
  redirect(to("/discipulador/pedidos", { ok: "Atendimento registrado." }));
}

/** Escala o pedido à equipe pastoral com um botão (RG-10). */
export async function escalateGroupHelp(requestId: string): Promise<void> {
  const { supabase } = await requireDiscipler();
  if (!isUuid(requestId)) redirect("/discipulador/pedidos");
  const { error } = await supabase.rpc("escalate_help_request", { p_id: requestId });
  if (error) redirect(to("/discipulador/pedidos", { erro: describeEditorError(error).message }));
  redirect(to("/discipulador/pedidos", { ok: "Pedido enviado à equipe pastoral." }));
}
