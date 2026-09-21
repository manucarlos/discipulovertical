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

/** Converte as linhas de app_settings em configurações, com padrão seguro (desligado) para o que faltar ou vier estranho. */
export function resolveSettings(rows: Row[]): Settings {
  const flags: Flags = { ...ALL_OFF };
  const church: ChurchSettings = { name: DEFAULT_CHURCH_NAME, contactEmail: "" };
  for (const row of rows) {
    if (row.key.startsWith("feature.")) {
      const key = row.key.slice("feature.".length) as FeatureKey;
      if (key in flags) flags[key] = row.value === true; // só um `true` de verdade liga
    } else if (row.key === "church.name" && typeof row.value === "string" && row.value.trim()) {
      church.name = row.value.trim();
    } else if (row.key === "church.contact_email" && typeof row.value === "string") {
      church.contactEmail = row.value.trim();
    }
  }
  return { flags, church };
}

export async function loadSettings(supabase: SupabaseClient): Promise<Settings> {
  const { data, error } = await supabase.from("app_settings").select("key, value");
  // Se a leitura falhar, o padrão é tudo desligado: um recurso novo nunca liga "por engano".
  if (error) return resolveSettings([]);
  return resolveSettings((data ?? []) as Row[]);
}

export const isFeatureKey = (value: string): value is FeatureKey => FEATURES.some((f) => f.key === value);
