import { parseReference } from "../bible/references";
import type { LessonContent } from "./types";
import { asLessonContent } from "./validate";

/** O que o editor envia ao salvar. Tudo é tratado como não confiável e revalidado no servidor. */
export interface LessonDraftInput {
  title: string;
  objective: string;
  keyVerse: string;
  estimatedMinutes: number | null;
  tags: string[];
  required: boolean;
  sensitive: boolean;
  content: unknown;
  notes: {
    pastoralReviewNote: string;
    videoSuggestion: string;
    draftNotice: string;
    buttonSuggestion: string;
  };
  quiz: { prompt: string; options: Record<string, string>; correct: string; explanation: string }[];
  /** Comentário opcional sobre a mudança, para o histórico. */
  note: string;
}

/** Já no formato que a função save_lesson do banco espera. */
export interface ValidDraft {
  fields: {
    title: string;
    objective: string;
    key_verse_ref: string;
    estimated_minutes: number | null;
    tags: string[];
    required: boolean;
    sensitive: boolean;
  };
  content: LessonContent;
  notes: {
    pastoral_review_note: string | null;
    video_suggestion: string | null;
    draft_notice: string | null;
    button_suggestion: string | null;
  };
  quiz: { prompt: string; options: Record<string, string>; correct_option: string; explanation: string }[];
  note: string | null;
}

export type DraftResult = { ok: true; draft: ValidDraft } | { ok: false; error: string };

export const LIMITS = {
  title: 200,
  objective: 1000,
  tags: 10,
  tagLength: 40,
  blocks: 300,
  blockText: 20_000,
  contentBytes: 250_000,
  reflection: 5000,
  note: 5000,
  quizQuestions: 10,
  quizPrompt: 1000,
  quizOption: 500,
  quizExplanation: 1000,
  versionNote: 200,
} as const;

