/** Nós de texto inline: só o que o conteúdo das lições usa (negrito, itálico e marcador [PREENCHER]). */
export type InlineNode =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "placeholder"; text: string };

const INLINE = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g;

export function parseInline(input: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;
  for (const m of input.matchAll(INLINE)) {
    if (m.index > last) nodes.push({ type: "text", text: input.slice(last, m.index) });
    if (m[1] !== undefined) {
      nodes.push(m[1].startsWith("[PREENCHER") ? { type: "placeholder", text: m[1] } : { type: "bold", text: m[1] });
    } else {
      nodes.push({ type: "italic", text: m[2] });
    }
    last = m.index + m[0].length;
  }
  if (last < input.length) nodes.push({ type: "text", text: input.slice(last) });
  return nodes;
}

/** Texto sem marcação, para contar palavras, procurar referências ou mostrar em títulos. */
export function stripInline(input: string): string {
  return parseInline(input)
    .map((n) => n.text)
    .join("");
}
