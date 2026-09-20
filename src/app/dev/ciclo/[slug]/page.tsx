import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CycleDetail } from "@/components/trail-views";
import { devTrailRows } from "@/lib/dev-fixtures";
import { buildTrailView } from "@/lib/trail/view";

/** Pré-visualização da tela "Ciclo" com dados fictícios. Só em desenvolvimento. */
export default async function DevCyclePage(props: PageProps<"/dev/ciclo/[slug]">) {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();
  const { slug } = await props.params;
  const search = await props.searchParams;
  const now = new Date();
  const { cycles, lessons, progress } = devTrailRows(now);
  const cycle = buildTrailView(cycles, lessons, progress, now).cycles.find((c) => c.slug === slug);
  if (!cycle) notFound();
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <p className="mb-6 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
        Pré-visualização com dados fictícios (só em desenvolvimento).
      </p>
      <CycleDetail
        cycle={cycle}
        now={now}
        banners={{
          completedLesson: search.concluida ? cycle.lessons[1]?.title : undefined,
          cycleCompleted: search.ciclo === "1",
          lockedNotice: search.bloqueada === "1",
        }}
      />
    </main>
  );
}
