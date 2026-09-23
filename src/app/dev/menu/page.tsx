import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AdminHeader } from "@/components/admin/admin-header";

/** Pré-visualização do menu de administração (gaveta lateral), sem precisar de login. Só em desenvolvimento. Use ?role=editor|admin. */
export default async function DevMenuPage(props: PageProps<"/dev/menu">) {
  if (process.env.NODE_ENV === "production") notFound();
  await connection();
  const search = await props.searchParams;
  const role = search.role === "editor" ? "editor" : "admin";

  return (
    <>
      <AdminHeader role={role} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <p className="text-muted">Conteúdo da página aqui.</p>
      </main>
    </>
  );
}
