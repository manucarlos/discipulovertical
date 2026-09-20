import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import { MemberHeader } from "@/components/member-header";

/** Pré-visualização dos cabeçalhos de navegação (não aparecem nas outras páginas /dev). Só em desenvolvimento. */
export default function DevHeadersPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <MemberHeader isStaff />
      <AdminHeader role="admin" />
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="font-serif text-2xl">Cabeçalhos</h1>
        <p className="mt-2 text-muted">Pré-visualização (só em desenvolvimento).</p>
      </main>
    </>
  );
}
