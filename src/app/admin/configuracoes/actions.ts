"use server";

import { redirect } from "next/navigation";
import { describeEditorError } from "@/lib/admin/errors";
import { validateSettings } from "@/lib/admin/settings";
import { requireAdmin } from "@/lib/auth";

const back = (params: Record<string, string>): never =>
  redirect(`/admin/configuracoes?${new URLSearchParams(params).toString()}`);

/** Salva o nome da igreja e as chaves liga/desliga. Só o Admin (a RLS do banco impõe o mesmo). */
export async function saveSettings(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const parsed = validateSettings(formData);
  if (!parsed.ok) back({ erro: parsed.error });
  else {
    const { error } = await supabase.from("app_settings").upsert(parsed.rows, { onConflict: "key" });
    if (error) back({ erro: describeEditorError(error).message });
    back({ ok: "Configurações salvas." });
  }
}