const fail = (error: string): DraftResult => ({ ok: false, error });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function validateLessonDraft(input: unknown): DraftResult {
  if (!isObject(input)) return fail("Dados inválidos.");

  const title = str(input.title).trim();
  if (title.length === 0) return fail("Escreva o título da lição.");
  if (title.length > LIMITS.title) return fail(`O título pode ter no máximo ${LIMITS.title} caracteres.`);

  const objective = str(input.objective).trim();
  if (objective.length > LIMITS.objective) return fail(`O objetivo pode ter no máximo ${LIMITS.objective} caracteres.`);

  const keyVerse = str(input.keyVerse).trim();
  let keyVerseRef = "";
  if (keyVerse !== "") {
    const ref = parseReference(keyVerse);
    if (!ref) return fail("O versículo-chave precisa ser uma referência, como João 3.16 ou Efésios 2.8-9.");
    keyVerseRef = ref.label;
  }

  let estimatedMinutes: number | null = null;
  if (input.estimatedMinutes !== null && input.estimatedMinutes !== undefined && input.estimatedMinutes !== "") {
    const n = Number(input.estimatedMinutes);
    if (!Number.isInteger(n) || n < 1 || n > 120) return fail("O tempo estimado deve ser um número inteiro de minutos, de 1 a 120.");
    estimatedMinutes = n;
  }

  if (!Array.isArray(input.tags)) return fail("Etiquetas inválidas.");
  const tags: string[] = [];
  for (const raw of input.tags) {
    const tag = str(raw).trim();
    if (tag === "" || tags.includes(tag)) continue;
    if (tag.length > LIMITS.tagLength) return fail(`Cada etiqueta pode ter no máximo ${LIMITS.tagLength} caracteres.`);
    tags.push(tag);
  }
  if (tags.length > LIMITS.tags) return fail(`Use no máximo ${LIMITS.tags} etiquetas.`);

  // Conteúdo: nenhum bloco pode ser descartado em silêncio.
  if (!isObject(input.content) || !Array.isArray(input.content.blocks)) return fail("Conteúdo da lição inválido.");
  const content = asLessonContent(input.content);
  if (!content) return fail("Conteúdo da lição inválido.");
  if (content.blocks.length !== input.content.blocks.length) return fail("A lição tem um bloco de texto inválido. Recarregue a página e tente de novo.");
  if (content.blocks.length > LIMITS.blocks) return fail(`A lição pode ter no máximo ${LIMITS.blocks} blocos.`);
  if (JSON.stringify(content).length > LIMITS.contentBytes) return fail("O conteúdo da lição está grande demais.");
  if (content.reflection !== null && content.reflection.length > LIMITS.reflection) return fail("A reflexão está longa demais.");
  if (isObject(input.content.practice) && content.practice === null) {
    return fail("A prática precisa de um título e de pelo menos um item.");
  }

  if (isObject(input.content.video) && !content.video) {
    return fail("O vídeo precisa de um link válido do YouTube ou do Vimeo (por exemplo, https://youtu.be/...).");
  }

  const notesIn = isObject(input.notes) ? input.notes : {};
  const note = (key: string) => {
    const value = str(notesIn[key]).trim();
    return value === "" ? null : value;
  };
  const notes = {
    pastoral_review_note: note("pastoralReviewNote"),
    video_suggestion: note("videoSuggestion"),
    draft_notice: note("draftNotice"),
    button_suggestion: note("buttonSuggestion"),
  };
  for (const value of Object.values(notes)) {
    if (value !== null && value.length > LIMITS.note) return fail("Uma das notas da equipe está longa demais.");
  }

  if (!Array.isArray(input.quiz)) return fail("Quiz inválido.");
  if (input.quiz.length > LIMITS.quizQuestions) return fail(`O quiz pode ter no máximo ${LIMITS.quizQuestions} perguntas.`);
  const quiz: ValidDraft["quiz"] = [];
  for (const [index, raw] of input.quiz.entries()) {
    const n = index + 1;
    if (!isObject(raw)) return fail(`Pergunta ${n} do quiz inválida.`);
    const prompt = str(raw.prompt).trim();
    if (prompt === "") return fail(`Escreva o enunciado da pergunta ${n} do quiz.`);
    if (prompt.length > LIMITS.quizPrompt) return fail(`O enunciado da pergunta ${n} está longo demais.`);

    const options: Record<string, string> = {};
    if (isObject(raw.options)) {
      for (const [letter, text] of Object.entries(raw.options)) {
        const value = str(text).trim();
        if (value === "") continue;
        if (!/^[A-F]$/.test(letter)) return fail(`Alternativa inválida na pergunta ${n}.`);
        if (value.length > LIMITS.quizOption) return fail(`Uma alternativa da pergunta ${n} está longa demais.`);
        options[letter] = value;
      }
    }
    if (Object.keys(options).length < 2) return fail(`A pergunta ${n} do quiz precisa de pelo menos 2 alternativas.`);

    const correct = str(raw.correct);
    if (!(correct in options)) return fail(`Marque a alternativa correta da pergunta ${n} do quiz.`);

    const explanation = str(raw.explanation).trim();
    if (explanation.length > LIMITS.quizExplanation) return fail(`A explicação da pergunta ${n} está longa demais.`);
    quiz.push({ prompt, options, correct_option: correct, explanation });
  }

  const versionNote = str(input.note).trim();
  if (versionNote.length > LIMITS.versionNote) return fail(`O comentário da versão pode ter no máximo ${LIMITS.versionNote} caracteres.`);

  return {
    ok: true,
    draft: {
      fields: {
        title,
        objective,
        key_verse_ref: keyVerseRef,
        estimated_minutes: estimatedMinutes,
        tags,
        required: input.required !== false,
        sensitive: input.sensitive === true,
      },
      content,
      notes,
      quiz,
      note: versionNote === "" ? null : versionNote,
    },
  };
}
