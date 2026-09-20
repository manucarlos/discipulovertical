import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PeopleListView } from "@/components/admin/people-views";
import { PAGE_SIZE, parsePeopleFilters } from "@/lib/admin/people";
import { DEV_NOW, DEV_PEOPLE } from "@/lib/dev-people";

/** Pré-visualização da lista de pessoas com dados fictícios; os filtros funcionam em memória. Só em desenvolvimento. */
export default async function DevPeoplePage(props: PageProps<"/dev/pessoas">) {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();
  const filters = parsePeopleFilters(await props.searchParams);

  const term = filters.search.toLowerCase();
  const matches = DEV_PEOPLE.filter(
    (p) =>
      (!term || p.name.toLowerCase().includes(term) || p.email.toLowerCase().includes(term)) &&
      (!filters.role || p.role === filters.role) &&
      (!filters.status || p.status === filters.status),
  );
  const rows = matches.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <p className="mb-6 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
        Pré-visualização com pessoas fictícias (só em desenvolvimento).
      </p>
      <PeopleListView rows={rows} total={matches.length} filters={filters} now={DEV_NOW} basePath="/dev/pessoas" />
    </main>
  );
}
