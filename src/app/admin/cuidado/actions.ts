"use server";

import { redirect } from "next/navigation";
import { describeEditorError } from "@/lib/admin/errors";
import { requireAdmin } from "@/lib/auth";
import { validateAlertUpdate } from "@/lib/care";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const back = (params: Record<string, string>, hash = "", to = "/admin/cuidado"): never =>
  redirect(`${to}?${new URLSearchParams(params).toString()}${hash}`);

/** Volta para a ficha da pessoa quando o pedido veio de lá; senão, para a tela de Cuidado. */
const destination = (memberId: string, formData: FormData | undefined): string =>
  formData?.get("from") === `/admin/pessoas/${memberId}` ? `/admin/pessoas/${memberId}` : "/admin/cuidado";

/** Atribui um cuidador a um membro (troca o anterior, se houver). Só o Admin. */
export async function assignCaregiver(memberId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const to = destination(memberId, formData);
  const caregiverId = String(formData.get("caregiver") ?? "");
  if (!UUID.test(memberId) || !UUID.test(caregiverId)) back({ erro: "Escolha um cuidador." }, "", to);
  else {
    const { error } = await supabase.rpc("assign_caregiver", { p_member: memberId, p_caregiver: caregiverId });
    if (error) back({ erro: describeEditorError(error).message }, "", to);
    back({ ok: "Cuidador atribuído." }, "", to);
  }
}

/** Tira o cuidador de um membro (ele volta para a fila). Só o Admin. */
export async function unassignCaregiver(memberId: string, formData?: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const to = destination(memberId, formData);
  if (!UUID.test(memberId)) back({ erro: "Pessoa inválida." }, "", to);
  else {
    const { error } = await supabase.rpc("unassign_caregiver", { p_member: memberId });
    if (error) back({ erro: describeEditorError(error).message }, "", to);
    back({ ok: "O membro voltou para a fila sem cuidador." }, "", to);
  }
}

/** RN-13: distribui por rodízio todos os membros sem cuidador. Só o Admin. */
export async function autoAssignCaregivers(): Promise<void> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("auto_assign_caregivers");
  if (error) back({ erro: describeEditorError(error).message });
  const n = Number(data ?? 0);
  back({ ok: n === 0 ? "Ninguém para distribuir: falta cuidador ou a fila está vazia." : `${n} ${n === 1 ? "membro atribuído" : "membros atribuídos"}.` });
}

/** O Admin cuida dos alertas de quem não tem cuidador (e pode mexer em qualquer um). */
export async function updateAdminAlert(memberId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const alertId = String(formData.get("alert") ?? "");
  if (!UUID.test(memberId) || !UUID.test(alertId)) back({ erro: "Alerta inválido." });
  else {
    const parsed = validateAlertUpdate(String(formData.get("status") ?? ""), String(formData.get("resolution") ?? ""));
    if (!parsed.ok) back({ erro: parsed.error }, "#alertas");
    else {
      const { error } = await supabase.rpc("set_alert_status", {
        p_alert: alertId,
        p_status: parsed.status,
        p_resolution: parsed.resolution,
      });
      if (error) back({ erro: describeEditorError(error).message }, "#alertas");
      back({ ok: parsed.status === "resolved" ? "Alerta resolvido." : "Alerta atualizado." }, "#alertas");
    }
  }
}
