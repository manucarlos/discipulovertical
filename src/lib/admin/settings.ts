import { FEATURES, type FeatureKey } from "@/lib/features";

export const SETTINGS_LIMITS = { churchName: 80, contactEmail: 120 } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SettingsResult =
  | { ok: true; rows: { key: string; value: string | boolean }[] }
  | { ok: false; error: string };

/**
 * Valida o formulário de configurações e devolve as linhas a gravar.
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
  const rows: { key: string; value: string | boolean }[] = [
    { key: "church.name", value: name },
    { key: "church.contact_email", value: email },
  ];
  for (const f of FEATURES) rows.push({ key: `feature.${f.key}`, value: form.get(`feature_${f.key}`) === "on" });
  return { ok: true, rows };
}

export type { FeatureKey };
