import { connection } from "next/server";
import { PeopleListView } from "@/components/admin/people-views";
import { parsePeopleFilters } from "@/lib/admin/people";
import { loadPeople } from "@/lib/admin/people-queries";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Pessoas · Conteúdo" };

export default async function PeoplePage(props: PageProps<"/admin/pessoas">) {
  await connection();
  const filters = parsePeopleFilters(await props.searchParams);
  const { supabase } = await requireAdmin();
  const { rows, total } = await loadPeople(supabase, filters);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PeopleListView rows={rows} total={total} filters={filters} now={new Date()} />
    </main>
  );
}
