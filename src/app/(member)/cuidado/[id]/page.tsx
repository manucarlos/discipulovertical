import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CareMemberView } from "@/components/care-views";
import { loadPersonReflections } from "@/lib/admin/people-queries";
import { requireCaregiver } from "@/lib/auth";
import { loadCareCard, loadCareNotes, loadOpenAlert } from "@/lib/care";
import { loadPersonGroupProgress } from "@/lib/evolution";
import { loadSettings } from "@/lib/features";
import { loadTrail } from "@/lib/trail/queries";
import { addCareNote, deleteCareNote, updateCareAlert } from "../actions";

export const metadata = { title: "Ficha do membro" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ficha de um membro atribuído ao cuidador. Quem não é dele não abre (o banco recusa e a tela dá "não encontrada"). */
export default async function CareMemberPage(props: PageProps<"/cuidado/[id]">) {
  await connection();
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const { supabase } = await requireCaregiver();
  const card = await loadCareCard(supabase, id);
  if (!card) notFound();

  // LGPD: consultar os dados de um membro fica registrado (e, se o registro falhar, a ficha não abre).
  const { error: logError } = await supabase.rpc("audit_person_view", { p_target: id });
  if (logError) throw new Error(`Falha ao registrar a consulta: ${logError.message}`);

  const now = new Date();
  const { flags } = await loadSettings(supabase);
  const [trail, notes, alert, reflections, groupProgress] = await Promise.all([
    loadTrail(supabase, id, now),
    loadCareNotes(supabase, id),
    loadOpenAlert(supabase, id),
    flags.reflections ? loadPersonReflections(supabase, id) : Promise.resolve(null),
    loadPersonGroupProgress(supabase, id),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <CareMemberView
        card={card}
        trail={trail}
        now={now}
        alert={alert}
        alertAction={updateCareAlert.bind(null, id)}
        notes={notes}
        noteAction={addCareNote.bind(null, id)}
        deleteNoteAction={deleteCareNote.bind(null, id)}
        reflections={reflections}
        groupProgress={groupProgress}
        ok={first(search.ok)}
        erro={first(search.erro)}
      />
    </main>
  );
}
