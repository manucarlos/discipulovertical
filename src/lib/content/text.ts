import type { LessonContent } from "./types";

/** Todos os textos de uma lição (corpo e prática), para procurar referências bíblicas. */
export function collectLessonTexts(content: LessonContent): string[] {
  const texts: string[] = [];
  for (const block of content.blocks) {
    switch (block.type) {
      case "heading":
      case "paragraph":
      case "quote":
        texts.push(block.text);
        break;
      case "list":
        texts.push(...block.items);
        break;
      case "table":
        texts.push(...block.header, ...block.rows.flat());
        break;
    }
  }
  if (content.practice) texts.push(...content.practice.items);
  return texts;
}
