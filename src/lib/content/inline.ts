/** Nós de texto inline: só o que o conteúdo das lições usa (negrito, itálico e marcador [PREENCHER]). */
export type InlineNode =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "placeholder"; text: string };

const INLINE = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*/g;

// Asterisco e barra invertida podem aparecer como texto comum; no armazenamento viram \* e \\.
// Trocamos por caracteres reservados (área de uso privado) enquanto lemos a marcação.
const STAR = "";
const SLASH = "";
const protect = (s: string) => s.replace(/\\([*\\])/g, (_, c: string) => (c === "*" ? STAR : SLASH));
const restore = (s: string) => s.replaceAll(STAR, "*").replaceAll(SLASH, "\\");

/** Escapa o texto para guardá-lo dentro do markdown inline (inverso do que parseInline lê). */
export function escapeInline(text: string): string {
  return text.replace(/[\\*]/g, "\\$&");
}

export function parseInline(input: string): InlineNode[] {
  const src = protect(input);
  const nodes: InlineNode[] = [];
  const push = (node: InlineNode) => nodes.push({ ...node, text: restore(node.text) });

  let last = 0;
  for (const m of src.matchAll(INLINE)) {
    if (m.index > last) push({ type: "text", text: src.slice(last, m.index) });
    if (m[1] !== undefined) {
      push(m[1].startsWith("[PREENCHER") ? { type: "placeholder", text: m[1] } : { type: "bold", text: m[1] });
    } else {
      push({ type: "italic", text: m[2] });
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) push({ type: "text", text: src.slice(last) });
  return nodes;
}

/** Texto sem marcação, para contar palavras, procurar referências ou mostrar em títulos. */
export function stripInline(input: string): string {
  return parseInline(input)
    .map((n) => n.text)
    .join("");
}
