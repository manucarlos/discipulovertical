import type { SupabaseClient } from "@supabase/supabase-js";
import { asLessonContent } from "../content/validate";
import type { LessonContent } from "../content/types";
import type { LessonStatus } from "./status";

export interface AdminLesson {
  id: string;
  cycle_id: string;
  slug: string;
  title: string;
  position: number;
  status: LessonStatus;
  has_placeholders: boolean;
  required: boolean;
  sensitive: boolean;
  estimated_minutes: number | null;
}

export interface AdminCycle {
  id: string;
  slug: string;
  title: string;
  description: string;
  position: number;
  planned_weeks: number | null;
  release_interval_days: number;
  max_lessons_per_week: number;
  active: boolean;
  lessons: AdminLesson[];
}

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Falha ao carregar ${what}: ${result.error.message}`);
  return result.data ?? ([] as unknown as T);
}

/** Todos os ciclos e lições, em qualquer status (a RLS só entrega isso à equipe). */
export async function loadAdminTrail(supabase: SupabaseClient): Promise<AdminCycle[]> {
  const [cycles, lessons] = await Promise.all([
    supabase
      .from("cycles")
      .select("id, slug, title, description, position, planned_weeks, release_interval_days, max_lessons_per_week, active")
      .order("position"),
    supabase
      .from("lessons")
      .select("id, cycle_id, slug, title, position, status, has_placeholders, required, sensitive, estimated_minutes")
      .order("position"),
  ]);
  const cycleRows = check<Omit<AdminCycle, "lessons">[]>(cycles, "os ciclos");
  const lessonRows = check<AdminLesson[]>(lessons, "as lições");
  return cycleRows.map((c) => ({ ...c, lessons: lessonRows.filter((l) => l.cycle_id === c.id) }));
}

export interface EditorNotes {
  pastoralReviewNote: string;
  videoSuggestion: string;
  draftNotice: string;
  buttonSuggestion: string;
}

export interface EditorQuizQuestion {
  prompt: string;
  options: Record<string, string>;
  correct: string;
  explanation: string;
}

export interface VersionInfo {
  id: string;
  createdAt: string;
  note: string | null;
  authorName: string | null;
}

export interface LessonForEditing {
  id: string;
  slug: string;
  cycleId: string;
  cycleTitle: string;
  title: string;
  objective: string;
  keyVerse: string;
  estimatedMinutes: number | null;
  tags: string[];
  required: boolean;
  sensitive: boolean;
  status: LessonStatus;
  hasPlaceholders: boolean;
  currentVersionId: string | null;
  content: LessonContent;
  notes: EditorNotes;
  quiz: EditorQuizQuestion[];
  versions: VersionInfo[];
}

/** Carrega uma lição inteira para edição: campos, versão atual, notas internas, quiz e histórico. */
export async function loadLessonForEditing(supabase: SupabaseClient, slug: string): Promise<LessonForEditing | null> {
  const { data: lesson, error } = await supabase
    .from("lessons")
    .select(
      "id, slug, cycle_id, title, objective, key_verse_ref, estimated_minutes, tags, required, sensitive, status, has_placeholders, current_version_id, cycles(title)",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar a lição: ${error.message}`);
  if (!lesson) return null;

  const [versionRes, notesRes, quizRes, versionsRes] = await Promise.all([
    lesson.current_version_id
      ? supabase.from("lesson_versions").select("content").eq("id", lesson.current_version_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("lesson_internal_notes")
      .select("pastoral_review_note, video_suggestion, draft_notice, button_suggestion")
      .eq("lesson_id", lesson.id)
      .maybeSingle(),
    supabase
      .from("quiz_questions")
      .select("prompt, options, correct_option, explanation, position")
      .eq("lesson_id", lesson.id)
      .order("position"),
    supabase
      .from("lesson_versions")
      .select("id, created_at, note, author_id")
      .eq("lesson_id", lesson.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const content =
    asLessonContent(versionRes.data?.content) ?? ({ blocks: [], practice: null, reflection: null } as LessonContent);

  const versionRows = check<{ id: string; created_at: string; note: string | null; author_id: string | null }[]>(
    versionsRes,
    "o histórico",
  );
  // Nomes dos autores: a RLS só deixa ver o próprio perfil (e o Admin vê todos); os demais ficam anônimos.
  const authorIds = [...new Set(versionRows.map((v) => v.author_id).filter((id): id is string => id !== null))];
  const names = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", authorIds);
    for (const p of profiles ?? []) names.set(p.id as string, p.display_name as string);
  }

  const notes = notesRes.data;
  const cycleRel = lesson.cycles as { title: string } | { title: string }[] | null;
  const cycleTitle = Array.isArray(cycleRel) ? (cycleRel[0]?.title ?? "") : (cycleRel?.title ?? "");

  return {
    id: lesson.id,
    slug: lesson.slug,
    cycleId: lesson.cycle_id,
    cycleTitle,
    title: lesson.title,
    objective: lesson.objective ?? "",
    keyVerse: lesson.key_verse_ref ?? "",
    estimatedMinutes: lesson.estimated_minutes,
    tags: lesson.tags ?? [],
    required: lesson.required,
    sensitive: lesson.sensitive,
    status: lesson.status,
    hasPlaceholders: lesson.has_placeholders,
    currentVersionId: lesson.current_version_id,
    content,
    notes: {
      pastoralReviewNote: notes?.pastoral_review_note ?? "",
      videoSuggestion: notes?.video_suggestion ?? "",
      draftNotice: notes?.draft_notice ?? "",
      buttonSuggestion: notes?.button_suggestion ?? "",
    },
    quiz: check<{ prompt: string; options: Record<string, string>; correct_option: string; explanation: string }[]>(
      quizRes,
      "o quiz",
    ).map((q) => ({ prompt: q.prompt, options: q.options, correct: q.correct_option, explanation: q.explanation })),
    versions: versionRows.map((v) => ({
      id: v.id,
      createdAt: v.created_at,
      note: v.note,
      authorName: v.author_id ? (names.get(v.author_id) ?? null) : null,
    })),
  };
}
