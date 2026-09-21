import { MemberHeader } from "@/components/member-header";
import { requireMember } from "@/lib/auth";
import { loadSettings } from "@/lib/features";
import { getSupabaseEnv } from "@/lib/supabase/config";

/** Área do membro: exige login e primeiro acesso concluído (a RLS do banco confere de novo). */
export default async function MemberLayout({ children }: LayoutProps<"/">) {
  // Sem Supabase configurado (início do projeto), as páginas mostram o aviso "em preparação".
  if (!getSupabaseEnv()) return <>{children}</>;
  const { supabase, profile } = await requireMember();
  const { flags } = await loadSettings(supabase);
  const isCaregiver = profile.role === "caregiver" && flags.caregivers;

  return (
    <>
      <MemberHeader isStaff={profile.role === "editor" || profile.role === "admin"} isCaregiver={isCaregiver} showCertificates={flags.certificates} showGroups={flags.groups} isDiscipler={profile.is_discipler || profile.role === "admin"} />
      <div className="flex flex-1 flex-col">{children}</div>
    </>
  );
}
