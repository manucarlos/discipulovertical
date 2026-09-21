/** Textos fixos e validações dos formulários do Grupo de Discipulado. Sem acesso ao banco: puro e testável. */

/** Versão do texto do consentimento do grupo (RG-08). Muda quando o texto mudar; fica gravada em cada entrada. */
export const GROUP_CONSENT_VERSION = "grupo-2026-09-rascunho";

/** O que o discipulador enxerga (RG-07), dito ao discípulo antes de ele aceitar (RG-08). */
export const GROUP_CONSENT_ITEMS = [
  "Se você leu cada lição do dia, se está em atraso e a sua sequência de dias.",
  "A sua presença nos encontros do grupo.",
  "As reflexões que você escolher compartilhar. As que você não compartilhar continuam só suas; nas lições sensíveis, elas começam privadas.",
  "As notas que o discipulador escrever sobre os encontros do grupo.",
] as const;

export const GROUP_CONSENT_EXIT = "Você pode sair do grupo quando quiser. Ao sair, o discipulador deixa de ver a sua leitura e as suas reflexões.";

/** Aviso fixo das lições sensíveis (RG-09). Os telefones devem ser conferidos pela liderança antes de publicar. */
export const SENSITIVE_NOTICE =
  "Esta lição trata de um assunto delicado. Ela é um estudo bíblico e não substitui o aconselhamento de um profissional (médico, psicólogo, advogado ou consultor financeiro). Se você está em sofrimento, peça ajuda: em risco imediato, ligue 192 (SAMU) ou 188 (CVV, apoio emocional, 24 horas).";

export const HELP_LIMITS = { topic: 120, message: 3000, note: 1000 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);
export const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

type Form = { get(name: string): FormDataEntryValue | null; getAll(name: string): FormDataEntryValue[] };

export type HelpCheck = { ok: true; topic: string; message: string; destination: "discipler" | "pastoral" } | { ok: false; error: string };

export function validateHelpRequest(form: Form): HelpCheck {
  const topic = String(form.get("topic") ?? "").trim();
  const message = String(form.get("message") ?? "").replace(/\r\n/g, "\n").trim();
  const destination = form.get("destination") === "pastoral" ? "pastoral" : "discipler";
  if (message === "") return { ok: false, error: "Escreva o que você precisa. Pode ser em poucas palavras." };
  if (message.length > HELP_LIMITS.message) return { ok: false, error: `A mensagem pode ter no máximo ${HELP_LIMITS.message} caracteres.` };
  if (topic.length > HELP_LIMITS.topic) return { ok: false, error: `O assunto pode ter no máximo ${HELP_LIMITS.topic} caracteres.` };
  return { ok: true, topic, message, destination };
}

export type GroupFormCheck =
  | { ok: true; name: string; trackId: string; startDate: string; weekdays: number[]; hour: number; meetingWeekday: number | null }
  | { ok: false; error: string };

/** Formulário "Criar grupo": nome, trilha, data de início, dias ativos, horário e dia do encontro. */
export function validateGroupForm(form: Form): GroupFormCheck {
  const name = String(form.get("name") ?? "").trim();
  const trackId = String(form.get("track") ?? "");
  const startDate = String(form.get("start_date") ?? "");
  const weekdays = [...new Set(form.getAll("weekday").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))].sort();
  const hour = Number(form.get("hour") ?? 6);
  const meeting = String(form.get("meeting_weekday") ?? "");

  if (name === "") return { ok: false, error: "Dê um nome ao grupo." };
  if (name.length > 80) return { ok: false, error: "O nome pode ter no máximo 80 caracteres." };
  if (!isUuid(trackId)) return { ok: false, error: "Escolha a trilha do grupo." };
  if (!isIsoDate(startDate)) return { ok: false, error: "Informe a data de início." };
  if (weekdays.length === 0) return { ok: false, error: "Marque pelo menos um dia da semana." };
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return { ok: false, error: "O horário de liberação deve estar entre 0h e 23h." };
  const meetingWeekday = meeting === "" ? null : Number(meeting);
  if (meetingWeekday !== null && !(Number.isInteger(meetingWeekday) && meetingWeekday >= 1 && meetingWeekday <= 7)) {
    return { ok: false, error: "Dia de encontro inválido." };
  }
  return { ok: true, name, trackId, startDate, weekdays, hour, meetingWeekday };
}

export type PauseCheck = { ok: true; from: string; until: string } | { ok: false; error: string };

export function validatePause(form: Form): PauseCheck {
  const from = String(form.get("from") ?? "");
  const until = String(form.get("until") ?? "");
  if (!isIsoDate(from) || !isIsoDate(until)) return { ok: false, error: "Informe o primeiro e o último dia da pausa." };
  if (until < from) return { ok: false, error: "O último dia da pausa não pode ser antes do primeiro." };
  return { ok: true, from, until };
}

export type MeetingCheck = { ok: true; date: string; notes: string; attendees: string[] } | { ok: false; error: string };

export function validateMeeting(form: Form): MeetingCheck {
  const date = String(form.get("date") ?? "");
  const notes = String(form.get("notes") ?? "").replace(/\r\n/g, "\n").trim();
  if (!isIsoDate(date)) return { ok: false, error: "Informe a data do encontro." };
  if (notes.length > 5000) return { ok: false, error: "As notas podem ter no máximo 5000 caracteres." };
  const attendees = form.getAll("present").map(String).filter(isUuid);
  return { ok: true, date, notes, attendees };
}

export const WEEKDAY_LABEL: Record<number, string> = { 1: "segunda", 2: "terça", 3: "quarta", 4: "quinta", 5: "sexta", 6: "sábado", 7: "domingo" };
