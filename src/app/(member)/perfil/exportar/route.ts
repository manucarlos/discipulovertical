import { requireMember } from "@/lib/auth";
import { buildExport, type ExportSource } from "@/lib/profile";

/** Baixa um arquivo com todos os dados pessoais da própria pessoa (LGPD: acesso e portabilidade). */
export async function GET() {
  const { supabase, user } = await requireMember();

  const [profile, consents, lessonProgress, cycleProgress, reflections, quizAttempts] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, email, photo_url, whatsapp, bible_version, role, created_at, onboarded_at")
      .eq("id", user.id)
      .single<ExportSource["profile"]>(),
    supabase.from("consents").select("purpose, term_version, accepted_at, revoked_at").eq("user_id", user.id).order("accepted_at"),
    supabase
      .from("lesson_progress")
      .select("status, released_at, started_at, completed_at, last_position, practice_done, lessons(slug, title)")
      .eq("user_id", user.id)
      .order("released_at"),
    supabase
      .from("cycle_progress")
      .select("status, started_at, completed_at, cycles(slug, title)")
      .eq("user_id", user.id)
      .order("started_at"),
    supabase
      .from("reflections")
      .select("body, created_at, updated_at, lessons(slug, title)")
      .eq("user_id", user.id)
      .order("created_at"),
    supabase
      .from("quiz_attempts")
      .select("correct_count, total, passed, created_at, lessons(slug, title)")
      .eq("user_id", user.id)
      .order("created_at"),
  ]);

  if (profile.error || !profile.data) {
    return new Response("Não foi possível reunir os seus dados agora. Tente de novo.", { status: 500 });
  }

  const body = buildExport(
    {
      profile: profile.data,
      consents: (consents.data ?? []) as ExportSource["consents"],
      lessonProgress: (lessonProgress.data ?? []) as unknown as ExportSource["lessonProgress"],
      cycleProgress: (cycleProgress.data ?? []) as unknown as ExportSource["cycleProgress"],
      reflections: (reflections.data ?? []) as unknown as ExportSource["reflections"],
      quizAttempts: (quizAttempts.data ?? []) as unknown as ExportSource["quizAttempts"],
    },
    new Date(),
  );

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="meus-dados-vertical-discipulado.json"',
      // Dados pessoais: nunca guardar em cache do navegador ou de intermediários.
      "Cache-Control": "no-store",
    },
  });
}
