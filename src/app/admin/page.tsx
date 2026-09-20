import { redirect } from "next/navigation";
import { connection } from "next/server";

export default async function AdminIndex() {
  // Dinâmica: a proteção (login e papel) vem do layout, que depende de quem está logado.
  await connection();
  redirect("/admin/trilha");
}
