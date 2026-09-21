"use server";

import { redirect } from "next/navigation";
import { describeEditorError } from "@/lib/admin/errors";
import { requireCaregiver } from "@/lib/auth";
import { validateAlertUpdate, validateNote } from "@/lib/care";

// Identificador de pessoa (uuid). Qualquer outra coisa nem chega ao banco.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const back = (memberId: string, params: Record<string, string>, hash = ""): never =>
  redirect(`/cuidado/${memberId}?${new URLSearchParams(params).toString()}${hash}`);

/** Registra uma nota de cuidado sobre um membro atribuído (a RLS confere que ele é dele). */
export async function addCareNote(memberId: string, formData: FormData): Promise<void> {
  const { supabase, user } = await requireCaregiver();
  if (!UUID.test(memberId)) redirect("/cuidado");
  const parsed = validateNote(String(formData.get("body") ?? ""));
  if (!parsed.ok) back(memberId, { erro: parsed.error }, "#notas");
  else {
    const { error } = await supabase.from("care_notes").insert({ member_id: memberId, author_id: user.id, body: parsed.body });
    if (error) {
      const message = error.message.includes("row-level security")
        ? "Você só pode escrever notas sobre os membros que estão com você."
        : describeEditorError(error).message;
      back(memberId, { erro: message }, "#notas");
    }
    back(memberId, { ok: "Nota salva." }, "#notas");
  }
}

/** Apaga uma nota que o próprio cuidador escreveu. */
export async function deleteCareNote(memberId: string, noteId: string): Promise<void> {
  const { supabase, user } = await requireCaregiver();
  if (!UUID.test(memberId) || !UUID.test(noteId)) redirect("/cuidado");
  const { error } = await supabase.from("care_notes").delete().eq("id", noteId).eq("author_id", user.id).eq("member_id", memberId);
  if (error) back(memberId, { erro: describeEditorError(error).message }, "#notas");
  back(memberId, { ok: "Nota apagada." }, "#notas");
}

/** Muda a situação do alerta de um membro atribuído (em contato, resolvido). */
export async function updateCareAlert(memberId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireCaregiver();
  const alertId = String(formData.get("alert") ?? "");
  if (!UUID.test(memberId) || !UUID.test(alertId)) redirect("/cuidado");
  const parsed = validateAlertUpdate(String(formData.get("status") ?? ""), String(formData.get("resolution") ?? ""));
  if (!parsed.ok) back(memberId, { erro: parsed.error }, "#alerta");
  else {
    const { error } = await supabase.rpc("set_alert_status", {
      p_alert: alertId,
      p_status: parsed.status,
      p_resolution: parsed.resolution,
    });
    if (error) back(memberId, { erro: describeEditorError(error).message }, "#alerta");
    back(memberId, { ok: parsed.status === "resolved" ? "Alerta resolvido." : "Alerta atualizado." });
  }
}
