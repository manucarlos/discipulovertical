import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PersonDetailView } from "@/components/admin/people-views";
import { devPersonDetail, DEV_NOW } from "@/lib/dev-people";
import { devTrailRows } from "@/lib/dev-fixtures";
import { buildTrailView } from "@/lib/trail/view";
import { devChangeRole } from "../actions";

/** Pré-visualização da ficha de uma pessoa com dados fictícios. Só em desenvolvimento. ?eu=1 simula a própria ficha. */
export default async function DevPersonPage(props: PageProps<"/dev/pessoas/[id]">) {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();
  const { id } = await props.params;
  const search = await props.searchParams;

  const detail = devPersonDetail(id);
  if (!detail) notFound();

  const { cycles, lessons, progress } = devTrailRows(DEV_NOW);
  const trail = buildTrailView(cycles, lessons, progress, DEV_NOW);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <p className="mb-6 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
        Pré-visualização com dados fictícios (só em desenvolvimento).
      </p>
      <PersonDetailView
        detail={detail}
        trail={trail}
        now={DEV_NOW}
        isSelf={search.eu === "1"}
        roleAction={devChangeRole}
        ok={search.ok ? "Perfil atualizado." : undefined}
        erro={search.erro ? "Não é possível remover o último administrador. Promova outra pessoa a administrador antes." : undefined}
        backHref="/dev/pessoas"
      />
    </main>
  );
}
