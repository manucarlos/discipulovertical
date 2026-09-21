"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const back = (params: Record<string, string>): never => redirect(`/admin/feedback?${new URLSearchParams(params).toString()}`);

/** Apaga uma resposta do formulário de feedback (LGPD: a pessoa pode pedir a exclusão). Só o Admin; a RLS impõe o mesmo. */
export async function deleteFeedback(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) back({ erro: "Resposta inválida." });

  const { error } = await supabase.from("feedback_responses").delete().eq("id", id);
  if (error) back({ erro: "Não foi possível apagar a resposta. Tente de novo." });
  back({ ok: "Resposta apagada." });
}
