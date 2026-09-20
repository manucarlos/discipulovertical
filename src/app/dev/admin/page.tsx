import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AdminTrailView } from "@/components/admin/trail-admin";
import type { AdminCycle } from "@/lib/admin/queries";
import { loadDevCycles } from "@/lib/dev-fixtures";

/**
 * Pré-visualização da trilha do painel de conteúdo (dados do handoff, status variados).
 * Só em desenvolvimento. Os botões de ação chamam as ações reais e pedem login; aqui só o visual importa.
 * Use ?role=editor|admin.
 */
export default async function DevAdminTrailPage(props: PageProps<"/dev/admin">) {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();
  const search = await props.searchParams;
  const role = search.role === "editor" ? "editor" : "admin";

  const statuses = ["published", "published", "in_review", "draft"] as const;
  const cycles: AdminCycle[] = loadDevCycles().map((c) => ({
    id: c.slug,
    slug: c.slug,
    title: c.title,
    description: c.description,
    position: c.number,
    planned_weeks: c.plannedWeeks,
    release_interval_days: 3,
    max_lessons_per_week: 2,
    active: true,
    lessons: c.lessons.map((l, i) => ({
      id: l.id,
      cycle_id: c.slug,
      slug: l.id,
      title: l.title,
      position: l.order,
      status: c.number === 1 ? statuses[Math.min(i, 3)] : "draft",
      has_placeholders: l.hasPlaceholders,
      required: i !== 6,
      sensitive: l.id === "c2-l04",
      estimated_minutes: l.estimatedMinutes,
    })),
  }));

  return <AdminTrailView cycles={cycles} role={role} ok="Exemplo de mensagem de sucesso." />;
}
