"use server";

import { redirect } from "next/navigation";
import { describeEditorError } from "@/lib/admin/errors";
import { ROLES, type UserRole } from "@/lib/admin/people";
import { requireAdmin } from "@/lib/auth";

const backTo = (id: string, params: Record<string, string>): never =>
  redirect(`/admin/pessoas/${encodeURIComponent(id)}?${new URLSearchParams(params).toString()}`);

/** Muda o perfil de acesso de uma pessoa (função do banco: só o Admin, protege o último Admin e grava no log). */
export async function changeRole(userId: string, formData: FormData): Promise<void> {
  const { supabase, user } = await requireAdmin();
  const role = String(formData.get("role") ?? "") as UserRole;

  if (!ROLES.includes(role)) backTo(userId, { erro: "Escolha um perfil da lista." });
  // Evita que alguém se tire do painel sem querer. Para mudar o próprio perfil, outro Admin faz.
  if (userId === user.id) backTo(userId, { erro: "Você não pode alterar o seu próprio perfil. Peça a outro administrador." });

  const { error } = await supabase.rpc("admin_set_role", { target: userId, new_role: role });
  if (error) backTo(userId, { erro: describeEditorError(error).message });
  backTo(userId, { ok: "Perfil atualizado." });
}
