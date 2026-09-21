"use server";

import { redirect } from "next/navigation";
import { describeEditorError } from "@/lib/admin/errors";
import { requireAdmin } from "@/lib/auth";
import { readAttendance, validateClosureEvent } from "@/lib/closures";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const back = (params: Record<string, string>, hash = ""): never =>
  redirect(`/admin/encerramentos?${new URLSearchParams(params).toString()}${hash}`);

/** Cria o evento de encerramento de um ciclo. Só o Admin (a RLS do banco impõe o mesmo). */
export async function createClosureEvent(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const parsed = validateClosureEvent(formData);
  if (!parsed.ok) back({ erro: parsed.error }, "#novo");
  else {
    const { error } = await supabase.from("closure_events").insert({
      cycle_id: parsed.cycleId,
      title: parsed.title,
      kind: parsed.kind,
      starts_at: parsed.startsAt,
      location: parsed.location,
    });
    if (error) back({ erro: describeEditorError(error).message }, "#novo");
    back({ ok: "Encerramento criado." });
  }
}

/** Apaga um encerramento (e a lista de presença dele). Certificados já emitidos ficam. */
export async function deleteClosureEvent(eventId: string): Promise<void> {
  const { supabase } = await requireAdmin();
  if (!UUID.test(eventId)) back({ erro: "Encerramento inválido." });
  else {
    const { error } = await supabase.from("closure_events").delete().eq("id", eventId);
    if (error) back({ erro: describeEditorError(error).message });
    back({ ok: "Encerramento apagado." });
  }
}

/** Confirma a presença: quem está marcado é presente e os outros da lista, ausentes (RF-18). */
export async function saveAttendance(eventId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  if (!UUID.test(eventId)) back({ erro: "Encerramento inválido." });
  else {
    const { present, absent } = readAttendance(formData);
    const { error } = await supabase.rpc("save_attendance", { p_event: eventId, p_present: present, p_absent: absent });
    if (error) back({ erro: describeEditorError(error).message }, `#e-${eventId}`);
    back({ ok: "Presença salva." }, `#e-${eventId}`);
  }
}

/** Emite os certificados de quem concluiu o ciclo e teve a presença confirmada (RN-06). */
export async function issueCertificates(eventId: string): Promise<void> {
  const { supabase } = await requireAdmin();
  if (!UUID.test(eventId)) back({ erro: "Encerramento inválido." });
  else {
    const { data, error } = await supabase.rpc("issue_certificates", { p_event: eventId });
    if (error) back({ erro: describeEditorError(error).message }, `#e-${eventId}`);
    const n = Number(data ?? 0);
    back(
      { ok: n === 0 ? "Nenhum certificado novo: falta presença confirmada ou o ciclo concluído." : `${n} ${n === 1 ? "certificado emitido" : "certificados emitidos"}.` },
      `#e-${eventId}`,
    );
  }
}
