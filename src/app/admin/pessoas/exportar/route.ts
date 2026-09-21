import { requireAdmin } from "@/lib/auth";
import { csvDate, toCsv } from "@/lib/admin/csv";
import { ROLE_LABEL, STATUS_LABEL, type MemberStatus, type UserRole } from "@/lib/admin/people";

const PAGE = 1000;

/**
 * Exporta pessoas ou progresso em CSV (RF-26). Só o Admin. Cada download fica no registro de auditoria.
 * Fica de fora o WhatsApp (mínimo necessário): a planilha traz nome, e-mail, perfil, situação e andamento.
 *
 *   /admin/pessoas/exportar?tipo=membros     uma linha por pessoa
 *   /admin/pessoas/exportar?tipo=progresso   uma linha por pessoa e lição iniciada
 */
export async function GET(request: Request) {
  const { supabase } = await requireAdmin();
  const kind = new URL(request.url).searchParams.get("tipo") === "progresso" ? "progress" : "members";

  let csv: string;
  let count: number;
  if (kind === "members") {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase.rpc("admin_member_overview", { p_limit: PAGE, p_offset: offset });
      if (error) return new Response("Não foi possível gerar a planilha agora.", { status: 500 });
      rows.push(...((data ?? []) as Record<string, unknown>[]));
      if ((data ?? []).length < PAGE) break;
    }
    count = rows.length;
    csv = toCsv(
      ["Nome", "E-mail", "Perfil", "Situação", "Lições concluídas", "Lições iniciadas", "Última atividade", "Entrou em", "Primeiro acesso concluído em"],
      rows.map((r) => [
        r.display_name as string,
        r.email as string,
        ROLE_LABEL[r.role as UserRole] ?? (r.role as string),
        STATUS_LABEL[r.status as MemberStatus] ?? (r.status as string),
        r.completed_lessons as number,
        r.started_lessons as number,
        csvDate(r.last_activity_at as string | null),
        csvDate(r.created_at as string),
        csvDate(r.onboarded_at as string | null),
      ]),
    );
  } else {
    const [progressRes, profilesRes, lessonsRes] = await Promise.all([
      supabase.from("lesson_progress").select("user_id, lesson_id, status, started_at, completed_at, practice_done").order("user_id").limit(50_000),
      supabase.from("profiles").select("id, display_name, email"),
      supabase.from("lessons").select("id, slug, title, cycle_id"),
    ]);
    if (progressRes.error || profilesRes.error || lessonsRes.error) {
      return new Response("Não foi possível gerar a planilha agora.", { status: 500 });
    }
    const people = new Map(((profilesRes.data ?? []) as { id: string; display_name: string; email: string }[]).map((p) => [p.id, p]));
    const lessons = new Map(((lessonsRes.data ?? []) as { id: string; slug: string; title: string }[]).map((l) => [l.id, l]));
    const rows = ((progressRes.data ?? []) as { user_id: string; lesson_id: string; status: string; started_at: string | null; completed_at: string | null; practice_done: boolean }[])
      .map((p) => ({ p, person: people.get(p.user_id), lesson: lessons.get(p.lesson_id) }))
      .sort((a, b) => (a.person?.display_name ?? "").localeCompare(b.person?.display_name ?? "", "pt-BR") || (a.lesson?.slug ?? "").localeCompare(b.lesson?.slug ?? ""));
    count = rows.length;
    csv = toCsv(
      ["Nome", "E-mail", "Lição", "Título", "Situação", "Iniciada em", "Concluída em", "Prática feita"],
      rows.map(({ p, person, lesson }) => [
        person?.display_name,
        person?.email,
        lesson?.slug,
        lesson?.title,
        p.status === "completed" ? "Concluída" : p.status === "in_progress" ? "Em andamento" : "Disponível",
        csvDate(p.started_at),
        csvDate(p.completed_at),
        p.practice_done,
      ]),
    );
  }

  // Sem registro, sem arquivo: a exportação de dados pessoais nunca fica de fora do log.
  const { error: logError } = await supabase.rpc("audit_export", { p_kind: kind, p_rows: count });
  if (logError) return new Response("Não foi possível registrar a exportação. Nada foi baixado.", { status: 500 });

  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind === "members" ? "pessoas" : "progresso"}-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
