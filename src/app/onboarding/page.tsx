import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/config";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Bem-vindo(a)" };

export default async function OnboardingPage() {
  await connection();
  if (!getSupabaseEnv()) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: versions }] = await Promise.all([
    supabase.from("profiles").select("display_name, bible_version, onboarded_at").eq("id", user.id).single(),
    supabase.from("bible_versions").select("code, name").order("code"),
  ]);
  if (profile?.onboarded_at) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-line bg-card p-8 shadow-sm">
        <h1 className="font-serif text-3xl leading-tight">Que bom ter você aqui</h1>
        <p className="mt-2 text-muted">Antes de começar, precisamos de algumas informações.</p>
        <OnboardingForm
          defaultName={profile?.display_name ?? ""}
          versions={versions ?? []}
          defaultVersion={profile?.bible_version ?? "NTLH"}
        />
      </div>
    </main>
  );
}
