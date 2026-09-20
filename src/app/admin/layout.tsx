import { AdminHeader } from "@/components/admin/admin-header";
import { requireStaff } from "@/lib/auth";

/** Painel de conteúdo: só Editor e Admin (quem é membro comum volta para o início). */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { role } = await requireStaff();
  return (
    <>
      <AdminHeader role={role} />
      <div className="flex flex-1 flex-col">{children}</div>
    </>
  );
}
