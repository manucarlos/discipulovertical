/** Formulário de feedback do piloto (RF-32): as perguntas, a validação e o resumo para o administrador. */

export interface Choice {
  value: string;
  label: string;
}

export const DEVICES: Choice[] = [
  { value: "android", label: "Celular Android" },
  { value: "iphone", label: "iPhone" },
  { value: "computador", label: "Computador" },
  { value: "outro", label: "Outro" },
];

export const ENTERED: Choice[] = [
  { value: "sim", label: "Sim, sem problemas" },
  { value: "com_dificuldade", label: "Sim, mas com dificuldade" },
  { value: "nao", label: "Não consegui entrar" },
];

export const LESSON_DONE: Choice[] = [
  { value: "sim", label: "Sim, li e concluí" },
  { value: "em_parte", label: "Li só uma parte" },
  { value: "nao", label: "Tentei e não consegui" },
  { value: "nao_cheguei", label: "Não cheguei até a lição" },
];

export const ALONE: Choice[] = [
  { value: "sim", label: "Sim, sem ajuda" },
  { value: "com_ajuda", label: "Talvez, com alguma ajuda" },
  { value: "nao", label: "Não" },
];

export const EASE_MIN = 1;
export const EASE_MAX = 5;
export const EASE_LOW_LABEL = "Muito difícil";
export const EASE_HIGH_LABEL = "Muito fácil";

export const FEEDBACK_LIMITS = { text: 1000, contactName: 80, contact: 120 } as const;

export interface FeedbackInput {
  device: string;
  entered: string;
  lessonDone: string;
  ease: string;
  alone: string;
  liked: string;
  confusing: string;
  suggestion: string;
  contactName: string;
  contact: string;
}

export interface FeedbackValue {
  device: string;
  entered: string;
  lessonDone: string;
  ease: number;
  alone: string;
  liked: string | null;
  confusing: string | null;
  suggestion: string | null;
  contactName: string | null;
  contact: string | null;
}

export type FeedbackResult = { ok: true; value: FeedbackValue } | { ok: false; error: string };

const has = (choices: Choice[], value: string) => choices.some((c) => c.value === value);
const clean = (text: string) => text.replace(/\r\n/g, "\n").trim();

/** Confere as respostas antes de gravar. O banco confere de novo (restrições da tabela); aqui a mensagem é clara. */
export function validateFeedback(input: FeedbackInput): FeedbackResult {
  if (!has(DEVICES, input.device)) return { ok: false, error: "Responda: qual aparelho você usou?" };
  if (!has(ENTERED, input.entered)) return { ok: false, error: "Responda: você conseguiu entrar?" };
  if (!has(LESSON_DONE, input.lessonDone)) return { ok: false, error: "Responda: você conseguiu ler e concluir a primeira lição?" };

  const ease = Number(input.ease);
  if (!Number.isInteger(ease) || ease < EASE_MIN || ease > EASE_MAX) {
    return { ok: false, error: `Responda: de ${EASE_MIN} a ${EASE_MAX}, o quanto foi fácil usar?` };
  }
  if (!has(ALONE, input.alone)) return { ok: false, error: "Responda: uma pessoa nova na fé usaria sozinha?" };

  const optional = (raw: string, max: number, what: string): { ok: true; text: string | null } | { ok: false; error: string } => {
    const text = clean(raw);
    if (text.length > max) return { ok: false, error: `${what}: escreva até ${max} caracteres.` };
    return { ok: true, text: text === "" ? null : text };
  };
  const liked = optional(input.liked, FEEDBACK_LIMITS.text, "O que você mais gostou");
  if (!liked.ok) return liked;
  const confusing = optional(input.confusing, FEEDBACK_LIMITS.text, "O que confundiu ou não funcionou");
  if (!confusing.ok) return confusing;
  const suggestion = optional(input.suggestion, FEEDBACK_LIMITS.text, "O que você gostaria que existisse");
  if (!suggestion.ok) return suggestion;
  const contactName = optional(input.contactName, FEEDBACK_LIMITS.contactName, "Nome");
  if (!contactName.ok) return contactName;
  const contact = optional(input.contact, FEEDBACK_LIMITS.contact, "Contato");
  if (!contact.ok) return contact;

  return {
    ok: true,
    value: {
      device: input.device,
      entered: input.entered,
      lessonDone: input.lessonDone,
      ease,
      alone: input.alone,
      liked: liked.text,
      confusing: confusing.text,
      suggestion: suggestion.text,
      contactName: contactName.text,
      contact: contact.text,
    },
  };
}

export interface FeedbackRow {
  id: string;
  created_at: string;
  device: string;
  entered: string;
  lesson_done: string;
  ease: number;
  alone: string;
  liked: string | null;
  confusing: string | null;
  suggestion: string | null;
  contact_name: string | null;
  contact: string | null;
}

export interface FeedbackSummary {
  total: number;
  /** Média de 1 a 5 com uma casa decimal; nula se não houver respostas. */
  averageEase: number | null;
  device: Record<string, number>;
  entered: Record<string, number>;
  lessonDone: Record<string, number>;
  alone: Record<string, number>;
}

const tally = (values: string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
};

export function summarizeFeedback(rows: FeedbackRow[]): FeedbackSummary {
  const total = rows.length;
  const averageEase = total === 0 ? null : Math.round((rows.reduce((sum, r) => sum + r.ease, 0) / total) * 10) / 10;
  return {
    total,
    averageEase,
    device: tally(rows.map((r) => r.device)),
    entered: tally(rows.map((r) => r.entered)),
    lessonDone: tally(rows.map((r) => r.lesson_done)),
    alone: tally(rows.map((r) => r.alone)),
  };
}

export const labelOf = (choices: Choice[], value: string) => choices.find((c) => c.value === value)?.label ?? value;
