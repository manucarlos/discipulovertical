"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION } from "@/lib/legal";
import { validateOnboarding } from "@/lib/onboarding";

export type OnboardingState = { error: string } | null;

/** RF-03 e RF-04: grava os dados do primeiro acesso e cada consentimento, com data e versão do termo. */
export async function completeOnboarding(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: versions } = await supabase.from("bible_versions").select("code");
  const checked = (name: string) => formData.get(name) === "on";

  const result = validateOnboarding(
    {
      displayName: String(formData.get("displayName") ?? ""),
      whatsapp: String(formData.get("whatsapp") ?? ""),
      bibleVersion: String(formData.get("bibleVersion") ?? ""),
      consentData: checked("consentData"),
      consentEmail: checked("consentEmail"),
      consentWhatsapp: checked("consentWhatsapp"),
    },
    (versions ?? []).map((v) => v.code),
  );
  if (!result.ok) return { error: result.error };

  // Consentimentos primeiro: se algo falhar aqui, o perfil não fica "concluído" sem aceite.
  const { data: existing } = await supabase
    .from("consents")
    .select("purpose")
    .eq("user_id", user.id)
    .eq("term_version", TERMS_VERSION)
    .is("revoked_at", null);
  const already = new Set((existing ?? []).map((c) => c.purpose));
  const missing = result.consents
    .filter((purpose) => !already.has(purpose))
    .map((purpose) => ({ user_id: user.id, purpose, term_version: TERMS_VERSION }));

  if (missing.length > 0) {
    const { error } = await supabase.from("consents").insert(missing);
    if (error) return { error: "Não foi possível registrar seu consentimento. Tente de novo." };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      display_name: result.displayName,
      whatsapp: result.whatsapp,
      bible_version: result.bibleVersion,
      onboarded_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (profileError) return { error: "Não foi possível salvar seus dados. Tente de novo." };

  redirect("/");
}
