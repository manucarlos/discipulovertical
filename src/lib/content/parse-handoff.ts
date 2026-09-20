import { parseReference } from "../bible/references";
import type {
  LessonBlock,
  LessonContent,
  LessonInternalNotes,
  LessonPractice,
  ParsedCycle,
  ParsedLesson,
  QuizQuestion,
} from "./types";

/** Descrições dos ciclos: vêm da tabela da seção 3 da Parte 1 do handoff. */
const CYCLE_DESCRIPTIONS: Record<number, string> = {
  1: "Salvação, identidade em Cristo, leitura bíblica, oração, comunhão e batismo.",
  2: "Mordomia cristã, dízimo, generosidade, vida financeira, disciplinas espirituais e grupo pequeno.",
  3: "História, propósito, valores, doutrina, ministérios e compromisso de membresia.",
};

export class HandoffParseError extends Error {
  constructor(where: string, message: string) {
    super(`${where}: ${message}`);
    this.name = "HandoffParseError";
  }
}

const PLACEHOLDER = /\[PREENCHER/g;

/** Lê a Parte 2 do handoff (ciclos e lições) e devolve o conteúdo estruturado e validado. */
export function parseHandoff(markdown: string): ParsedCycle[] {
  const text = markdown.replace(/\r\n/g, "\n");
  const start = text.search(/^# PARTE 2\b/m);
  if (start === -1) throw new HandoffParseError("handoff", "não encontrei o título '# PARTE 2'");
  const rest = text.slice(start);
  const endMatch = rest.slice(1).search(/^# PARTE 3\b/m);
  const part2 = endMatch === -1 ? rest : rest.slice(0, endMatch + 1);

  const cycles: ParsedCycle[] = [];
  let currentCycle: ParsedCycle | null = null;
  let lessonLines: string[] | null = null;
  let lessonTitle = "";

  const flushLesson = () => {
    if (lessonLines && currentCycle) {
      currentCycle.lessons.push(parseLesson(currentCycle, lessonTitle, lessonLines));
    }
    lessonLines = null;
  };

  for (const line of part2.split("\n")) {
    const cycleMatch = /^## Ciclo (\d+): (.+?)\s*$/.exec(line);
    const lessonMatch = /^### Lição (\d+): (.+?)\s*$/.exec(line);

    if (cycleMatch) {
      flushLesson();
      const number = Number(cycleMatch[1]);
      currentCycle = {
        number,
        slug: `c${number}`,
        title: cycleMatch[2],
        description: CYCLE_DESCRIPTIONS[number] ?? "",
        plannedWeeks: 0,
        closure: "",
        lessons: [],
      };
      cycles.push(currentCycle);
    } else if (lessonMatch && currentCycle) {
      flushLesson();
      lessonTitle = lessonMatch[2];
      lessonLines = [];
    } else if (lessonLines) {
      lessonLines.push(line);
    } else if (currentCycle) {
      const intro = /^(\d+) semanas?, (\d+) lições?\. Encerramento presencial: (.+?)\.?\s*$/.exec(line);
      if (intro) {
        currentCycle.plannedWeeks = Number(intro[1]);
        currentCycle.closure = intro[3];
      }
    }
  }
  flushLesson();

  for (const cycle of cycles) {
    if (cycle.plannedWeeks === 0) {
      throw new HandoffParseError(`Ciclo ${cycle.number}`, "linha de duração e encerramento não encontrada");
    }
    cycle.lessons.sort((a, b) => a.order - b.order);
  }
  return cycles;
}

// ---------------------------------------------------------------------------
// Uma lição
// ---------------------------------------------------------------------------

function parseLesson(cycle: ParsedCycle, headingTitle: string, lines: string[]): ParsedLesson {
  const raw = lines.join("\n");
  const fence = /```yaml\n([\s\S]*?)\n```/.exec(raw);
  if (!fence) throw new HandoffParseError(`${cycle.slug} "${headingTitle}"`, "bloco YAML de metadados não encontrado");

  const meta = parseSimpleYaml(fence[1]);
  const id = requireString(meta, "id", headingTitle);
  const where = id;

  if (meta.cycle !== cycle.number) {
    throw new HandoffParseError(where, `o YAML diz ciclo ${String(meta.cycle)}, mas a lição está no Ciclo ${cycle.number}`);
  }
  const title = requireString(meta, "title", where);
  if (title !== headingTitle) {
    throw new HandoffParseError(where, `título do YAML ("${title}") difere do título da seção ("${headingTitle}")`);
  }

  const afterYaml = raw.slice(fence.index + fence[0].length);
  const { content, quiz, internal, objective, keyVerse } = parseLessonBody(afterYaml, where);

  const keyVerseYaml = requireString(meta, "key_verse", where);
  if (keyVerse !== keyVerseYaml) {
    throw new HandoffParseError(where, `versículo-chave do YAML ("${keyVerseYaml}") difere do texto ("${keyVerse}")`);
  }
  if (!parseReference(keyVerse)) {
    throw new HandoffParseError(where, `"${keyVerse}" não é uma referência bíblica reconhecida`);
  }

  // Marcadores [PREENCHER] em qualquer parte da lição (inclusive nas notas internas) bloqueiam a publicação.
  const placeholderCount = (afterYaml.match(PLACEHOLDER) ?? []).length;
  const declaredCount = requireNumber(meta, "placeholder_count", where);
  const declaredHas = meta.has_placeholders === true;
  if (placeholderCount !== declaredCount || (placeholderCount > 0) !== declaredHas) {
    throw new HandoffParseError(
      where,
      `o YAML declara ${declaredCount} marcador(es) [PREENCHER] (has_placeholders=${String(declaredHas)}), mas o texto tem ${placeholderCount}`,
    );
  }

  const tags = meta.tags;
  if (!Array.isArray(tags)) throw new HandoffParseError(where, "campo 'tags' ausente ou inválido");

  return {
    id,
    cycle: cycle.number,
    order: requireNumber(meta, "order", where),
    title,
    objective,
    keyVerse,
    estimatedMinutes: requireNumber(meta, "estimated_minutes", where),
    tags,
    hasPlaceholders: placeholderCount > 0,
    placeholderCount,
    content,
    quiz,
    internal,
  };
}

// ---------------------------------------------------------------------------
// YAML mínimo (só o que os metadados usam)
// ---------------------------------------------------------------------------

type YamlValue = string | number | boolean | string[];

function parseSimpleYaml(text: string): Record<string, YamlValue> {
  const out: Record<string, YamlValue> = {};
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!m) throw new HandoffParseError("YAML", `linha não reconhecida: ${line}`);
    const [, key, value] = m;
    if (value.startsWith("[") || value.startsWith('"')) out[key] = JSON.parse(value) as YamlValue;
    else if (value === "true" || value === "false") out[key] = value === "true";
    else if (/^-?\d+$/.test(value)) out[key] = Number(value);
    else out[key] = value;
  }
  return out;
}

function requireString(meta: Record<string, YamlValue>, key: string, where: string): string {
  const v = meta[key];
  if (typeof v !== "string" || v === "") throw new HandoffParseError(where, `campo '${key}' ausente no YAML`);
  return v;
}

function requireNumber(meta: Record<string, YamlValue>, key: string, where: string): number {
  const v = meta[key];
  if (typeof v !== "number") throw new HandoffParseError(where, `campo '${key}' ausente ou inválido no YAML`);
  return v;
}

// ---------------------------------------------------------------------------
// Corpo da lição: primeiro em "tokens" de markdown, depois em seções
// ---------------------------------------------------------------------------

type Token =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "table"; header: string[]; rows: string[][] };

