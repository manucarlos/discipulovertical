import type { SupabaseClient } from "@supabase/supabase-js";
import type { BibleVersionInfo } from "../bible/provider";
import { asLessonContent } from "../content/validate";
import type { LessonContent } from "../content/types";
import { buildTrailView, type CycleRow, type LessonRow, type ProgressRow, type TrailView } from "./view";

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Falha ao carregar ${what}: ${result.error.message}`);
  return result.data ?? ([] as unknown as T);
}

/** Carrega ciclos, lições publicadas e o progresso da pessoa, e monta a trilha (RLS filtra o que ela pode ver). */
export async function loadTrail(supabase: SupabaseClient, userId: string, now = new Date()): Promise<TrailView> {
  const [cycles, lessons, progress] = await Promise.all([
    supabase
      .from("cycles")
      .select("id, slug, title, description, position, planned_weeks, release_interval_days, max_lessons_per_week")
      .eq("active", true)
      .order("position"),
    supabase
      .from("lessons")
      .select("id, cycle_id, slug, title, position, estimated_minutes, required")
      .eq("status", "published")
      .order("position"),
    supabase
      .from("lesson_progress")
      .select("lesson_id, released_at, started_at, completed_at, last_position")
      .eq("user_id", userId),
  ]);

  return buildTrailView(
    check<CycleRow[]>(cycles, "os ciclos"),
    check<LessonRow[]>(lessons, "as lições"),
    check<ProgressRow[]>(progress, "o progresso"),
    now,
  );
}

export interface LessonDetail {
  id: string;
  title: string;
  objective: string;
  estimatedMinutes: number | null;
  tags: string[];
  keyVerseRef: string | null;
  content: LessonContent;
}

/**
 * Carrega o texto de uma lição publicada. Só lê colunas próprias do membro:
 * notas internas e quiz ficam em outras tabelas e a RLS não os entrega.
 */
export async function loadLessonDetail(supabase: SupabaseClient, slug: string): Promise<LessonDetail | null> {
  const { data: lesson, error } = await supabase
    .from("lessons")
    .select("id, title, objective, estimated_minutes, tags, key_verse_ref, current_version_id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar a lição: ${error.message}`);
  if (!lesson?.current_version_id) return null;

  const { data: version, error: versionError } = await supabase
    .from("lesson_versions")
    .select("content")
    .eq("id", lesson.current_version_id)
    .maybeSingle();
  if (versionError) throw new Error(`Falha ao carregar o texto da lição: ${versionError.message}`);

  const content = asLessonContent(version?.content);
  if (!content) return null;

  return {
    id: lesson.id,
    title: lesson.title,
    objective: lesson.objective,
    estimatedMinutes: lesson.estimated_minutes,
    tags: lesson.tags ?? [],
    keyVerseRef: lesson.key_verse_ref,
    content,
  };
}

export async function loadBibleVersions(supabase: SupabaseClient): Promise<BibleVersionInfo[]> {
  const rows = check<
    { code: string; name: string; copyright_notice: string | null; external_reader_url: string | null }[]
  >(await supabase.from("bible_versions").select("code, name, copyright_notice, external_reader_url"), "as versões da Bíblia");
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    copyrightNotice: r.copyright_notice,
    externalReaderUrl: r.external_reader_url,
  }));
}

export interface ChurchPage {
  slug: string;
  title: string;
  body: string;
}

export async function loadChurchPages(supabase: SupabaseClient): Promise<ChurchPage[]> {
  return check<ChurchPage[]>(
    await supabase.from("church_pages").select("slug, title, body").order("position"),
    "a página da igreja",
  );
}
