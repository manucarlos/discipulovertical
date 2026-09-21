import type { LessonBlock } from "@/lib/content/types";

/**
 * Lição da biblioteca do Grupo de Discipulado (handoff, seção 19): um dia de leitura, com versículo-chave por
 * REFERÊNCIA (nunca o texto da Bíblia), reflexão, desafio do dia e guia do discipulador.
 *
 * Todas entram como RASCUNHO e passam por revisão pastoral (e, nas sensíveis, de um profissional da área)
 * antes de serem publicadas. Onde falta uma informação da igreja aparece [PREENCHER: ...], que bloqueia a publicação.
 */
export interface LibraryLesson {
  /** Número na tabela do handoff (1 a 24) ou 25 em diante para a formação do discipulador. */
  n: number;
  slug: string;
  title: string;
  theme: string;
  sensitive: boolean;
  minutes: number;
  keyVerse: string;
  objective: string;
  blocks: LessonBlock[];
  /** Desafio do dia: uma ação pequena e concreta. */
  challenge: string;
  /** 1 ou 2 perguntas de reflexão para o discípulo. */
  reflection: string;
  /** 3 ou 4 perguntas para o encontro (e, nas sensíveis, uma nota de cuidado). */
  guide: string[];
  /** Nota interna para a revisão pastoral (nunca chega ao membro). */
  reviewNote: string;
}

export interface LibraryTrack {
  title: string;
  description: string;
  themes: string[];
  /** Números das lições, na ordem dos dias. */
  lessons: number[];
}

export const p = (text: string): LessonBlock => ({ type: "paragraph", text });
export const h = (text: string): LessonBlock => ({ type: "heading", level: 1, text });
export const ul = (items: string[]): LessonBlock => ({ type: "list", ordered: false, items });
export const ol = (items: string[]): LessonBlock => ({ type: "list", ordered: true, items });
export const quote = (text: string): LessonBlock => ({ type: "quote", text });
