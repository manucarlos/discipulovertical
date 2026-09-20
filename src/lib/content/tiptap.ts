import { escapeInline, parseInline } from "./inline";
import type { LessonBlock } from "./types";

/**
 * Conversão entre os blocos da lição (o que o banco guarda) e o documento do editor visual TipTap.
 * Funções puras, sem depender do TipTap, para poderem ser testadas sem navegador.
 *
 * Mapeamento:
 *   heading (nível 1 ou 2)  <->  título h2 ou h3
 *   paragraph               <->  parágrafo
 *   list                    <->  lista com marcadores ou numerada (um parágrafo por item)
 *   quote                   <->  citação
 *   table                   <->  tabela (a primeira linha é o cabeçalho)
 *   **negrito** / *itálico* <->  marcas bold / italic
 *
 * Limites conhecidos: negrito e itálico ao mesmo tempo viram só negrito, e quebras de linha dentro
 * de um parágrafo viram espaço. O formato de armazenamento não representa essas duas coisas.
 */
export interface PMNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string }[];
  content?: PMNode[];
}

export const EMPTY_DOC: PMNode = { type: "doc", content: [{ type: "paragraph" }] };

// ---------------------------------------------------------------------------
// blocos -> documento
// ---------------------------------------------------------------------------

function inlineNodes(text: string): PMNode[] {
  return parseInline(text)
    .filter((n) => n.text !== "")
    .map((n): PMNode => {
      if (n.type === "bold" || n.type === "placeholder") return { type: "text", text: n.text, marks: [{ type: "bold" }] };
      if (n.type === "italic") return { type: "text", text: n.text, marks: [{ type: "italic" }] };
      return { type: "text", text: n.text };
    });
}

function paragraph(text: string): PMNode {
  const content = inlineNodes(text);
  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

export function blocksToDoc(blocks: LessonBlock[]): PMNode {
  const content: PMNode[] = blocks.map((block): PMNode => {
    switch (block.type) {
      case "heading":
        return { type: "heading", attrs: { level: block.level >= 2 ? 3 : 2 }, content: inlineNodes(block.text) };
      case "paragraph":
        return paragraph(block.text);
      case "list":
        return {
          type: block.ordered ? "orderedList" : "bulletList",
          content: block.items.map((item) => ({ type: "listItem", content: [paragraph(item)] })),
        };
      case "quote":
        return { type: "blockquote", content: [paragraph(block.text)] };
      case "table":
        return {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: block.header.map((h) => ({
                type: "tableHeader",
                attrs: { colspan: 1, rowspan: 1 },
                content: [paragraph(h)],
              })),
            },
            ...block.rows.map((row) => ({
              type: "tableRow",
              content: row.map((cell) => ({
                type: "tableCell",
                attrs: { colspan: 1, rowspan: 1 },
                content: [paragraph(cell)],
              })),
            })),
          ],
        };
    }
  });
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

// ---------------------------------------------------------------------------
// documento -> blocos
// ---------------------------------------------------------------------------

/** Escreve os nós inline do editor como markdown mínimo (negrito e itálico), com escape de * e \. */
function inlineToMarkdown(nodes: PMNode[] = []): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "hardBreak") {
      out += " ";
      continue;
    }
    if (node.type !== "text" || !node.text) continue;

    const marks = new Set((node.marks ?? []).map((m) => m.type));
    const lead = /^\s*/.exec(node.text)?.[0] ?? "";
    const trail = /\s*$/.exec(node.text)?.[0] ?? "";
    const core = node.text.trim();
    if (core === "") {
      out += node.text;
      continue;
    }
    // Espaços ficam fora da marcação: "** texto**" não seria lido como negrito.
    const escaped = escapeInline(core);
    const wrapped = marks.has("bold") ? `**${escaped}**` : marks.has("italic") ? `*${escaped}*` : escaped;
    out += lead + wrapped + trail;
  }
  return out;
}

/** Texto de um contêiner (item de lista, citação, célula): os parágrafos juntos, separados por espaço. */
function containerText(node: PMNode): string {
  const parts = (node.content ?? [])
    .map((child) => (child.type === "paragraph" ? inlineToMarkdown(child.content) : containerText(child)))
    .map((t) => t.trim())
    .filter(Boolean);
  return parts.join(" ");
}

export function docToBlocks(doc: PMNode): LessonBlock[] {
  const blocks: LessonBlock[] = [];

  for (const node of doc.content ?? []) {
    switch (node.type) {
      case "heading": {
        const text = inlineToMarkdown(node.content).trim();
        const level = typeof node.attrs?.level === "number" ? node.attrs.level : 2;
        if (text) blocks.push({ type: "heading", level: Math.max(1, level - 1), text });
        break;
      }
      case "paragraph": {
        const text = inlineToMarkdown(node.content).trim();
        if (text) blocks.push({ type: "paragraph", text });
        break;
      }
      case "bulletList":
      case "orderedList": {
        const items = (node.content ?? []).map(containerText).filter(Boolean);
        if (items.length > 0) blocks.push({ type: "list", ordered: node.type === "orderedList", items });
        break;
      }
      case "blockquote": {
        const text = containerText(node);
        if (text) blocks.push({ type: "quote", text });
        break;
      }
      case "table": {
        const rows = (node.content ?? []).map((row) => (row.content ?? []).map(containerText));
        if (rows.length === 0) break;
        const [header, ...body] = rows;
        const width = header.length;
        blocks.push({
          type: "table",
          header,
          rows: body.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")),
        });
        break;
      }
    }
  }
  return blocks;
}
