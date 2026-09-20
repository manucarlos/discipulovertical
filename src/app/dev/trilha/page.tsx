import { notFound } from "next/navigation";
import { connection } from "next/server";
import { TrailHome } from "@/components/trail-views";
import { devTrailRows } from "@/lib/dev-fixtures";
import { buildTrailView } from "@/lib/trail/view";

/** Pré-visualização da tela "Minha trilha" com dados fictícios. Só em desenvolvimento. */
export default async function DevTrailPage() {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();
  const now = new Date();
  const { cycles, lessons, progress } = devTrailRows(now);
  const view = buildTrailView(cycles, lessons, progress, now);
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <p className="mb-6 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
        Pré-visualização com dados fictícios (só em desenvolvimento).
      </p>
      <TrailHome name="Maria da Silva" view={view} now={now} />
    </main>
  );
}
