import { notFound } from "next/navigation";
import { CycleDetail } from "@/components/trail-views";
import { requireMember } from "@/lib/auth";
import { loadTrail } from "@/lib/trail/queries";

export const metadata = { title: "Ciclo" };

export default async function CyclePage(props: PageProps<"/ciclo/[slug]">) {
  const { slug } = await props.params;
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const { supabase, user } = await requireMember();
  const now = new Date();
  const view = await loadTrail(supabase, user.id, now);

  const cycle = view.cycles.find((c) => c.slug === slug);
  if (!cycle) notFound();

  const justCompleted = cycle.lessons.find((l) => l.slug === first(search.concluida));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <CycleDetail
        cycle={cycle}
        now={now}
        banners={{
          completedLesson: justCompleted?.title,
          cycleCompleted: first(search.ciclo) === "1" && cycle.complete,
          lockedNotice: first(search.bloqueada) === "1",
        }}
      />
    </main>
  );
}