const LIST_ITEM = /^(?:[-*]|\d+\.)\s+(.*)$/;

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function tokenize(text: string, where: string): Token[] {
  const tokens: Token[] = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "" || /^---+\s*$/.test(line)) {
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      tokens.push({ kind: "heading", level: Math.max(1, heading[1].length - 2), text: heading[2] });
      i++;
      continue;
    }

    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(splitTableRow(lines[i++]));
      const [header, separator, ...body] = rows;
      if (!separator || !separator.every((c) => /^:?-{3,}:?$/.test(c))) {
        throw new HandoffParseError(where, `tabela sem linha separadora perto de "${header?.join(" | ")}"`);
      }
      if (body.some((r) => r.length !== header.length)) {
        throw new HandoffParseError(where, `tabela com linhas de tamanhos diferentes perto de "${header.join(" | ")}"`);
      }
      tokens.push({ kind: "table", header, rows: body });
      continue;
    }

    if (line.startsWith(">")) {
      const parts: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) parts.push(lines[i++].replace(/^>\s?/, ""));
      tokens.push({ kind: "quote", text: parts.join(" ").trim() });
      continue;
    }

    const listMatch = LIST_ITEM.exec(line);
    if (listMatch && !/^\*\*/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i]);
        if (!m || /^\d+\./.test(lines[i]) !== ordered) break;
        items.push(m[1].trim());
        i++;
      }
      tokens.push({ kind: "list", ordered, items });
      continue;
    }

    const parts: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6}\s|\||>)/.test(lines[i]) &&
      !(LIST_ITEM.test(lines[i]) && !/^\*\*/.test(lines[i]))
    ) {
      parts.push(lines[i++].trim());
    }
    tokens.push({ kind: "paragraph", text: parts.join(" ") });
  }
  return tokens;
}

