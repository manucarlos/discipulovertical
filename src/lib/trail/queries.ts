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
      .eq("kind", "trail") // as lições da biblioteca do grupo não entram na trilha de novos convertidos
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
  status: "published" | "archived";
  content: LessonContent;
}

/**
 * Carrega o texto de uma lição publicada. Só lê colunas próprias do membro:
 * notas internas e quiz ficam em outras tabelas e a RLS não os entrega.
 */
export async function loadLessonDetail(
  supabase: SupabaseClient,
  slug: string,
  status: "published" | "archived" = "published",
): Promise<LessonDetail | null> {
  const { data: lesson, error } = await supabase
    .from("lessons")
    .select("id, title, objective, estimated_minutes, tags, key_verse_ref, current_version_id")
    .eq("slug", slug)
    .eq("status", status)
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
    status,
    content,
  };
}

export interface ArchivedLesson {
  slug: string;
  title: string;
  cycleSlug: string;
  completedAt: string;
}

/**
 * RN-11: lições arquivadas que ESTA pessoa já concluiu. Ficam de fora da trilha, mas continuam abertas
 * para releitura. (A RLS só entrega lição arquivada a quem tem progresso nela; aqui filtramos pelo que
 * a pessoa concluiu, já que a equipe enxerga todas as arquivadas.)
 */
export async function loadArchivedHistory(supabase: SupabaseClient, userId: string): Promise<ArchivedLesson[]> {
  const progress = check<{ lesson_id: string; completed_at: string }[]>(
    await supabase.from("lesson_progress").select("lesson_id, completed_at").eq("user_id", userId).eq("status", "completed"),
    "o histórico",
  );
  if (progress.length === 0) return [];

  const lessons = check<{ id: string; slug: string; title: string; cycles: { slug: string } | { slug: string }[] | null }[]>(
    await supabase
      .from("lessons")
      .select("id, slug, title, cycles(slug)")
      .eq("status", "archived")
      .in("id", progress.map((p) => p.lesson_id)),
    "as lições arquivadas",
  );
  const completedAt = new Map(progress.map((p) => [p.lesson_id, p.completed_at]));
  return lessons
    .map((l) => ({
      slug: l.slug,
      title: l.title,
      cycleSlug: (Array.isArray(l.cycles) ? l.cycles[0]?.slug : l.cycles?.slug) ?? "",
      completedAt: completedAt.get(l.id) ?? "",
    }))
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
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
