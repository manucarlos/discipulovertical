import { DEFAULT_CHURCH_NAME, withChurchDeep } from "../church";
import { sqlText } from "@/lib/content/to-sql";
import type { LessonContent } from "@/lib/content/types";
import type { LibraryLesson, LibraryTrack } from "./types";

export interface LibrarySqlOptions {
  /** Só para homologação: publica as lições sem [PREENCHER] e as trilhas cujas lições estão todas publicadas. */
  publish?: boolean;
  /** Nome da igreja: entra no lugar do marcador {{igreja}} dos textos das lições. */
  churchName?: string;
}

export const PRACTICE_TITLE = "Desafio do dia";
export const DRAFT_NOTICE = "Rascunho da biblioteca do Grupo de Discipulado. Revisão pastoral obrigatória antes de publicar.";

const sqlTextArray = (values: string[]) => `array[${values.map(sqlText).join(", ")}]::text[]`;

/** O conteúdo versionado de uma lição da biblioteca (mesmo formato da trilha, com o guia do encontro). */
export function libraryContent(lesson: LibraryLesson): LessonContent {
  return {
    blocks: lesson.blocks,
    practice: { title: PRACTICE_TITLE, items: [lesson.challenge] },
    reflection: lesson.reflection,
    guide: lesson.guide,
  };
}

export const lessonTags = (lesson: LibraryLesson) => [lesson.theme, ...(lesson.sensitive ? ["sensível"] : [])];

/**
 * Gera o SQL que cria a biblioteca e as trilhas prontas (tudo como RASCUNHO). Seguro para repetir: lição ou trilha
 * que já existe é ignorada (nunca sobrescreve o que o pastor editou). Roda numa transação, no SQL Editor do Supabase.
 */
export function buildLibrarySql(lessonTemplates: LibraryLesson[], tracks: LibraryTrack[], options: LibrarySqlOptions = {}): string {
  const lessons = withChurchDeep(lessonTemplates, options.churchName ?? DEFAULT_CHURCH_NAME);
  const out: string[] = [
    "-- Biblioteca do Grupo de Discipulado (gerada por scripts/import-library.ts). Não edite à mão.",
    `-- ${lessons.length} lição(ões) e ${tracks.length} trilha(s). Tudo entra como ${options.publish ? "PUBLICADO (exceto o que tem [PREENCHER])" : "RASCUNHO"}.`,
    "-- Seguro para repetir: o que já existe é ignorado.",
    "begin;",
    "",
  ];

  for (const lesson of lessons) {
    const content = libraryContent(lesson);
    const json = JSON.stringify(content);
    const placeholders = json.includes("[PREENCHER");
    const status = options.publish && !placeholders ? "published" : "draft";
    out.push(
      "do $lib$",
      "declare",
      "  v_lesson uuid;",
      "  v_version uuid := gen_random_uuid();",
      "begin",
      `  if exists (select 1 from public.lessons where slug = ${sqlText(lesson.slug)}) then`,
      `    raise notice '${lesson.slug}: já existe, ignorada';`,
      "  else",
      "    insert into public.lessons (kind, cycle_id, slug, title, objective, position, estimated_minutes, tags,",
      "                                key_verse_ref, sensitive, themes, has_placeholders, status, current_version_id)",
      `    values ('library', null, ${sqlText(lesson.slug)}, ${sqlText(lesson.title)}, ${sqlText(lesson.objective)}, ${lesson.n},`,
      `            ${lesson.minutes}, ${sqlTextArray(lessonTags(lesson))}, ${sqlText(lesson.keyVerse)}, ${lesson.sensitive},`,
      `            ${sqlTextArray([lesson.theme])}, ${placeholders}, '${status}', v_version)`,
      "    returning id into v_lesson;",
      "",
      "    insert into public.lesson_versions (id, lesson_id, content, note)",
      `    values (v_version, v_lesson, ${sqlText(json)}::jsonb, 'Importação da biblioteca');`,
      "",
      "    insert into public.lesson_internal_notes (lesson_id, pastoral_review_note, draft_notice)",
      `    values (v_lesson, ${sqlText(lesson.reviewNote)}, ${sqlText(DRAFT_NOTICE)});`,
      `    raise notice '${lesson.slug}: importada (${status})';`,
      "  end if;",
      "end",
      "$lib$;",
      "",
    );
  }

  for (const track of tracks) {
    const days = track.lessons.map((n, i) => {
      const lesson = lessons.find((l) => l.n === n);
      if (!lesson) throw new Error(`A trilha "${track.title}" usa a lição ${n}, que não existe na biblioteca.`);
      return `(${i + 1}, ${sqlText(lesson.slug)})`;
    });
    out.push(
      "do $trk$",
      "declare",
      "  v_track uuid;",
      "  v_days int;",
      "begin",
      `  if exists (select 1 from public.tracks where title = ${sqlText(track.title)}) then`,
      `    raise notice '${track.title.replace(/'/g, "''")}: trilha já existe, ignorada';`,
      "  else",
      "    insert into public.tracks (title, description, themes, status)",
      `    values (${sqlText(track.title)}, ${sqlText(track.description)}, ${sqlTextArray(track.themes)}, 'draft')`,
      "    returning id into v_track;",
      "    insert into public.track_days (track_id, day_number, lesson_id)",
      "    select v_track, d.n, l.id",
      `    from (values ${days.join(", ")}) as d(n, slug)`,
      "    join public.lessons l on l.slug = d.slug;",
      "    select count(*) into v_days from public.track_days where track_id = v_track;",
      `    if v_days <> ${track.lessons.length} then`,
      `      raise exception 'A trilha % ficou incompleta: faltam lições da biblioteca.', ${sqlText(track.title)};`,
      "    end if;",
      ...(options.publish
        ? [
            "    if not exists (select 1 from public.track_days d join public.lessons l on l.id = d.lesson_id where d.track_id = v_track and l.status <> 'published') then",
            "      update public.tracks set status = 'published' where id = v_track;",
            "    end if;",
          ]
        : []),
      "  end if;",
      "end",
      "$trk$;",
      "",
    );
  }

  out.push(
    "commit;",
    "",
    "-- Conferência: deve listar as lições e as trilhas importadas.",
    "select l.position as n, l.slug, l.status, l.sensitive, l.has_placeholders from public.lessons l where l.kind = 'library' order by l.position;",
    "select t.title, t.status, (select count(*) from public.track_days d where d.track_id = t.id) as dias from public.tracks t order by t.created_at;",
    "",
  );
  return out.join("\n");
}
