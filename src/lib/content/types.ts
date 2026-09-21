/**
 * Formato do conteúdo de uma lição (handoff, seção 0.7).
 *
 * Os textos guardam markdown inline mínimo: **negrito** e *itálico*. Referências bíblicas
 * ficam como texto ("João 3.16") e são detectadas na exibição (src/lib/bible).
 */
export type LessonBlock =
  | { type: "heading"; /** 1 = seção principal da lição (#### no handoff). */ level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; text: string }
  | { type: "table"; header: string[]; rows: string[][] };

export interface LessonPractice {
  /** "Prática da semana" ou a variante, como "Prática da semana: desafio de 7 dias". */
  title: string;
  items: string[];
}

/** Vídeo da lição (RF-11): YouTube ou Vimeo em modo de privacidade, com a transcrição em texto. */
export interface LessonVideo {
  provider: "youtube" | "vimeo";
  id: string;
  transcript: string;
}

/** Conteúdo versionado (lesson_versions.content). Nada aqui é material interno da equipe. */
export interface LessonContent {
  blocks: LessonBlock[];
  practice: LessonPractice | null;
  reflection: string | null;
  /** Ausente nas lições antigas. */
  video?: LessonVideo | null;
  /** Perguntas do guia do encontro (Grupo de Discipulado): só o discipulador as vê. */
  guide?: string[];
}

export interface QuizQuestion {
  position: number;
  prompt: string;
  options: Record<string, string>;
  correct: string;
  explanation: string;
}

/** Material de trabalho da equipe (regra 0.4.7): nunca vai ao membro. */
export interface LessonInternalNotes {
  videoSuggestion: string | null;
  buttonSuggestion: string | null;
  pastoralReviewNote: string | null;
  draftNotice: string | null;
}

export interface ParsedLesson {
  /** Identificador estável do handoff, por exemplo "c1-l01". Vira lessons.slug. */
  id: string;
  cycle: number;
  order: number;
  title: string;
  objective: string;
  keyVerse: string;
  estimatedMinutes: number;
  tags: string[];
  hasPlaceholders: boolean;
  placeholderCount: number;
  content: LessonContent;
  quiz: QuizQuestion[];
  internal: LessonInternalNotes;
}

export interface ParsedCycle {
  number: number;
  slug: string;
  title: string;
  description: string;
  plannedWeeks: number;
  /** Texto do encerramento presencial (por enquanto só informativo). */
  closure: string;
  lessons: ParsedLesson[];
}
