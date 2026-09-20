import { connection } from "next/server";
import { ContentMetricsView, DashboardView } from "@/components/admin/dashboard-views";
import { loadContentMetrics, loadDashboard, parsePeriod } from "@/lib/admin/dashboard";
import { requireStaff } from "@/lib/auth";

export const metadata = { title: "Painel · Conteúdo" };

/** Admin: indicadores completos. Editor: só métricas de conteúdo (sem dados de pessoas). */
export default async function DashboardPage(props: PageProps<"/admin/painel">) {
  await connection();
  const search = await props.searchParams;
  const { supabase, role } = await requireStaff();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      {role === "admin" ? (
        <DashboardView data={await loadDashboard(supabase, parsePeriod(search.dias))} />
      ) : (
        <ContentMetricsView lessons={await loadContentMetrics(supabase)} />
      )}
    </main>
  );
}
