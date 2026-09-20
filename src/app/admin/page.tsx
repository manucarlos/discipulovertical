import { redirect } from "next/navigation";
import { connection } from "next/server";
import { requireStaff } from "@/lib/auth";

export default async function AdminIndex() {
  // Dinâmica: a proteção (login e papel) vem do layout, que depende de quem está logado.
  await connection();
  const { role } = await requireStaff();
  redirect(role === "admin" ? "/admin/painel" : "/admin/trilha");
}
