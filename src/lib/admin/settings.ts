import { FEATURES, type FeatureKey } from "@/lib/features";

export const SETTINGS_LIMITS = { churchName: 80, contactEmail: 120 } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SettingsResult =
  | { ok: true; church: { name: string; contactEmail: string }; featureRows: { key: string; value: boolean }[] }
  | { ok: false; error: string };

/**
 * Valida o formulário de configurações. Nome e contato vão para `churches` (a igreja do Admin); os recursos
 * (liga/desliga) continuam em `app_settings`, por chave — dois destinos porque o banco único multi-igreja
 * (migração 0026) tirou nome/contato de app_settings (viraram colunas de `churches`, uma linha por igreja).
 * Caixa de seleção desmarcada não vem no formulário, então "ausente" significa desligado.
 */
export function validateSettings(form: { get(name: string): FormDataEntryValue | null }): SettingsResult {
  const name = String(form.get("church_name") ?? "").trim();
  if (name === "") return { ok: false, error: "Escreva o nome da igreja." };
  if (name.length > SETTINGS_LIMITS.churchName) {
    return { ok: false, error: `O nome da igreja pode ter no máximo ${SETTINGS_LIMITS.churchName} caracteres.` };
  }
  const email = String(form.get("contact_email") ?? "").trim();
  if (email !== "" && (email.length > SETTINGS_LIMITS.contactEmail || !EMAIL.test(email))) {
    return { ok: false, error: "O e-mail de contato não parece válido." };
  }
  const featureRows = FEATURES.map((f) => ({ key: `feature.${f.key}`, value: form.get(`feature_${f.key}`) === "on" }));
  return { ok: true, church: { name, contactEmail: email }, featureRows };
}

export type { FeatureKey };