/** Rótulos de uma linha só: o texto vem depois dos dois-pontos, na mesma linha. */
const INLINE_LABELS = {
  objective: /^\*\*Objetivo:\*\*\s*(.+)$/,
  keyVerse: /^\*\*Versículo-chave:\*\*\s*(.+)$/,
  timeAndTags: /^\*\*Tempo estimado:\*\*/,
  video: /^\*\*Sugestão de vídeo \(opcional\):\*\*\s*(.+)$/,
  button: /^\*\*Botão sugerido:\*\*\s*(.+)$/,
  pastoralNote: /^\*\*Nota para revisão pastoral:\*\*\s*(.+)$/,
  draftNotice: /^\*\*Aviso de rascunho:\*\*\s*(.+)$/,
} as const;

/** Rótulos que abrem uma seção com vários parágrafos ou listas. */
const SECTION_LABELS = {
  practice: /^\*\*(Prática da semana(?::[^*]+)?)\*\*$/,
  reflection: /^\*\*Reflexão\*\*$/,
  quiz: /^\*\*Quiz\*\*$/,
} as const;

interface ParsedBody {
  content: LessonContent;
  quiz: QuizQuestion[];
  internal: LessonInternalNotes;
  objective: string;
  keyVerse: string;
}

function parseLessonBody(text: string, where: string): ParsedBody {
  const tokens = tokenize(text, where);

  let objective: string | null = null;
  let keyVerse: string | null = null;
  const internal: LessonInternalNotes = {
    videoSuggestion: null,
    buttonSuggestion: null,
    pastoralReviewNote: null,
    draftNotice: null,
  };

  const bodyTokens: Token[] = [];
  const practiceTokens: Token[] = [];
  const reflectionTokens: Token[] = [];
  const quizTokens: Token[] = [];
  let practiceTitle: string | null = null;
  let section: "body" | "practice" | "reflection" | "quiz" = "body";

  for (const token of tokens) {
    if (token.kind === "paragraph") {
      const t = token.text;
      let m: RegExpExecArray | null;
      if ((m = INLINE_LABELS.objective.exec(t))) { objective = m[1]; continue; }
      if ((m = INLINE_LABELS.keyVerse.exec(t))) { keyVerse = m[1].trim(); continue; }
      if (INLINE_LABELS.timeAndTags.test(t)) continue;
      if ((m = INLINE_LABELS.video.exec(t))) { internal.videoSuggestion = m[1]; section = "body"; continue; }
      if ((m = INLINE_LABELS.button.exec(t))) { internal.buttonSuggestion = m[1]; section = "body"; continue; }
      if ((m = INLINE_LABELS.pastoralNote.exec(t))) { internal.pastoralReviewNote = m[1]; section = "body"; continue; }
      if ((m = INLINE_LABELS.draftNotice.exec(t))) { internal.draftNotice = m[1]; continue; }
      if ((m = SECTION_LABELS.practice.exec(t))) { practiceTitle = m[1]; section = "practice"; continue; }
      if (SECTION_LABELS.reflection.test(t)) { section = "reflection"; continue; }
      if (SECTION_LABELS.quiz.test(t)) { section = "quiz"; continue; }
    }
    if (section === "body") bodyTokens.push(token);
    else if (section === "practice") practiceTokens.push(token);
    else if (section === "reflection") reflectionTokens.push(token);
    else quizTokens.push(token);
  }

  if (!objective) throw new HandoffParseError(where, "falta a linha 'Objetivo'");
  if (!keyVerse) throw new HandoffParseError(where, "falta a linha 'Versículo-chave'");

  return {
    objective,
    keyVerse,
    internal,
    content: {
      blocks: bodyTokens.map((t) => toBlock(t, where)),
      practice: practiceTitle ? toPractice(practiceTitle, practiceTokens, where) : null,
      reflection: toReflection(reflectionTokens, where),
    },
    quiz: toQuiz(quizTokens, where),
  };
}

