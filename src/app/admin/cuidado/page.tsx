import { connection } from "next/server";
import { CareAdminView } from "@/components/care-views";
import { requireAdmin } from "@/lib/auth";
import { loadCareOverview, syncAlerts } from "@/lib/care";
import { loadSettings } from "@/lib/features";
import { assignCaregiver, autoAssignCaregivers, updateAdminAlert } from "./actions";

export const metadata = { title: "Cuidado · Conteúdo" };

/** Cuidadores e alertas (RF-20, RF-25): fila sem cuidador, rodízio e alertas de quem parou. */
export default async function CareAdminPage(props: PageProps<"/admin/cuidado">) {
  await connection();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const { supabase } = await requireAdmin();
  await syncAlerts(supabase);
  const [overview, settings] = await Promise.all([loadCareOverview(supabase), loadSettings(supabase)]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <CareAdminView
        overview={overview}
        now={new Date()}
        assignAction={assignCaregiver}
        autoAssignAction={autoAssignCaregivers}
        alertAction={updateAdminAlert}
        enabled={settings.flags.caregivers}
        ok={first(search.ok)}
        erro={first(search.erro)}
      />
    </main>
  );
}
