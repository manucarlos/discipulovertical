import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ContentMetricsView, DashboardView } from "@/components/admin/dashboard-views";
import { parsePeriod } from "@/lib/admin/dashboard";
import { devDashboard, devLessonMetrics } from "@/lib/dev-dashboard";

/** Pré-visualização do painel de indicadores com números de exemplo. Só em desenvolvimento. ?role=editor e ?dias=7|30|90. */
export default async function DevDashboardPage(props: PageProps<"/dev/painel">) {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();
  const search = await props.searchParams;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <p className="mb-6 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
        Pré-visualização com números de exemplo (só em desenvolvimento).
      </p>
      {search.role === "editor" ? (
        <ContentMetricsView lessons={devLessonMetrics()} />
      ) : (
        <DashboardView data={devDashboard(parsePeriod(search.dias))} basePath="/dev/painel" peopleHref="/dev/pessoas?situacao=stalled" />
      )}
    </main>
  );
}
