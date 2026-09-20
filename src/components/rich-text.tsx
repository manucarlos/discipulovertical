import type { ReactNode } from "react";
import { findReferences } from "@/lib/bible/references";
import { parseInline } from "@/lib/content/inline";

interface Props {
  text: string;
  /** "João 3.16" -> URL de leitura na versão do membro (ver resolvePassageLinks). */
  links: Record<string, string>;
  versionCode: string;
}

/** Transforma referências bíblicas em links. Nunca insere o texto bíblico (regra 0.4.1). */
function withReferences(text: string, { links, versionCode }: Omit<Props, "text">): ReactNode[] {
  const found = findReferences(text);
  if (found.length === 0) return [text];

  const out: ReactNode[] = [];
  let last = 0;
  found.forEach(({ start, end, reference }, index) => {
    if (start > last) out.push(text.slice(last, start));
    const shown = text.slice(start, end);
    const url = links[reference.label];
    out.push(
      url ? (
        <a
          key={`${start}-${index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-brand/40 underline-offset-4 hover:decoration-brand"
          aria-label={`Ler ${reference.label} na ${versionCode} (abre em nova aba)`}
        >
          {shown}
        </a>
      ) : (
        shown
      ),
    );
    last = end;
  });
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text, links, versionCode }: Props) {
  const ctx = { links, versionCode };
  return (
    <>
      {parseInline(text).map((node, i) => {
        const content = withReferences(node.text, ctx);
        switch (node.type) {
          case "bold":
            return <strong key={i}>{content}</strong>;
          case "italic":
            return <em key={i}>{content}</em>;
          case "placeholder":
            // Só aparece em rascunhos: lição com [PREENCHER] não pode ser publicada.
            return (
              <mark key={i} className="rounded bg-amber-100 px-1 text-amber-900">
                {node.text}
              </mark>
            );
          default:
            return <span key={i}>{content}</span>;
        }
      })}
    </>
  );
}
