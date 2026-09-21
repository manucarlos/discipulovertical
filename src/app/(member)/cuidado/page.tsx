import { connection } from "next/server";
import { CareListView } from "@/components/care-views";
import { requireCaregiver } from "@/lib/auth";
import { loadCareMembers, syncAlerts } from "@/lib/care";

export const metadata = { title: "Meus membros" };

/** Tela do cuidador (RF-21): os membros atribuídos a ele, com quem parou primeiro. */
export default async function CarePage() {
  await connection();
  const { supabase } = await requireCaregiver();
  await syncAlerts(supabase); // abre o alerta de quem parou e fecha o de quem voltou
  const members = await loadCareMembers(supabase);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <CareListView members={members} now={new Date()} />
    </main>
  );
}
