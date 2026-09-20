import type { ConsentPurpose } from "./legal";

export interface OnboardingInput {
  displayName: string;
  whatsapp: string;
  bibleVersion: string;
  consentData: boolean;
  consentEmail: boolean;
  consentWhatsapp: boolean;
}

export type OnboardingResult =
  | {
      ok: true;
      displayName: string;
      whatsapp: string | null;
      bibleVersion: string;
      consents: ConsentPurpose[];
    }
  | { ok: false; error: string };

/** Normaliza um telefone brasileiro para só dígitos com DDI 55. Devolve null se for inválido. */
export function normalizeWhatsapp(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  // Um "+" com outro país (ex.: +1) tem 10 ou 11 dígitos e se passaria por número brasileiro.
  if (raw.trim().startsWith("+") && !digits.startsWith("55")) return null;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  return null;
}

/** RF-03 e RF-04: valida o primeiro acesso e decide quais consentimentos gravar. */
export function validateOnboarding(input: OnboardingInput, allowedVersions: string[]): OnboardingResult {
  const displayName = input.displayName.trim().replace(/\s+/g, " ");
  if (displayName.length < 2 || displayName.length > 80) {
    return { ok: false, error: "Escreva seu nome (entre 2 e 80 caracteres)." };
  }

  if (!allowedVersions.includes(input.bibleVersion)) {
    return { ok: false, error: "Escolha uma versão da Bíblia da lista." };
  }

  if (!input.consentData) {
    return { ok: false, error: "Para continuar, precisamos do seu consentimento para tratar seus dados." };
  }

  let whatsapp: string | null = null;
  if (input.whatsapp.trim() !== "") {
    whatsapp = normalizeWhatsapp(input.whatsapp);
    if (!whatsapp) {
      return { ok: false, error: "O WhatsApp parece incompleto. Use o DDD e o número, por exemplo (11) 91234-5678." };
    }
  }
  if (input.consentWhatsapp && !whatsapp) {
    return { ok: false, error: "Para receber lembretes por WhatsApp, informe o número." };
  }

  const consents: ConsentPurpose[] = ["data_processing"];
  if (input.consentEmail) consents.push("email_reminders");
  if (input.consentWhatsapp) consents.push("whatsapp_reminders");

  return { ok: true, displayName, whatsapp, bibleVersion: input.bibleVersion, consents };
}
