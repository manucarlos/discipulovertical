import { normalizeWhatsapp } from "./onboarding";
import type { ConsentPurpose } from "./legal";

export interface ProfileInput {
  displayName: string;
  whatsapp: string;
  bibleVersion: string;
}

export type ProfileResult =
  | { ok: true; displayName: string; whatsapp: string | null; bibleVersion: string }
  | { ok: false; error: string };

/** Valida a edição do perfil (mesmas regras do primeiro acesso). */
export function validateProfile(input: ProfileInput, allowedVersions: string[]): ProfileResult {
  const displayName = input.displayName.trim().replace(/\s+/g, " ");
  if (displayName.length < 2 || displayName.length > 80) {
    return { ok: false, error: "Escreva seu nome (entre 2 e 80 caracteres)." };
  }
  if (!allowedVersions.includes(input.bibleVersion)) {
    return { ok: false, error: "Escolha uma versão da Bíblia da lista." };
  }
  let whatsapp: string | null = null;
  if (input.whatsapp.trim() !== "") {
    whatsapp = normalizeWhatsapp(input.whatsapp);
    if (!whatsapp) {
      return { ok: false, error: "O WhatsApp parece incompleto. Use o DDD e o número, por exemplo (11) 91234-5678." };
    }
  }
  return { ok: true, displayName, whatsapp, bibleVersion: input.bibleVersion };
}

export type ReminderPurpose = Extract<ConsentPurpose, "email_reminders" | "whatsapp_reminders">;

export interface ReminderPlan {
  grant: ReminderPurpose[];
  revoke: ReminderPurpose[];
  error?: string;
}

/**
 * Decide o que gravar ao mudar os lembretes: aceite novo para o que foi ligado e revogação do que foi
 * desligado. Lembrete por WhatsApp só liga se houver número no perfil.
 */
export function planReminderChanges(
  active: ReadonlySet<string>,
  want: { email: boolean; whatsapp: boolean },
  hasWhatsappNumber: boolean,
): ReminderPlan {
  if (want.whatsapp && !hasWhatsappNumber) {
    return { grant: [], revoke: [], error: "Para receber lembretes por WhatsApp, informe o número no seu perfil primeiro." };
  }
  const plan: ReminderPlan = { grant: [], revoke: [] };
  const wanted: Record<ReminderPurpose, boolean> = { email_reminders: want.email, whatsapp_reminders: want.whatsapp };
  for (const purpose of Object.keys(wanted) as ReminderPurpose[]) {
    const isActive = active.has(purpose);
    if (wanted[purpose] && !isActive) plan.grant.push(purpose);
    if (!wanted[purpose] && isActive) plan.revoke.push(purpose);
  }
  return plan;
}

/** Palavra que a pessoa precisa digitar para confirmar a exclusão da conta. */
export const DELETE_CONFIRMATION = "EXCLUIR";

export function isDeleteConfirmed(text: string): boolean {
  return text.trim().toLocaleUpperCase("pt-BR") === DELETE_CONFIRMATION;
}

// ---------------------------------------------------------------------------------------------
// Exportação dos dados pessoais (LGPD: direito de acesso e portabilidade)
// ---------------------------------------------------------------------------------------------

export interface ExportSource {
  profile: {
    id: string;
    display_name: string;
    email: string;
    photo_url: string | null;
    whatsapp: string | null;
    bible_version: string;
    role: string;
    created_at: string;
    onboarded_at: string | null;
  };
  consents: { purpose: string; term_version: string; accepted_at: string; revoked_at: string | null }[];
  lessonProgress: {
    status: string;
    released_at: string;
    started_at: string | null;
    completed_at: string | null;
    last_position: number | null;
    practice_done: boolean;
    lessons: { slug: string; title: string } | null;
  }[];
  cycleProgress: {
    status: string;
    started_at: string;
    completed_at: string | null;
    cycles: { slug: string; title: string } | null;
  }[];
}

const CONSENT_NAME: Record<string, string> = {
  data_processing: "Tratamento dos dados pessoais",
  email_reminders: "Lembretes por e-mail",
  whatsapp_reminders: "Lembretes por WhatsApp",
};
const PROGRESS_NAME: Record<string, string> = { available: "Disponível", in_progress: "Em andamento", completed: "Concluída" };
const CYCLE_NAME: Record<string, string> = { in_progress: "Em andamento", completed: "Concluído" };

/** Monta o arquivo que a pessoa baixa: tudo o que a plataforma guarda sobre ela, em português. */
export function buildExport(source: ExportSource, now: Date) {
  const { profile } = source;
  return {
    aviso:
      "Estes são os dados pessoais que a plataforma de discipulado da Vertical Church guarda sobre você. " +
      "Você pode corrigi-los ou excluir sua conta na página Meu perfil.",
    exportado_em: now.toISOString(),
    versao_do_formato: 1,
    perfil: {
      id: profile.id,
      nome: profile.display_name,
      email: profile.email,
      foto: profile.photo_url,
      whatsapp: profile.whatsapp,
      versao_da_biblia: profile.bible_version,
      perfil_de_acesso: profile.role,
      entrou_em: profile.created_at,
      primeiro_acesso_concluido_em: profile.onboarded_at,
    },
    consentimentos: source.consents.map((c) => ({
      finalidade: CONSENT_NAME[c.purpose] ?? c.purpose,
      versao_do_termo: c.term_version,
      aceito_em: c.accepted_at,
      revogado_em: c.revoked_at,
    })),
    progresso_das_licoes: source.lessonProgress.map((p) => ({
      licao: p.lessons?.slug ?? null,
      titulo: p.lessons?.title ?? null,
      situacao: PROGRESS_NAME[p.status] ?? p.status,
      liberada_em: p.released_at,
      iniciada_em: p.started_at,
      concluida_em: p.completed_at,
      ultima_posicao_de_leitura: p.last_position,
      pratica_feita: p.practice_done,
    })),
    progresso_dos_ciclos: source.cycleProgress.map((c) => ({
      ciclo: c.cycles?.slug ?? null,
      titulo: c.cycles?.title ?? null,
      situacao: CYCLE_NAME[c.status] ?? c.status,
      iniciado_em: c.started_at,
      concluido_em: c.completed_at,
    })),
  };
}
