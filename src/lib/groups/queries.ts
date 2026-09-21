import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupSchedule } from "./calendar";

export interface GroupInfo {
  id: string;
  name: string;
  disciplerId: string | null;
  trackId: string;
  trackTitle: string;
  startDate: string;
  activeWeekdays: number[];
  releaseHour: number;
  meetingWeekday: number | null;
  status: "active" | "completed" | "archived";
  alertDays: number;
  inviteCode: string;
}

export interface GroupDay {
  day: number;
  lessonId: string;
  slug: string;
  title: string;
  sensitive: boolean;
}

export interface GroupContext {
  group: GroupInfo;
  days: GroupDay[];
  pauses: { id: string; from: string; until: string }[];
  schedule: GroupSchedule;
}

interface GroupRow {
  id: string;
  name: string;
  discipler_id: string | null;
  track_id: string;
  start_date: string;
  active_weekdays: number[];
  release_hour: number;
  meeting_weekday: number | null;
  status: GroupInfo["status"];
  alert_days: number;
  invite_code: string;
}

const GROUP_COLUMNS = "id, name, discipler_id, track_id, start_date, active_weekdays, release_hour, meeting_weekday, status, alert_days, invite_code";

async function trackTitles(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  if (ids.length === 0) return titles;
  const { data, error } = await supabase.from("tracks").select("id, title").in("id", ids);
  if (error) throw new Error(`Falha ao carregar as trilhas: ${error.message}`);
  for (const t of (data ?? []) as { id: string; title: string }[]) titles.set(t.id, t.title);
  return titles;
}

const toGroup = (r: GroupRow, titles: Map<string, string>): GroupInfo => ({
  id: r.id,
  name: r.name,
  disciplerId: r.discipler_id,
  trackId: r.track_id,
  trackTitle: titles.get(r.track_id) ?? "",
  startDate: r.start_date,
  activeWeekdays: r.active_weekdays,
  releaseHour: r.release_hour,
  meetingWeekday: r.meeting_weekday,
  status: r.status,
  alertDays: r.alert_days,
  inviteCode: r.invite_code,
});

async function groupsByIds(supabase: SupabaseClient, ids: string[]): Promise<GroupInfo[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("discipleship_groups").select(GROUP_COLUMNS).in("id", ids).order("created_at");
  if (error) throw new Error(`Falha ao carregar os grupos: ${error.message}`);
  const rows = (data ?? []) as GroupRow[];
  const titles = await trackTitles(supabase, [...new Set(rows.map((r) => r.track_id))]);
  return rows.map((r) => toGroup(r, titles));
}

/** Os grupos de que a pessoa participa (como discípulo, ainda ativa). */
export async function loadMyGroups(supabase: SupabaseClient, userId: string): Promise<{ group: GroupInfo; joinedAt: string }[]> {
  const { data, error } = await supabase.from("group_members").select("group_id, joined_at").eq("user_id", userId).eq("status", "active");
  if (error) throw new Error(`Falha ao carregar os seus grupos: ${error.message}`);
  const memberships = (data ?? []) as { group_id: string; joined_at: string }[];
  const groups = await groupsByIds(supabase, memberships.map((m) => m.group_id));
  return groups.flatMap((g) => {
    const m = memberships.find((x) => x.group_id === g.id);
    return m ? [{ group: g, joinedAt: m.joined_at }] : [];
  });
}

/** Os grupos que a pessoa conduz. */
export async function loadDisciplerGroups(supabase: SupabaseClient, userId: string): Promise<GroupInfo[]> {
  const { data, error } = await supabase.from("discipleship_groups").select("id").eq("discipler_id", userId);
  if (error) throw new Error(`Falha ao carregar os grupos: ${error.message}`);
  return groupsByIds(supabase, ((data ?? []) as { id: string }[]).map((r) => r.id));
}

