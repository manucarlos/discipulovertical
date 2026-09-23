import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberStatus } from "@/lib/admin/people";
import { toEvolution, type EvolutionRow, type MemberEvolution } from "@/lib/evolution";

export type AlertStatus = "open" | "in_contact" | "resolved";

export const ALERT_LABEL: Record<AlertStatus, string> = {
  open: "Aberto",
  in_contact: "Em contato",
  resolved: "Resolvido",
};

export const NOTE_MAX = 3000;
export const RESOLUTION_MAX = 500;

export interface CareMember {
  id: string;
  name: string;
  status: MemberStatus;
  completedLessons: number;
  startedLessons: number;
  lastActivityAt: string | null;
  since: string;
  alertId: string | null;
  alertStatus: AlertStatus | null;
  evolution: MemberEvolution;
}

export interface CareCard {
  id: string;
  name: string;
  email: string;
  whatsapp: string | null;
  bibleVersion: string;
  status: MemberStatus;
  completedLessons: number;
  lastActivityAt: string | null;
  onboardedAt: string | null;
  evolution: MemberEvolution;
}

export interface CareNote {
  id: string;
  body: string;
  createdAt: string;
}

/** Abre os alertas de quem parou e fecha os de quem voltou. Barato o bastante para rodar ao abrir a tela. */
export async function syncAlerts(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("sync_stalled_alerts");
  if (error) throw new Error(`Falha ao verificar os alertas: ${error.message}`);
}

export async function loadCareMembers(supabase: SupabaseClient): Promise<CareMember[]> {
  const { data, error } = await supabase.rpc("caregiver_members");
  if (error) throw new Error(`Falha ao carregar os membros: ${error.message}`);
  return ((data ?? []) as (Record<string, unknown> & EvolutionRow)[]).map((r) => ({
    id: r.member_id as string,
    name: r.display_name as string,
    status: r.status as MemberStatus,
    completedLessons: r.completed_lessons as number,
    startedLessons: r.started_lessons as number,
    lastActivityAt: (r.last_activity_at as string | null) ?? null,
    since: r.since as string,
    alertId: (r.alert_id as string | null) ?? null,
    alertStatus: (r.alert_status as AlertStatus | null) ?? null,
    evolution: toEvolution(r),
  }));
}

/** Ficha de contato de um membro atribuído. Nula se não for dele (a função do banco recusa). */
export async function loadCareCard(supabase: SupabaseClient, memberId: string): Promise<CareCard | null> {
  const { data, error } = await supabase.rpc("caregiver_member_card", { p_member: memberId });
  if (error) {
    if (error.message.includes("não autorizado")) return null;
    throw new Error(`Falha ao carregar a ficha: ${error.message}`);
  }
  const r = ((data ?? []) as (Record<string, unknown> & EvolutionRow)[])[0];
  if (!r) return null;
  return {
    id: r.member_id as string,
    name: r.display_name as string,
    email: r.email as string,
    whatsapp: (r.whatsapp as string | null) ?? null,
    bibleVersion: r.bible_version as string,
    status: r.status as MemberStatus,
    completedLessons: r.completed_lessons as number,
    lastActivityAt: (r.last_activity_at as string | null) ?? null,
    onboardedAt: (r.onboarded_at as string | null) ?? null,
    evolution: toEvolution(r),
  };
}

/** As notas que a própria pessoa escreveu sobre o membro (a RLS mostra só as do autor; o Admin vê todas). */
export async function loadCareNotes(supabase: SupabaseClient, memberId: string): Promise<CareNote[]> {
  const { data, error } = await supabase
    .from("care_notes")
    .select("id, body, created_at")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao carregar as notas: ${error.message}`);
  return (data ?? []).map((n) => ({ id: n.id as string, body: n.body as string, createdAt: n.created_at as string }));
}

export interface AuthoredNote extends CareNote {
  authorName: string | null;
}

/** Todas as notas de cuidado sobre um membro, com o nome de quem escreveu. Só o Admin lê as de outros autores (a RLS confere). */
export async function loadAuthoredNotes(supabase: SupabaseClient, memberId: string): Promise<AuthoredNote[]> {
  const { data, error } = await supabase
    .from("care_notes")
    .select("id, body, created_at, author_id")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao carregar as notas: ${error.message}`);
  const rows = (data ?? []) as { id: string; body: string; created_at: string; author_id: string | null }[];
  const ids = [...new Set(rows.map((r) => r.author_id).filter((a): a is string => Boolean(a)))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: authors } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    for (const a of (authors ?? []) as { id: string; display_name: string }[]) names.set(a.id, a.display_name);
  }
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    authorName: r.author_id ? (names.get(r.author_id) ?? null) : null,
  }));
}

