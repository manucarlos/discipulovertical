import { connection } from "next/server";
import { AdminTrailView } from "@/components/admin/trail-admin";
import { loadAdminTrail } from "@/lib/admin/queries";
import { requireStaff } from "@/lib/auth";

export const metadata = { title: "Trilha · Conteúdo" };

export default async function AdminTrailPage(props: PageProps<"/admin/trilha">) {
  await connection();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const { supabase, role } = await requireStaff();
  const cycles = await loadAdminTrail(supabase);

  return <AdminTrailView cycles={cycles} role={role} erro={first(search.erro)} ok={first(search.ok)} />;
}
