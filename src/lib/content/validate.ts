import type { LessonBlock, LessonContent } from "./types";

const isString = (v: unknown): v is string => typeof v === "string";
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

function asBlock(value: unknown): LessonBlock | null {
  if (typeof value !== "object" || value === null) return null;
  const b = value as Record<string, unknown>;
  switch (b.type) {
    case "heading":
      return isString(b.text) && typeof b.level === "number" ? { type: "heading", level: b.level, text: b.text } : null;
    case "paragraph":
    case "quote":
      return isString(b.text) ? { type: b.type, text: b.text } : null;
    case "list":
      return isStringArray(b.items) ? { type: "list", ordered: b.ordered === true, items: b.items } : null;
    case "table":
      return isStringArray(b.header) && Array.isArray(b.rows) && b.rows.every(isStringArray)
        ? { type: "table", header: b.header, rows: b.rows as string[][] }
        : null;
    default:
      return null;
  }
}

/**
 * Confere o JSON vindo do banco antes de exibir. O conteúdo passa a ser escrito por editores,
 * então uma lição malformada não pode derrubar a tela: blocos inválidos são descartados.
 * Devolve null se nem a estrutura básica existe.
 */
export function asLessonContent(value: unknown): LessonContent | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.blocks)) return null;

  const blocks = v.blocks.map(asBlock).filter((b): b is LessonBlock => b !== null);

  let practice: LessonContent["practice"] = null;
  if (typeof v.practice === "object" && v.practice !== null) {
    const p = v.practice as Record<string, unknown>;
    if (isString(p.title) && isStringArray(p.items) && p.items.length > 0) {
      practice = { title: p.title, items: p.items };
    }
  }

  return { blocks, practice, reflection: isString(v.reflection) ? v.reflection : null };
}
