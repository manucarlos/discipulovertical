import { BIBLE_BOOKS } from "./books";

/** Referência a uma passagem. Nunca carrega o texto bíblico (regra 0.4.1 do handoff). */
export interface BibleReference {
  bookCode: string;
  bookName: string;
  chapter: number;
  verseStart: number | null;
  verseEnd: number | null;
  /** Como aparece para o leitor, por exemplo "João 3.16-18". */
  label: string;
}

export interface FoundReference {
  start: number;
  end: number;
  reference: BibleReference;
}

interface NameEntry {
  name: string;
  code: string;
  canonical: string;
}

const NAME_ENTRIES: NameEntry[] = BIBLE_BOOKS.flatMap((b) =>
  [b.name, ...(b.aliases ?? [])].map((name) => ({ name, code: b.code, canonical: b.name })),
);

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Nomes mais longos primeiro, para "1 João" ganhar de "João" e "Cântico dos Cânticos" de "Cantares".
const NAMES_BY_LENGTH = [...NAME_ENTRIES].sort((a, b) => b.name.length - a.name.length);
const LOOKUP = new Map(NAME_ENTRIES.map((e) => [e.name.toLowerCase(), e]));

// livro + capítulo, com versículo (ponto ou dois-pontos) e intervalo opcionais.
const REFERENCE_PATTERN = new RegExp(
  "(?<![\\p{L}\\d])(" +
    NAMES_BY_LENGTH.map((e) => escapeRegex(e.name).replace(/ /g, "\\s")).join("|") +
    ")\\s(\\d{1,3})(?:[.:](\\d{1,3})(?:\\s?[-–]\\s?(\\d{1,3}))?)?(?![\\p{L}\\d])",
  "gu",
);

function buildLabel(book: string, chapter: number, start: number | null, end: number | null): string {
  if (start === null) return `${book} ${chapter}`;
  if (end === null || end === start) return `${book} ${chapter}.${start}`;
  return `${book} ${chapter}.${start}-${end}`;
}

/** Encontra referências bíblicas em um texto em português ("João 3.16", "Efésios 2.8-9", "Salmos 23"). */
export function findReferences(text: string): FoundReference[] {
  const found: FoundReference[] = [];
  for (const match of text.matchAll(REFERENCE_PATTERN)) {
    const entry = LOOKUP.get(match[1].replace(/\s+/g, " ").toLowerCase());
    if (!entry) continue;
    const chapter = Number(match[2]);
    const verseStart = match[3] !== undefined ? Number(match[3]) : null;
    const verseEnd = match[4] !== undefined ? Number(match[4]) : null;
    if (chapter < 1 || (verseStart !== null && verseStart < 1)) continue;
    if (verseEnd !== null && verseStart !== null && verseEnd < verseStart) continue;
    found.push({
      start: match.index,
      end: match.index + match[0].length,
      reference: {
        bookCode: entry.code,
        bookName: entry.canonical,
        chapter,
        verseStart,
        verseEnd,
        label: buildLabel(entry.canonical, chapter, verseStart, verseEnd),
      },
    });
  }
  return found;
}

/** Lê uma única referência (ex.: o campo "versículo-chave" de uma lição). Devolve null se não for uma. */
export function parseReference(text: string): BibleReference | null {
  const trimmed = text.trim();
  const [first] = findReferences(trimmed);
  return first && first.start === 0 && first.end === trimmed.length ? first.reference : null;
}
