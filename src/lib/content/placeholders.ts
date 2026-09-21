import type { LessonContent } from "./types";

export interface PlaceholderHit {
  /** Onde está: "Texto", "Prática", "Reflexão" ou o nome da nota interna. */
  where: string;
  /** O que falta, como escrito no marcador. */
  description: string;
}

export interface NotesText {
  pastoralReviewNote?: string | null;
  videoSuggestion?: string | null;
  draftNotice?: string | null;
  buttonSuggestion?: string | null;
}

const MARKER = /\[PREENCHER(?::\s*([^\]]*))?\]/g;

function scan(text: string, where: string): PlaceholderHit[] {
  return [...text.matchAll(MARKER)].map((m) => ({ where, description: (m[1] ?? "").trim() }));
}

/**
 * Lista tudo o que ainda está marcado com [PREENCHER] (conteúdo e notas internas).
 * Enquanto houver algum, a lição não pode ser publicada.
 */
export function findPlaceholders(content: LessonContent, notes: NotesText = {}): PlaceholderHit[] {
  const hits: PlaceholderHit[] = [];
  for (const block of content.blocks) {
    switch (block.type) {
      case "heading":
      case "paragraph":
      case "quote":
        hits.push(...scan(block.text, "Texto"));
        break;
      case "list":
        block.items.forEach((item) => hits.push(...scan(item, "Texto")));
        break;
      case "table":
        [...block.header, ...block.rows.flat()].forEach((cell) => hits.push(...scan(cell, "Texto")));
        break;
    }
  }
  content.practice?.items.forEach((item) => hits.push(...scan(item, "Prática")));
  if (content.reflection) hits.push(...scan(content.reflection, "Reflexão"));
  if (content.video?.transcript) hits.push(...scan(content.video.transcript, "Transcrição do vídeo"));

  hits.push(...scan(notes.pastoralReviewNote ?? "", "Nota para revisão pastoral"));
  hits.push(...scan(notes.videoSuggestion ?? "", "Sugestão de vídeo"));
  hits.push(...scan(notes.draftNotice ?? "", "Aviso de rascunho"));
  hits.push(...scan(notes.buttonSuggestion ?? "", "Botão sugerido"));
  return hits;
}
