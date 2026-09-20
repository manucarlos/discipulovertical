import type { ReactNode } from "react";
import { parseReference } from "@/lib/bible/references";
import type { LessonBlock, LessonContent } from "@/lib/content/types";
import { RichText } from "./rich-text";

export interface LessonViewProps {
  title: string;
  objective: string;
  estimatedMinutes: number | null;
  tags: string[];
  keyVerse: string | null;
  content: LessonContent;
  links: Record<string, string>;
  versionCode: string;
  /** Área abaixo da prática (botão de concluir, navegação). */
  footer?: ReactNode;
}

export function LessonView({
  title,
  objective,
  estimatedMinutes,
  tags,
  keyVerse,
  content,
  links,
  versionCode,
  footer,
}: LessonViewProps) {
  const rich = (text: string) => <RichText text={text} links={links} versionCode={versionCode} />;
  const verse = keyVerse ? parseReference(keyVerse) : null;

  return (
    <article className="leading-relaxed">
      <header>
        <ul className="flex flex-wrap gap-2 text-xs">
          {tags.map((t) => (
            <li key={t} className="rounded-full bg-lilac px-2.5 py-1 font-medium text-muted">
              {t}
            </li>
          ))}
        </ul>
        <h1 className="mt-4 font-serif text-3xl leading-tight sm:text-4xl">{title}</h1>
        {estimatedMinutes !== null && <p className="mt-2 text-sm text-muted">Cerca de {estimatedMinutes} minutos</p>}
        <p className="mt-5 rounded-xl border-l-4 border-brand bg-lilac px-4 py-3">
          <span className="font-medium">Objetivo: </span>
          {objective}
        </p>
        {keyVerse && (
          <p className="mt-4 rounded-xl border border-line bg-card px-4 py-3">
            <span className="text-sm font-medium uppercase tracking-wide text-brand">Versículo-chave</span>
            <span className="mt-1 block font-serif text-xl">
              {verse && links[verse.label] ? (
                <a
                  href={links[verse.label]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-brand/40 underline-offset-4 hover:decoration-brand"
                  aria-label={`Ler ${verse.label} na ${versionCode} (abre em nova aba)`}
                >
                  {keyVerse}
                </a>
              ) : (
                keyVerse
              )}
            </span>
            {verse && links[verse.label] && (
              <span className="mt-1 block text-xs text-muted">Toque na referência para ler na {versionCode}.</span>
            )}
          </p>
        )}
      </header>

      <div className="mt-8 space-y-5">
        {content.blocks.map((block, i) => (
          <Block key={i} block={block} rich={rich} />
        ))}
      </div>

      {content.practice && (
        <section aria-labelledby="pratica" className="mt-10 rounded-2xl border border-line bg-card p-5">
          <h2 id="pratica" className="font-serif text-2xl">
            {content.practice.title}
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-6">
            {content.practice.items.map((item, i) => (
              <li key={i}>{rich(item)}</li>
            ))}
          </ol>
        </section>
      )}

      {footer && <div className="mt-10">{footer}</div>}
    </article>
  );
}

function Block({ block, rich }: { block: LessonBlock; rich: (text: string) => ReactNode }) {
  switch (block.type) {
    case "heading":
      return <h2 className="!mt-10 font-serif text-2xl leading-snug">{rich(block.text)}</h2>;
    case "paragraph":
      return <p>{rich(block.text)}</p>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag className={`${block.ordered ? "list-decimal" : "list-disc"} space-y-2 pl-6`}>
          {block.items.map((item, i) => (
            <li key={i}>{rich(item)}</li>
          ))}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote className="border-l-4 border-brand pl-4 font-serif text-xl italic text-muted">
          {rich(block.text)}
        </blockquote>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[32rem] border-collapse text-left text-[0.95em]">
            <thead className="bg-lilac">
              <tr>
                {block.header.map((h, i) => (
                  <th key={i} scope="col" className="border-b border-line px-3 py-2 font-medium">
                    {rich(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-line last:border-0">
                  {row.map((cell, c) => (
                    <td key={c} className="px-3 py-2 align-top">
                      {rich(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}
