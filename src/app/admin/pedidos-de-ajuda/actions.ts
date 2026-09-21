"use server";

import { redirect } from "next/navigation";
import { describeEditorError } from "@/lib/admin/errors";
import { requireAdmin } from "@/lib/auth";
import { HELP_LIMITS, isUuid } from "@/lib/groups/forms";

const back = (params: Record<string, string>): never => redirect(`/admin/pedidos-de-ajuda?${new URLSearchParams(params).toString()}`);
const STATUSES = ["open", "in_progress", "answered", "closed"];

/** A equipe pastoral atende um pedido (direto ou escalado): situação e registro do atendimento. Só o Admin. */
export async function handlePastoralHelp(requestId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!isUuid(requestId) || !STATUSES.includes(status)) back({ erro: "Pedido inválido." });
  else if (note.length > HELP_LIMITS.note) back({ erro: `A nota pode ter no máximo ${HELP_LIMITS.note} caracteres.` });
  else {
    const { error } = await supabase.rpc("handle_help_request", { p_id: requestId, p_status: status, p_note: note });
    if (error) back({ erro: describeEditorError(error).message });
    back({ ok: "Atendimento registrado." });
  }
}
