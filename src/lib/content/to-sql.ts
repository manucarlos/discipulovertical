import { DEFAULT_CHURCH_NAME, withChurchDeep } from "../church";
import type { ParsedCycle, ParsedLesson } from "./types";

export interface ImportSqlOptions {
  /**
   * Publica as lições sem [PREENCHER] em vez de deixá-las como rascunho.
   * Só para testes em homologação: em produção o pastor revisa e publica no painel.
   */
  publish?: boolean;
  /** Nome da igreja: entra no lugar do marcador {{igreja}} dos textos das lições. */
  churchName?: string;
  /**
   * O slug da igreja dona do conteúdo importado (banco único multi-igreja, migração 0026). Obrigatório: toda
   * lição e ciclo agora pertence a uma igreja. Resolvido em SQL (`select id from public.churches where slug =
   * ...`), não como um UUID literal — o arquivo gerado continua colável sem precisar de uma conexão ao banco
   * na hora de gerar.
   */
  churchSlug: string;
}

/** Literal de texto do Postgres. Depende de standard_conforming_strings = on (padrão). */
export function sqlText(value: string): string {
  if (value.includes("\0")) throw new Error("texto com caractere nulo não pode ser importado");
  return `'${value.replace(/'/g, "''")}'`;
}

const sqlNullableText = (value: string | null) => (value === null ? "null" : sqlText(value));
const sqlTextArray = (values: string[]) => `array[${values.map(sqlText).join(", ")}]::text[]`;

/**
 * Gera um SQL que cria ciclos e lições como RASCUNHO, para a igreja `options.churchSlug`. É seguro repetir:
 *   - ciclos e lições que já existem PARA AQUELA IGREJA são ignorados (nunca sobrescreve o que o pastor editou);
 *   - roda de uma vez só (transação): se algo falhar, nada é gravado.
 * Feito para o SQL Editor do Supabase, que executa como dono do banco (sem RLS, sem chaves).
 */
export function buildImportSql(template: ParsedCycle[], options: ImportSqlOptions): string {
  const cycles = withChurchDeep(template, options.churchName ?? DEFAULT_CHURCH_NAME);
  const out: string[] = [];
  const lessonCount = cycles.reduce((n, c) => n + c.lessons.length, 0);
  const church = sqlText(options.churchSlug);

  out.push(
    "-- Importação de conteúdo (gerada por scripts/import-content.ts). Não edite à mão.",
    `-- ${cycles.length} ciclo(s), ${lessonCount} lição(ões), para a igreja "${options.churchSlug}".`,
    `-- Lições novas entram como ${options.publish ? "PUBLICADAS (exceto as com [PREENCHER])" : "RASCUNHO"}.`,
    "-- Seguro para repetir: o que já existe (para esta igreja) é ignorado.",
    "begin;",
    "",
    `do $church$ begin`,
    `  if not exists (select 1 from public.churches where slug = ${church}) then`,
    `    raise exception 'Igreja "%" não encontrada. Cadastre-a antes de importar o conteúdo.', ${church};`,
    `  end if;`,
    `end $church$;`,
    "",
  );

  for (const cycle of cycles) {
    out.push(
      `insert into public.cycles (church_id, slug, title, description, position, planned_weeks)`,
      `values ((select id from public.churches where slug = ${church}), ${sqlText(cycle.slug)}, ${sqlText(cycle.title)}, ${sqlText(cycle.description)}, ${cycle.number}, ${cycle.plannedWeeks})`,
      `on conflict (church_id, slug) do nothing;`,
      "",
    );
    for (const lesson of cycle.lessons) out.push(lessonBlock(cycle, lesson, options, church), "");
  }

  const slugs = cycles.flatMap((c) => c.lessons.map((l) => sqlText(l.id)));
  out.push(
    "commit;",
    "",
    "-- Conferência: deve listar todas as lições importadas.",
    "select l.slug, l.status, l.has_placeholders, l.estimated_minutes",
    "from public.lessons l join public.cycles c on c.id = l.cycle_id",
    `where l.church_id = (select id from public.churches where slug = ${church}) and l.slug in (${slugs.join(", ")})`,
    "order by c.position, l.position;",
    "",
  );
  return out.join("\n");
}

function lessonBlock(cycle: ParsedCycle, lesson: ParsedLesson, options: ImportSqlOptions, church: string): string {
  const status = options.publish && !lesson.hasPlaceholders ? "published" : "draft";
  const internal = lesson.internal;
  const hasInternal = Object.values(internal).some((v) => v !== null);

  const quiz = lesson.quiz.map(
    (q) =>
      `    insert into public.quiz_questions (church_id, lesson_id, position, prompt, options, correct_option, explanation)\n` +
      `    values (v_church, v_lesson, ${q.position}, ${sqlText(q.prompt)}, ${sqlText(JSON.stringify(q.options))}::jsonb, ${sqlText(q.correct)}, ${sqlText(q.explanation)});`,
  );

  return [
    `do $import$`,
    `declare`,
    `  v_church uuid := (select id from public.churches where slug = ${church});`,
    `  v_cycle uuid;`,
    `  v_lesson uuid;`,
    `  v_version uuid := gen_random_uuid();`,
    `begin`,
    `  select id into v_cycle from public.cycles where church_id = v_church and slug = ${sqlText(cycle.slug)};`,
    `  if exists (select 1 from public.lessons where church_id = v_church and slug = ${sqlText(lesson.id)}) then`,
    `    raise notice '${lesson.id}: já existe para esta igreja, ignorada';`,
    `  else`,
    `    insert into public.lessons (church_id, cycle_id, slug, title, objective, position, estimated_minutes, tags,`,
    `                                key_verse_ref, has_placeholders, status, current_version_id)`,
    `    values (v_church, v_cycle, ${sqlText(lesson.id)}, ${sqlText(lesson.title)}, ${sqlText(lesson.objective)}, ${lesson.order},`,
    `            ${lesson.estimatedMinutes}, ${sqlTextArray(lesson.tags)}, ${sqlText(lesson.keyVerse)},`,
    `            ${lesson.hasPlaceholders}, '${status}', v_version)`,
    `    returning id into v_lesson;`,
    ``,
    `    insert into public.lesson_versions (church_id, id, lesson_id, content, note)`,
    `    values (v_church, v_version, v_lesson, ${sqlText(JSON.stringify(lesson.content))}::jsonb, 'Importação inicial do handoff');`,
    ``,
    ...(hasInternal
      ? [
          `    insert into public.lesson_internal_notes (church_id, lesson_id, pastoral_review_note, video_suggestion, draft_notice, button_suggestion)`,
          `    values (v_church, v_lesson, ${sqlNullableText(internal.pastoralReviewNote)}, ${sqlNullableText(internal.videoSuggestion)}, ${sqlNullableText(internal.draftNotice)}, ${sqlNullableText(internal.buttonSuggestion)});`,
          ``,
        ]
      : []),
    ...quiz,
    `    raise notice '${lesson.id}: importada (${status})';`,
    `  end if;`,
    `end`,
    `$import$;`,
  ].join("\n");
}
