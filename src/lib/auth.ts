import { cache } from "react";
import { redirect } from "next/navigation";
import { getSupabaseEnv } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export interface MemberProfile {
  id: string;
  display_name: string;
  role: "member" | "caregiver" | "editor" | "admin";
  bible_version: string;
  onboarded_at: string | null;
}

/**
 * Garante que há uma pessoa logada e com o primeiro acesso concluído; senão, redireciona.
 * Em Server Components o resultado é reaproveitado dentro da mesma requisição (cache do React),
 * então o layout e a página não consultam o Supabase duas vezes.
 */
export const requireMember = cache(async () => {
  // Sem Supabase configurado não há login: a tela de login explica o que falta.
  if (!getSupabaseEnv()) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, role, bible_version, onboarded_at")
    .eq("id", user.id)
    .single<MemberProfile>();
  if (!profile?.onboarded_at) redirect("/onboarding");

  return { supabase, user, profile };
});

/**
 * Área de conteúdo: só Editor e Admin. Quem é membro comum volta para o início.
 * (A RLS do banco impõe a mesma regra; isto evita mostrar telas que não funcionariam.)
 */
export const requireStaff = cache(async () => {
  const ctx = await requireMember();
  const role = ctx.profile.role;
  if (role !== "editor" && role !== "admin") redirect("/");
  return { ...ctx, role: role as "editor" | "admin" };
});

/** Telas com dados pessoais de outras pessoas: só o Admin. O Editor volta para o painel de conteúdo. */
export const requireAdmin = cache(async () => {
  const ctx = await requireStaff();
  if (ctx.role !== "admin") redirect("/admin/trilha");
  return ctx;
});
