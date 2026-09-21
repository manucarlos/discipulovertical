import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PersonDetailView } from "@/components/admin/people-views";
import { loadPerson, loadPersonReflections } from "@/lib/admin/people-queries";
import { requireAdmin } from "@/lib/auth";
import { loadSettings } from "@/lib/features";
import { loadTrail } from "@/lib/trail/queries";
import { changeRole } from "../actions";

export const metadata = { title: "Ficha · Conteúdo" };

// Identificador de pessoa (uuid). Qualquer outra coisa nem chega ao banco.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PersonPage(props: PageProps<"/admin/pessoas/[id]">) {
  await connection();
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const { supabase, user } = await requireAdmin();
  const detail = await loadPerson(supabase, id);
  if (!detail) notFound();

  // LGPD: consultar os dados de outra pessoa fica registrado (e, se o registro falhar, a ficha não abre).
  const { error: logError } = await supabase.rpc("audit_person_view", { p_target: id });
  if (logError) throw new Error(`Falha ao registrar a consulta: ${logError.message}`);

  // RN-03: as reflexões só aparecem com o recurso ligado, e a leitura delas também fica registrada.
  const reflections = (await loadSettings(supabase)).flags.reflections ? await loadPersonReflections(supabase, id) : null;

  // A trilha "vista" por essa pessoa: mesmas regras de liberação, aplicadas ao progresso dela.
  const now = new Date();
  const trail = await loadTrail(supabase, id, now);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <PersonDetailView
        detail={detail}
        trail={trail}
        now={now}
        isSelf={user.id === id}
        roleAction={changeRole.bind(null, id)}
        ok={first(search.ok)}
        erro={first(search.erro)}
        reflections={reflections}
      />
    </main>
  );
}