function toBlock(token: Token, where: string): LessonBlock {
  switch (token.kind) {
    case "heading":
      return { type: "heading", level: token.level, text: token.text };
    case "paragraph":
      return { type: "paragraph", text: token.text };
    case "list":
      return { type: "list", ordered: token.ordered, items: token.items };
    case "quote":
      return { type: "quote", text: token.text };
    case "table":
      return { type: "table", header: token.header, rows: token.rows };
    default:
      throw new HandoffParseError(where, "token de corpo desconhecido");
  }
}

function toPractice(title: string, tokens: Token[], where: string): LessonPractice {
  const items: string[] = [];
  for (const t of tokens) {
    if (t.kind !== "list") throw new HandoffParseError(where, `a seção "${title}" tem conteúdo que não é lista`);
    items.push(...t.items);
  }
  if (items.length === 0) throw new HandoffParseError(where, `a seção "${title}" está vazia`);
  return { title, items };
}

function toReflection(tokens: Token[], where: string): string | null {
  if (tokens.length === 0) return null;
  const parts = tokens.map((t) => {
    if (t.kind !== "paragraph") throw new HandoffParseError(where, "a seção 'Reflexão' tem conteúdo que não é texto");
    return t.text;
  });
  return parts.join("\n\n");
}

function toQuiz(tokens: Token[], where: string): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  let current: QuizQuestion | null = null;

  for (const t of tokens) {
    if (t.kind === "paragraph") {
      const q = /^\*\*Pergunta (\d+)\.\*\*\s*(.+)$/.exec(t.text);
      if (q) {
        current = { position: Number(q[1]), prompt: q[2], options: {}, correct: "", explanation: "" };
        questions.push(current);
        continue;
      }
      const a = /^\*\*Resposta:\*\*\s*([A-Z])\.\s*(.+)$/.exec(t.text);
      if (a && current) {
        current.correct = a[1];
        current.explanation = a[2];
        continue;
      }
    }
    if (t.kind === "list" && current && Object.keys(current.options).length === 0) {
      for (const item of t.items) {
        const o = /^([A-Z])\)\s+(.+)$/.exec(item);
        if (!o) throw new HandoffParseError(where, `alternativa mal formatada no quiz: "${item}"`);
        current.options[o[1]] = o[2];
      }
      continue;
    }
    throw new HandoffParseError(where, `conteúdo inesperado no quiz: ${JSON.stringify(t).slice(0, 80)}`);
  }

  questions.forEach((q, index) => {
    const letters = Object.keys(q.options);
    if (q.position !== index + 1) throw new HandoffParseError(where, `perguntas do quiz fora de ordem (esperava ${index + 1}, achei ${q.position})`);
    if (letters.length < 2) throw new HandoffParseError(where, `a pergunta ${q.position} tem menos de 2 alternativas`);
    if (!q.correct || !letters.includes(q.correct)) {
      throw new HandoffParseError(where, `a pergunta ${q.position} não tem uma resposta válida (${q.correct || "vazia"})`);
    }
  });
  return questions;
}