export interface OpenAlert {
  id: string;
  status: AlertStatus;
  openedAt: string;
}

export async function loadOpenAlert(supabase: SupabaseClient, memberId: string): Promise<OpenAlert | null> {
  const { data, error } = await supabase
    .from("care_alerts")
    .select("id, status, opened_at")
    .eq("member_id", memberId)
    .neq("status", "resolved")
    .limit(1);
  if (error) throw new Error(`Falha ao carregar o alerta: ${error.message}`);
  const r = (data ?? [])[0];
  return r ? { id: r.id as string, status: r.status as AlertStatus, openedAt: r.opened_at as string } : null;
}

export type NoteCheck = { ok: true; body: string } | { ok: false; error: string };

export function validateNote(raw: string): NoteCheck {
  const body = raw.replace(/\r\n/g, "\n").trim();
  if (body === "") return { ok: false, error: "Escreva a nota antes de salvar." };
  if (body.length > NOTE_MAX) return { ok: false, error: `A nota pode ter no máximo ${NOTE_MAX} caracteres.` };
  return { ok: true, body };
}

export type AlertStatusCheck =
  | { ok: true; status: AlertStatus; resolution: string | null }
  | { ok: false; error: string };

export function validateAlertUpdate(status: string, resolution: string): AlertStatusCheck {
  if (status !== "open" && status !== "in_contact" && status !== "resolved") return { ok: false, error: "Situação inválida." };
  const text = resolution.replace(/\r\n/g, "\n").trim();
  if (text.length > RESOLUTION_MAX) return { ok: false, error: `O texto pode ter no máximo ${RESOLUTION_MAX} caracteres.` };
  return { ok: true, status, resolution: status === "resolved" && text !== "" ? text : null };
}

// ---- Admin --------------------------------------------------------------------------------

export interface QueueMember {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  status: MemberStatus;
  lastActivityAt: string | null;
}

export interface CaregiverLoad {
  id: string;
  name: string;
  members: number;
}

export interface AdminAlert {
  id: string;
  memberId: string;
  memberName: string;
  caregiverName: string | null;
  status: AlertStatus;
  openedAt: string;
}

export interface CareOverview {
  queue: QueueMember[];
  caregivers: CaregiverLoad[];
  alerts: AdminAlert[];
}

/** Painel do Admin: fila sem cuidador, carga de cada cuidador e alertas em aberto. */
export async function loadCareOverview(supabase: SupabaseClient): Promise<CareOverview> {
  const [queueRes, caregiversRes, assignmentsRes, alertsRes] = await Promise.all([
    supabase.rpc("admin_care_queue"),
    supabase.from("profiles").select("id, display_name").eq("role", "caregiver").order("display_name"),
    supabase.from("care_assignments").select("member_id, caregiver_id").eq("active", true),
    supabase.from("care_alerts").select("id, member_id, status, opened_at").neq("status", "resolved").order("opened_at"),
  ]);
  for (const res of [queueRes, caregiversRes, assignmentsRes, alertsRes]) {
    if (res.error) throw new Error(`Falha ao carregar o cuidado: ${res.error.message}`);
  }

  const assignments = (assignmentsRes.data ?? []) as { member_id: string; caregiver_id: string }[];
  const caregiverOf = new Map(assignments.map((a) => [a.member_id, a.caregiver_id]));
  const caregivers = ((caregiversRes.data ?? []) as { id: string; display_name: string }[]).map((c) => ({
    id: c.id,
    name: c.display_name,
    members: assignments.filter((a) => a.caregiver_id === c.id).length,
  }));
  const caregiverName = new Map(caregivers.map((c) => [c.id, c.name]));

  const rawAlerts = (alertsRes.data ?? []) as { id: string; member_id: string; status: AlertStatus; opened_at: string }[];
  const names = new Map<string, string>();
  const ids = [...new Set(rawAlerts.map((a) => a.member_id))];
  if (ids.length > 0) {
    const { data } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    for (const p of (data ?? []) as { id: string; display_name: string }[]) names.set(p.id, p.display_name);
  }

  return {
    queue: ((queueRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.member_id as string,
      name: r.display_name as string,
      email: r.email as string,
      createdAt: r.created_at as string,
      status: r.status as MemberStatus,
      lastActivityAt: (r.last_activity_at as string | null) ?? null,
    })),
    caregivers,
    alerts: rawAlerts.map((a) => ({
      id: a.id,
      memberId: a.member_id,
      memberName: names.get(a.member_id) ?? "(sem nome)",
      caregiverName: caregiverName.get(caregiverOf.get(a.member_id) ?? "") ?? null,
      status: a.status,
      openedAt: a.opened_at,
    })),
  };
}
