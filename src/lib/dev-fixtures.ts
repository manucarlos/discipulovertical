import fs from "node:fs";
import path from "node:path";
import { parseHandoff } from "./content/parse-handoff";
import type { ParsedCycle } from "./content/types";
import type { BibleVersionInfo } from "./bible/provider";
import type { CycleRow, LessonRow, ProgressRow } from "./trail/view";

/**
 * Dados de PRÉ-VISUALIZAÇÃO para as páginas /dev (nunca em produção): usam o conteúdo real do
 * handoff e um progresso fictício, para ver as telas sem precisar do Supabase.
 */
export function loadDevCycles(): ParsedCycle[] {
  return parseHandoff(fs.readFileSync(path.join(process.cwd(), "docs", "HANDOFF.md"), "utf8"));
}

export const DEV_BIBLE_VERSIONS: BibleVersionInfo[] = [
  { code: "NTLH", name: "Nova Tradução na Linguagem de Hoje", copyrightNotice: null, externalReaderUrl: "https://www.biblegateway.com/passage/?search={query}&version=NTLH" },
  { code: "NVI", name: "Nova Versão Internacional", copyrightNotice: null, externalReaderUrl: "https://www.biblegateway.com/passage/?search={query}&version=NVI-PT" },
];

export function devTrailRows(now: Date): { cycles: CycleRow[]; lessons: LessonRow[]; progress: ProgressRow[] } {
  const parsed = loadDevCycles().filter((c) => c.number <= 2); // ciclo 3 só tem rascunhos com [PREENCHER]
  const day = 24 * 60 * 60 * 1000;
  const ago = (days: number) => new Date(now.getTime() - days * day).toISOString();

  const cycles: CycleRow[] = parsed.map((c) => ({
    id: c.slug, slug: c.slug, title: c.title, description: c.description, position: c.number,
    planned_weeks: c.plannedWeeks, release_interval_days: 3, max_lessons_per_week: 2,
  }));
  const lessons: LessonRow[] = parsed.flatMap((c) =>
    c.lessons.map((l) => ({
      id: l.id, cycle_id: c.slug, slug: l.id, title: l.title, position: l.order,
      estimated_minutes: l.estimatedMinutes, required: true,
    })),
  );
  const progress: ProgressRow[] = [
    { lesson_id: "c1-l01", released_at: ago(12), started_at: ago(12), completed_at: ago(12), last_position: 1 },
    { lesson_id: "c1-l02", released_at: ago(8), started_at: ago(8), completed_at: ago(8), last_position: 1 },
    { lesson_id: "c1-l03", released_at: ago(1), started_at: ago(1), completed_at: null, last_position: 0.3 },
  ];
  return { cycles, lessons, progress };
}
