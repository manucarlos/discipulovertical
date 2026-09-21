import { MemberHeader } from "@/components/member-header";
import { requireMember } from "@/lib/auth";
import { loadSettings } from "@/lib/features";
import { getSupabaseEnv } from "@/lib/supabase/config";

/** Área do membro: exige login e primeiro acesso concluído (a RLS do banco confere de novo). */
export default async function MemberLayout({ children }: LayoutProps<"/">) {
  // Sem Supabase configurado (início do projeto), as páginas mostram o aviso "em preparação".
  if (!getSupabaseEnv()) return <>{children}</>;
  const { supabase, profile } = await requireMember();
  const isCaregiver = profile.role === "caregiver" && (await loadSettings(supabase)).flags.caregivers;

  return (
    <>
      <MemberHeader isStaff={profile.role === "editor" || profile.role === "admin"} isCaregiver={isCaregiver} />
      <div className="flex flex-1 flex-col">{children}</div>
    </>
  );
}
