import type { SupabaseClient } from "@supabase/supabase-js";
import { toEvolution, type EvolutionRow } from "@/lib/evolution";
import { PAGE_SIZE, type MemberStatus, type PeopleFilters, type PersonRow, type UserRole } from "./people";

interface OverviewRow extends EvolutionRow {
  member_id: string;
  display_name: string;
  email: string;
  role: UserRole;
  created_at: string;
  onboarded_at: string | null;
  completed_lessons: number;
  started_lessons: number;
  last_activity_at: string | null;
  status: MemberStatus;
  total_count: number | string;
}

const toPerson = (r: OverviewRow): PersonRow => ({
  id: r.member_id,
  name: r.display_name,
  email: r.email,
  role: r.role,
  createdAt: r.created_at,
  onboardedAt: r.onboarded_at,
  completedLessons: r.completed_lessons,
  startedLessons: r.started_lessons,
  lastActivityAt: r.last_activity_at,
  status: r.status,
  evolution: toEvolution(r),
});

async function callOverview(
  supabase: SupabaseClient,
  args: { search: string; role: UserRole | null; status: MemberStatus | null; limit: number; offset: number },
) {
  const { data, error } = await supabase.rpc("admin_member_overview", {
    p_search: args.search || null,
    p_role: args.role,
    p_status: args.status,
    p_limit: args.limit,
    p_offset: args.offset,
  });
  if (error) throw new Error(`Falha ao carregar as pessoas: ${error.message}`);
  return (data ?? []) as OverviewRow[];
}

/** Uma página da lista de pessoas (só o Admin; a função do banco confere). */
export async function loadPeople(
  supabase: SupabaseClient,
  filters: PeopleFilters,
): Promise<{ rows: PersonRow[]; total: number }> {
  const rows = await callOverview(supabase, {
    search: filters.search,
    role: filters.role,
    status: filters.status,
    limit: PAGE_SIZE,
    offset: (filters.page - 1) * PAGE_SIZE,
  });
  return { rows: rows.map(toPerson), total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
}

export interface PersonDetail {
  summary: PersonRow;
  whatsapp: string | null;
  bibleVersion: string;
  consents: { purpose: string; termVersion: string; acceptedAt: string; revokedAt: string | null }[];
  history: { action: string; createdAt: string; actorName: string | null; details: Record<string, unknown> }[];
}

export interface PersonReflection {
  lessonSlug: string;
  lessonTitle: string;
  body: string;
  updatedAt: string;
}

/** Reflexões de uma pessoa (só o Admin; a função do banco confere e registra a consulta). */
export async function loadPersonReflections(supabase: SupabaseClient, id: string): Promise<PersonReflection[]> {
  const { data, error } = await supabase.rpc("person_reflections", { p_target: id });
  if (error) throw new Error(`Falha ao carregar as reflexões: ${error.message}`);
  return ((data ?? []) as { lesson_slug: string; lesson_title: string; body: string; updated_at: string }[]).map((r) => ({
    lessonSlug: r.lesson_slug,
    lessonTitle: r.lesson_title,
    body: r.body,
    updatedAt: r.updated_at,
  }));
}

/** Ficha de uma pessoa: resumo, contato, consentimentos e histórico de mudanças de perfil. */
export async function loadPerson(supabase: SupabaseClient, id: string): Promise<PersonDetail | null> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, email, whatsapp, bible_version")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar a pessoa: ${error.message}`);
  if (!profile) return null;

  // O resumo vem da mesma função da lista, para a situação nunca divergir entre as duas telas.
  const candidates = await callOverview(supabase, { search: profile.email, role: null, status: null, limit: 20, offset: 0 });
  const mine = candidates.find((r) => r.member_id === id);
  if (!mine) return null;

  const [consentsRes, historyRes] = await Promise.all([
    supabase
      .from("consents")
      .select("purpose, term_version, accepted_at, revoked_at")
      .eq("user_id", id)
      .order("accepted_at", { ascending: false }),
    supabase
      .from("audit_log")
      .select("action, created_at, actor_id, details")
      .eq("entity", "profile")
      .eq("entity_id", id)
      .neq("action", "person_viewed") // as consultas ficam no log, mas não poluem a ficha
      .neq("action", "reflections_viewed")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (consentsRes.error) throw new Error(`Falha ao carregar os consentimentos: ${consentsRes.error.message}`);
  if (historyRes.error) throw new Error(`Falha ao carregar o histórico: ${historyRes.error.message}`);

  const actorIds = [...new Set((historyRes.data ?? []).map((h) => h.actor_id).filter((a): a is string => Boolean(a)))];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: actors } = await supabase.from("profiles").select("id, display_name").in("id", actorIds);
    for (const a of actors ?? []) names.set(a.id as string, a.display_name as string);
  }

  return {
    summary: toPerson(mine),
    whatsapp: profile.whatsapp,
    bibleVersion: profile.bible_version,
    consents: (consentsRes.data ?? []).map((c) => ({
      purpose: c.purpose,
      termVersion: c.term_version,
      acceptedAt: c.accepted_at,
      revokedAt: c.revoked_at,
    })),
    history: (historyRes.data ?? []).map((h) => ({
      action: h.action,
      createdAt: h.created_at,
      actorName: h.actor_id ? (names.get(h.actor_id) ?? null) : null,
      details: (h.details ?? {}) as Record<string, unknown>,
    })),
  };
}
