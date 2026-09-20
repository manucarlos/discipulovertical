const WORDS_PER_MINUTE = 200;

/** Tempo estimado de leitura em minutos, no mínimo 1 (seção 4: cerca de 200 palavras por minuto). */
export function estimateReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
