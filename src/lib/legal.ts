import { withChurchDeep } from "./church";

export type ConsentPurpose = "data_processing" | "email_reminders" | "whatsapp_reminders";

/**
 * Versão do texto dos termos e da política de privacidade que o membro aceita.
 * Enquanto os textos forem minuta, o sufixo "-rascunho" fica; troque quando o advogado aprovar.
 * Cada aceite grava esta versão (RF-04).
 */
export const TERMS_VERSION = "2026-09-rascunho";

/** Textos dos consentimentos (com o marcador {{igreja}}; use consentText). Minuta sujeita a revisão jurídica (handoff 0.4.2). */
export const CONSENT_TEMPLATE: Record<ConsentPurpose, string> = {
  data_processing:
    "Concordo que a {{igreja}} trate meu nome, e-mail, foto e meu progresso na trilha para me acompanhar no discipulado. Entendo que participar da igreja pode revelar minha convicção religiosa, um dado pessoal sensível, e que posso pedir a exclusão dos meus dados a qualquer momento.",
  email_reminders: "Quero receber lembretes e avisos por e-mail (no máximo 2 por semana).",
  whatsapp_reminders: "Quero receber lembretes por WhatsApp.",
};

/** Os textos dos consentimentos com o nome da igreja no lugar do marcador. */
export function consentText(churchName: string): Record<ConsentPurpose, string> {
  return withChurchDeep(CONSENT_TEMPLATE, churchName);
}
