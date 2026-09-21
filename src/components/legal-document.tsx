import Link from "next/link";
import { PLACEHOLDER_PREFIX, type LegalDocument } from "@/lib/legal-text";
import { TERMS_VERSION } from "@/lib/legal";
import { RichText } from "./rich-text";

const isDraft = TERMS_VERSION.endsWith("-rascunho");

/** Divide o texto em pedaços comuns e marcadores [A PREENCHER PELA IGREJA: ...], que aparecem destacados. */
function withMarkers(text: string) {
  const parts: { text: string; marker: boolean }[] = [];
  let rest = text;
  while (rest.length > 0) {
    const start = rest.indexOf(PLACEHOLDER_PREFIX);
    if (start < 0) {
      parts.push({ text: rest, marker: false });
      break;
    }
    const end = rest.indexOf("]", start);
    if (start > 0) parts.push({ text: rest.slice(0, start), marker: false });
    parts.push({ text: rest.slice(start, end < 0 ? undefined : end + 1), marker: true });
    rest = end < 0 ? "" : rest.slice(end + 1);
  }
  return parts;
}

function Text({ text }: { text: string }) {
  return (
    <>
      {withMarkers(text).map((part, i) =>
        part.marker ? (
          <mark key={i} className="rounded bg-amber-100 px-1 text-amber-950">
            {part.text}
          </mark>
        ) : (
          <RichText key={i} text={part.text} links={{}} versionCode="" />
        ),
      )}
    </>
  );
}

/** Página de termos ou de política: minuta com aviso enquanto não for aprovada pelo advogado. */
export function LegalPage({ doc, other }: { doc: LegalDocument; other: { href: string; label: string } }) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
      <h1 className="font-serif text-3xl">{doc.title}</h1>
      {isDraft && (
        <p role="note" className="mt-4 rounded-xl bg-lilac p-4 text-sm text-muted">
          Este texto é uma <strong>minuta</strong> e passará por revisão jurídica antes do lançamento. Trechos marcados em destaque dependem de informações da igreja.
        </p>
      )}
      <p className="mt-4 text-muted">{doc.intro}</p>
      <div className="mt-6 space-y-8">
        {doc.sections.map((section) => (
          <section key={section.title} aria-labelledby={`s-${section.title.split(".")[0]}`}>
            <h2 id={`s-${section.title.split(".")[0]}`} className="font-serif text-xl">
              {section.title}
            </h2>
            {section.paragraphs.map((p, i) => (
              <p key={i} className="mt-2 leading-relaxed">
                <Text text={p} />
              </p>
            ))}
            {section.bullets && (
              <ul className="mt-2 list-disc space-y-1.5 pl-6 leading-relaxed">
                {section.bullets.map((b, i) => (
                  <li key={i}>
                    <Text text={b} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <p className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link href={other.href} className="inline-flex min-h-11 items-center underline">
          {other.label}
        </Link>
        <Link href="/login" className="inline-flex min-h-11 items-center underline">
          Voltar
        </Link>
      </p>
      <p className="mt-2 text-xs text-muted">Versão do texto: {TERMS_VERSION}</p>
    </main>
  );
}
