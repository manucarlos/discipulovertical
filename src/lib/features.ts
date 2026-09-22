import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_CHURCH_NAME } from "@/lib/church";

/** Recursos que o Admin liga e desliga (RF-28). Nascem desligados: o piloto abre só com o MVP. */
export const FEATURES = [
  { key: "quiz", label: "Quiz das lições", phase: "V2", description: "Perguntas ao fim de cada lição; é preciso acertar 2 de 3 para concluí-la." },
  { key: "reflections", label: "Prática e reflexão", phase: "V2", description: "O membro marca a prática como feita e pode escrever uma reflexão (visível ao cuidador e ao administrador)." },
  { key: "video", label: "Vídeo nas lições", phase: "V2", description: "Mostra o vídeo (YouTube ou Vimeo) que o editor colocar na lição." },
  { key: "caregivers", label: "Cuidadores e alertas", phase: "V2", description: "Atribuir membros a cuidadores, notas de cuidado e alertas de quem parou." },
  { key: "reminders", label: "Lembretes por e-mail", phase: "V2", description: "Avisos de nova lição e de retorno. Precisa do serviço de e-mail configurado." },
  { key: "closures", label: "Encerramentos presenciais", phase: "V2", description: "Eventos de encerramento de ciclo com lista de presença." },
  { key: "certificates", label: "Certificados", phase: "V2", description: "Certificado em PDF ao concluir o ciclo e confirmar a presença no encerramento." },
  { key: "groups", label: "Grupo de Discipulado", phase: "Grupos", description: "Discipuladores conduzem grupos por uma trilha diária, com painel, encontros e pedidos de ajuda." },
  { key: "gamification", label: "Sequência de dias e marcos", phase: "V3", description: "Mostra a sequência de dias de leitura e marcos de conquista, de forma discreta." },
  { key: "email_login", label: "Entrar com e-mail", phase: "V3", description: "Alternativa ao login do Google, por link enviado ao e-mail. Precisa do e-mail configurado no Supabase." },
  { key: "feedback", label: "Formulário de feedback do piloto", phase: "Piloto", description: "Abre a página pública /feedback (sem login) para os testadores contarem como foi. As respostas aparecem em Feedback, no painel." },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];
export type Flags = Record<FeatureKey, boolean>;

export const ALL_OFF: Flags = Object.fromEntries(FEATURES.map((f) => [f.key, false])) as Flags;

export interface ChurchSettings {
  /** Nulo para quem não é Admin (ou não tem igreja ainda): a RLS de `churches` só libera a própria, ao Admin. */
  id: string | null;
  name: string;
  contactEmail: string;
}

export interface Settings {
  flags: Flags;
  church: ChurchSettings;
}

interface Row {
  key: string;
  value: unknown;
}

/** Converte as linhas de app_settings (só os recursos: nome e contato da igreja vêm de `churches`, à parte). */
export function resolveFlags(rows: Row[]): Flags {
  const flags: Flags = { ...ALL_OFF };
  for (const row of rows) {
    if (row.key.startsWith("feature.")) {
      const key = row.key.slice("feature.".length) as FeatureKey;
      if (key in flags) flags[key] = row.value === true; // só um `true` de verdade liga
    }
  }
  return flags;
}

/** @deprecated Kept for the tests that build straight from rows; prefer {@link loadSettings}. */
export function resolveSettings(rows: Row[]): Settings {
  return { flags: resolveFlags(rows), church: { id: null, name: DEFAULT_CHURCH_NAME, contactEmail: "" } };
}

export async function loadSettings(supabase: SupabaseClient): Promise<Settings> {
  const [{ data: rows, error }, { data: church }] = await Promise.all([
    supabase.from("app_settings").select("key, value"),
    // Sem linha (não é Admin, ou ainda sem igreja): fica no padrão do código — a tela pede para preencher.
    supabase.from("churches").select("id, name, contact_email").maybeSingle(),
  ]);
  // Se a leitura de recursos falhar, o padrão é tudo desligado: um recurso novo nunca liga "por engano".
  const flags = error ? resolveFlags([]) : resolveFlags((rows ?? []) as Row[]);
  const churchSettings: ChurchSettings = church
    ? { id: church.id, name: church.name || DEFAULT_CHURCH_NAME, contactEmail: church.contact_email ?? "" }
    : { id: null, name: DEFAULT_CHURCH_NAME, contactEmail: "" };
  return { flags, church: churchSettings };
}

export const isFeatureKey = (value: string): value is FeatureKey => FEATURES.some((f) => f.key === value);
