/** Conversões entre os campos de texto do formulário do editor e os dados guardados. */

/** "a, b , a" -> ["a", "b"] (sem vazias nem repetidas, na ordem em que aparecem). */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(",")) {
    const tag = part.trim();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/** Um item por linha; linhas em branco são ignoradas e cada item perde espaços e numeração acidental. */
export function linesToItems(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export const itemsToLines = (items: string[]) => items.join("\n");

/** Prática: título mais itens (um por linha). Sem itens, a lição fica sem prática. */
export function buildPractice(title: string, itemsText: string): { title: string; items: string[] } | null {
  const items = linesToItems(itemsText);
  if (items.length === 0) return null;
  return { title: title.trim() || "Prática da semana", items };
}

/** Reflexão: texto livre; vazio vira nenhuma reflexão. */
export function buildReflection(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}