/** O grupo, os dias da trilha e as pausas, prontos para o calendário. Nulo se a pessoa não enxerga o grupo. */
export async function loadGroupContext(supabase: SupabaseClient, groupId: string): Promise<GroupContext | null> {
  const [groups] = await Promise.all([groupsByIds(supabase, [groupId])]);
  const group = groups[0];
  if (!group) return null;

  const [daysRes, pausesRes] = await Promise.all([
    supabase.from("track_days").select("day_number, lesson_id").eq("track_id", group.trackId).order("day_number"),
    supabase.from("group_pauses").select("id, from_date, until_date").eq("group_id", groupId).order("from_date"),
  ]);
  if (daysRes.error) throw new Error(`Falha ao carregar a trilha: ${daysRes.error.message}`);
  if (pausesRes.error) throw new Error(`Falha ao carregar as pausas: ${pausesRes.error.message}`);
  const dayRows = (daysRes.data ?? []) as { day_number: number; lesson_id: string }[];

  const lessons = new Map<string, { slug: string; title: string; sensitive: boolean }>();
  if (dayRows.length > 0) {
    const { data, error } = await supabase.from("lessons").select("id, slug, title, sensitive").in("id", dayRows.map((d) => d.lesson_id));
    if (error) throw new Error(`Falha ao carregar as lições: ${error.message}`);
    for (const l of (data ?? []) as { id: string; slug: string; title: string; sensitive: boolean }[]) lessons.set(l.id, l);
  }
  const days: GroupDay[] = dayRows.map((d) => ({
    day: d.day_number,
    lessonId: d.lesson_id,
    slug: lessons.get(d.lesson_id)?.slug ?? "",
    title: lessons.get(d.lesson_id)?.title ?? "(lição indisponível)",
    sensitive: lessons.get(d.lesson_id)?.sensitive ?? false,
  }));
  const pauses = ((pausesRes.data ?? []) as { id: string; from_date: string; until_date: string }[]).map((p) => ({ id: p.id, from: p.from_date, until: p.until_date }));

  return {
    group,
    days,
    pauses,
    schedule: {
      startDate: group.startDate,
      activeWeekdays: group.activeWeekdays,
      releaseHour: group.releaseHour,
      pauses: pauses.map((p) => ({ from: p.from, until: p.until })),
      totalDays: days.length,
      meetingWeekday: group.meetingWeekday,
    },
  };
}

export interface RosterMember {
  userId: string;
  name: string;
  joinedAt: string;
  status: string;
}

/** Quem está no grupo (só o nome), para o discipulador e o Admin. */
export async function loadRoster(supabase: SupabaseClient, groupId: string): Promise<RosterMember[]> {
  const { data, error } = await supabase.rpc("group_roster", { p_group: groupId });
  if (error) throw new Error(`Falha ao carregar o grupo: ${error.message}`);
  return ((data ?? []) as { user_id: string; display_name: string; joined_at: string; status: string }[]).map((r) => ({
    userId: r.user_id,
    name: r.display_name,
    joinedAt: r.joined_at,
    status: r.status,
  }));
}

/** Os dias lidos por cada pessoa do grupo (mapa de pessoa para o conjunto de números de dia). */
export async function loadGroupCompletion(supabase: SupabaseClient, groupId: string, days: GroupDay[]): Promise<Map<string, Set<number>>> {
  const { data, error } = await supabase.from("group_progress").select("user_id, lesson_id, completed_at").eq("group_id", groupId);
  if (error) throw new Error(`Falha ao carregar o progresso do grupo: ${error.message}`);
  const dayOf = new Map(days.map((d) => [d.lessonId, d.day]));
  const out = new Map<string, Set<number>>();
  for (const r of (data ?? []) as { user_id: string; lesson_id: string; completed_at: string | null }[]) {
    const day = dayOf.get(r.lesson_id);
    if (!day || !r.completed_at) continue;
    if (!out.has(r.user_id)) out.set(r.user_id, new Set());
    out.get(r.user_id)!.add(day);
  }
  return out;
}

export interface MyDayProgress {
  completed: boolean;
  challengeDone: boolean;
  reflection: string;
  shared: boolean;
}

export async function loadMyDayProgress(supabase: SupabaseClient, userId: string, groupId: string, lessonId: string): Promise<MyDayProgress> {
  const [progress, reflection] = await Promise.all([
    supabase.from("group_progress").select("completed_at, challenge_done").eq("user_id", userId).eq("group_id", groupId).eq("lesson_id", lessonId).maybeSingle(),
    supabase.from("group_reflections").select("body, shared").eq("user_id", userId).eq("group_id", groupId).eq("lesson_id", lessonId).maybeSingle(),
  ]);
  if (progress.error) throw new Error(`Falha ao carregar o seu progresso: ${progress.error.message}`);
  if (reflection.error) throw new Error(`Falha ao carregar a sua reflexão: ${reflection.error.message}`);
  return {
    completed: Boolean(progress.data?.completed_at),
    challengeDone: progress.data?.challenge_done === true,
    reflection: (reflection.data?.body as string | undefined) ?? "",
    shared: reflection.data?.shared === true,
  };
}
