"use server";

import { redirect } from "next/navigation";
import { describeEditorError } from "@/lib/admin/errors";
import { validateSettings } from "@/lib/admin/settings";
import { requireAdmin } from "@/lib/auth";

const back = (params: Record<string, string>): never =>
  redirect(`/admin/configuracoes?${new URLSearchParams(params).toString()}`);

/**
 * Salva o nome e o contato (tabela `churches`, a própria igreja do Admin) e as chaves liga/desliga
 * (`app_settings`). Só o Admin — a RLS do banco impõe o mesmo em cada uma (banco único multi-igreja,
 * migração 0026: cada Admin só edita a sua igreja).
 */
export async function saveSettings(formData: FormData): Promise<void> {
  const { supabase, profile } = await requireAdmin();
  const parsed = validateSettings(formData);
  if (!parsed.ok) {
    back({ erro: parsed.error });
    return;
  }

  if (!profile.church_id) {
    back({ erro: "Não foi possível identificar a igreja. Recarregue a página e tente de novo." });
    return;
  }

  const { error: churchError } = await supabase
    .from("churches")
    .update({ name: parsed.church.name, contact_email: parsed.church.contactEmail })
    .eq("id", profile.church_id);
  if (churchError) {
    back({ erro: describeEditorError(churchError).message });
    return;
  }

  const { error } = await supabase.from("app_settings").upsert(parsed.featureRows, { onConflict: "church_id,key" });
  if (error) {
    back({ erro: describeEditorError(error).message });
    return;
  }
  back({ ok: "Configurações salvas." });
}
