"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { TERMS_VERSION } from "@/lib/legal";
import { DELETE_CONFIRMATION, isDeleteConfirmed, planReminderChanges, validateProfile } from "@/lib/profile";

export type FormState = { ok?: string; error?: string } | null;

/** Edita nome, WhatsApp e versão da Bíblia. */
export async function updateProfile(_previous: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireMember();

  const { data: versions } = await supabase.from("bible_versions").select("code");
  const result = validateProfile(
    {
      displayName: String(formData.get("displayName") ?? ""),
      whatsapp: String(formData.get("whatsapp") ?? ""),
      bibleVersion: String(formData.get("bibleVersion") ?? ""),
    },
    (versions ?? []).map((v) => v.code as string),
  );
  if (!result.ok) return { error: result.error };

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: result.displayName, whatsapp: result.whatsapp, bible_version: result.bibleVersion })
    .eq("id", user.id);
  if (error) return { error: "Não foi possível salvar seus dados. Tente de novo." };

  // Sem número não há como receber lembrete por WhatsApp: o consentimento é revogado junto.
  if (!result.whatsapp) {
    await supabase
      .from("consents")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("purpose", "whatsapp_reminders")
      .is("revoked_at", null);
  }
  return { ok: "Dados salvos." };
}

/** Liga e desliga os lembretes por e-mail e por WhatsApp (cada canal tem consentimento próprio). */
export async function updateReminders(_previous: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireMember();

  const [{ data: profile }, { data: consents }] = await Promise.all([
    supabase.from("profiles").select("whatsapp").eq("id", user.id).single<{ whatsapp: string | null }>(),
    supabase.from("consents").select("purpose").eq("user_id", user.id).is("revoked_at", null),
  ]);

  const plan = planReminderChanges(
    new Set((consents ?? []).map((c) => c.purpose as string)),
    { email: formData.get("email") === "on", whatsapp: formData.get("whatsapp") === "on" },
    Boolean(profile?.whatsapp),
  );
  if (plan.error) return { error: plan.error };

  const now = new Date().toISOString();
  for (const purpose of plan.revoke) {
    const { error } = await supabase
      .from("consents")
      .update({ revoked_at: now })
      .eq("user_id", user.id)
      .eq("purpose", purpose)
      .is("revoked_at", null);
    if (error) return { error: "Não foi possível salvar. Tente de novo." };
  }
  if (plan.grant.length > 0) {
    const { error } = await supabase
      .from("consents")
      .insert(plan.grant.map((purpose) => ({ user_id: user.id, purpose, term_version: TERMS_VERSION })));
    if (error) return { error: "Não foi possível salvar. Tente de novo." };
  }
  return { ok: plan.grant.length + plan.revoke.length === 0 ? "Nada mudou." : "Preferências salvas." };
}

/** Exclui a própria conta e todos os dados pessoais (LGPD). A função do banco só age sobre quem a chama. */
export async function deleteAccount(_previous: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireMember();
  if (!isDeleteConfirmed(String(formData.get("confirm") ?? ""))) {
    return { error: `Para confirmar, digite ${DELETE_CONFIRMATION} no campo.` };
  }

  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    return {
      error: error.message.includes("último administrador")
        ? "Você é o último administrador. Promova outra pessoa a administrador antes de excluir a sua conta."
        : "Não foi possível excluir a conta. Tente de novo.",
    };
  }

  await supabase.auth.signOut(); // encerra a sessão neste aparelho (a conta já não existe mais)
  redirect("/login?conta=excluida");
}
