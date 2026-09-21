import type { SupabaseClient } from "@supabase/supabase-js";

export const CLOSURE_LIMITS = { title: 120, kind: 60, location: 200 } as const;

const TIME_ZONE = "America/Sao_Paulo";
export const formatEventWhen = (iso: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export type ClosureInput = { cycleId: string; title: string; kind: string; startsAt: string; location: string };
export type ClosureCheck = ({ ok: true } & ClosureInput) | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Valida o formulário de um encerramento. A data vem do campo "datetime-local" (sem fuso) e vale como horário
 * de Brasília (UTC-3, sem horário de verão desde 2019).
 */
export function validateClosureEvent(form: { get(name: string): FormDataEntryValue | null }): ClosureCheck {
  const cycleId = String(form.get("cycle") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const kind = String(form.get("kind") ?? "").trim();
  const location = String(form.get("location") ?? "").trim();
  const when = String(form.get("starts_at") ?? "").trim();

  if (!UUID.test(cycleId)) return { ok: false, error: "Escolha o ciclo." };
  if (title === "") return { ok: false, error: "Escreva o título do encerramento." };
  if (title.length > CLOSURE_LIMITS.title) return { ok: false, error: `O título pode ter no máximo ${CLOSURE_LIMITS.title} caracteres.` };
  if (kind.length > CLOSURE_LIMITS.kind) return { ok: false, error: `O tipo pode ter no máximo ${CLOSURE_LIMITS.kind} caracteres.` };
  if (location.length > CLOSURE_LIMITS.location) return { ok: false, error: `O local pode ter no máximo ${CLOSURE_LIMITS.location} caracteres.` };
  if (!LOCAL_DATETIME.test(when)) return { ok: false, error: "Informe a data e a hora." };
  const date = new Date(`${when}:00-03:00`);
  if (Number.isNaN(date.getTime())) return { ok: false, error: "Data ou hora inválida." };
  return { ok: true, cycleId, title, kind, startsAt: date.toISOString(), location };
}

export interface ClosureEvent {
  id: string;
  cycleId: string;
  cycleTitle: string;
  title: string;
  kind: string;
  startsAt: string;
  location: string;
}

interface EventRow {
  id: string;
  cycle_id: string;
  title: string;
  kind: string;
  starts_at: string;
  location: string;
}

async function cycleTitles(supabase: SupabaseClient): Promise<Map<string, { title: string; position: number }>> {
  const { data, error } = await supabase.from("cycles").select("id, title, position");
  if (error) throw new Error(`Falha ao carregar os ciclos: ${error.message}`);
  return new Map(((data ?? []) as { id: string; title: string; position: number }[]).map((c) => [c.id, { title: c.title, position: c.position }]));
}

const toEvent = (r: EventRow, cycles: Map<string, { title: string }>): ClosureEvent => ({
  id: r.id,
  cycleId: r.cycle_id,
  cycleTitle: cycles.get(r.cycle_id)?.title ?? "",
  title: r.title,
  kind: r.kind,
  startsAt: r.starts_at,
  location: r.location,
});

// ---- Membro -------------------------------------------------------------------------------

export interface MemberClosure extends ClosureEvent {
  /** true = presente, false = ausente, null = ainda sem confirmação ("marco pendente", RN-05). */
  attended: boolean | null;
  certificateCode: string | null;
}

/** Os encerramentos dos ciclos e a situação da pessoa em cada um. */
export async function loadMemberClosures(supabase: SupabaseClient, userId: string): Promise<MemberClosure[]> {
  const [eventsRes, attendanceRes, certificatesRes, cycles] = await Promise.all([
    supabase.from("closure_events").select("id, cycle_id, title, kind, starts_at, location").order("starts_at"),
    supabase.from("closure_attendance").select("event_id, present").eq("user_id", userId),
    supabase.from("certificates").select("cycle_id, code").eq("user_id", userId),
    cycleTitles(supabase),
  ]);
  for (const res of [eventsRes, attendanceRes, certificatesRes]) {
    if (res.error) throw new Error(`Falha ao carregar os encerramentos: ${res.error.message}`);
  }
  const attendance = new Map(((attendanceRes.data ?? []) as { event_id: string; present: boolean }[]).map((a) => [a.event_id, a.present]));
  const certificates = new Map(((certificatesRes.data ?? []) as { cycle_id: string; code: string }[]).map((c) => [c.cycle_id, c.code]));
  return ((eventsRes.data ?? []) as EventRow[]).map((r) => ({
    ...toEvent(r, cycles),
    attended: attendance.has(r.id) ? (attendance.get(r.id) as boolean) : null,
    certificateCode: certificates.get(r.cycle_id) ?? null,
  }));
}

export interface MyCertificate {
  code: string;
  cycleTitle: string;
  issuedAt: string;
}

export async function loadMyCertificates(supabase: SupabaseClient, userId: string): Promise<MyCertificate[]> {
  const [res, cycles] = await Promise.all([
    supabase.from("certificates").select("code, cycle_id, issued_at").eq("user_id", userId).order("issued_at", { ascending: false }),
    cycleTitles(supabase),
  ]);
  if (res.error) throw new Error(`Falha ao carregar os certificados: ${res.error.message}`);
  return ((res.data ?? []) as { code: string; cycle_id: string; issued_at: string }[]).map((c) => ({
    code: c.code,
    cycleTitle: cycles.get(c.cycle_id)?.title ?? "",
    issuedAt: c.issued_at,
  }));
}

// ---- Admin --------------------------------------------------------------------------------

export interface EligibleMember {
  id: string;
  name: string;
  /** null = ainda não confirmado. */
  present: boolean | null;
  hasCertificate: boolean;
}

export interface AdminClosure extends ClosureEvent {
  eligible: EligibleMember[];
  presentCount: number;
  certificateCount: number;
}

export interface CycleOption {
  id: string;
  title: string;
  position: number;
}

/** Tudo da tela do Admin: ciclos, eventos e, em cada evento, quem concluiu o ciclo, a presença e os certificados. */
export async function loadAdminClosures(supabase: SupabaseClient): Promise<{ cycles: CycleOption[]; events: AdminClosure[] }> {
  const [eventsRes, cycles] = await Promise.all([
    supabase.from("closure_events").select("id, cycle_id, title, kind, starts_at, location").order("starts_at", { ascending: false }),
    cycleTitles(supabase),
  ]);
  if (eventsRes.error) throw new Error(`Falha ao carregar os encerramentos: ${eventsRes.error.message}`);
  const events = (eventsRes.data ?? []) as EventRow[];

  const [progressRes, attendanceRes, certificatesRes] = await Promise.all([
    supabase.from("cycle_progress").select("user_id, cycle_id").eq("status", "completed"),
    supabase.from("closure_attendance").select("event_id, user_id, present"),
    supabase.from("certificates").select("user_id, cycle_id"),
  ]);
  for (const res of [progressRes, attendanceRes, certificatesRes]) {
    if (res.error) throw new Error(`Falha ao carregar os encerramentos: ${res.error.message}`);
  }
  const completed = (progressRes.data ?? []) as { user_id: string; cycle_id: string }[];
  const attendance = (attendanceRes.data ?? []) as { event_id: string; user_id: string; present: boolean }[];
  const certificates = new Set(((certificatesRes.data ?? []) as { user_id: string; cycle_id: string }[]).map((c) => `${c.user_id}|${c.cycle_id}`));

  const names = new Map<string, string>();
  const ids = [...new Set(completed.map((c) => c.user_id))];
  if (ids.length > 0) {
    const { data } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    for (const p of (data ?? []) as { id: string; display_name: string }[]) names.set(p.id, p.display_name);
  }

  return {
    cycles: [...cycles.entries()].map(([id, c]) => ({ id, title: c.title, position: c.position })).sort((a, b) => a.position - b.position),
    events: events.map((e) => {
      const eligible = completed
        .filter((c) => c.cycle_id === e.cycle_id)
        .map((c) => ({
          id: c.user_id,
          name: names.get(c.user_id) ?? "(sem nome)",
          present: attendance.find((a) => a.event_id === e.id && a.user_id === c.user_id)?.present ?? null,
          hasCertificate: certificates.has(`${c.user_id}|${e.cycle_id}`),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      return {
        ...toEvent(e, cycles),
        eligible,
        presentCount: eligible.filter((m) => m.present === true).length,
        certificateCount: eligible.filter((m) => m.hasCertificate).length,
      };
    }),
  };
}

/** Lê a lista de presença do formulário: quem está marcado é presente; os demais da lista, ausentes. */
export function readAttendance(form: { get(name: string): FormDataEntryValue | null; getAll(name: string): FormDataEntryValue[] }): {
  present: string[];
  absent: string[];
} {
  const eligible = form.getAll("eligible").map(String).filter((id) => UUID.test(id));
  const present = eligible.filter((id) => form.get(`present_${id}`) === "on");
  return { present, absent: eligible.filter((id) => !present.includes(id)) };
}

/** Verificação pública: o que se mostra a quem confere um código. */
export interface Verification {
  holderName: string;
  cycleTitle: string;
  issuedAt: string;
}

export const CODE_FORMAT = /^VC-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

/** Tira espaços e põe em maiúsculas o código digitado (quem copia do papel erra caixa e espaços). */
export const normalizeCode = (raw: string) => raw.trim().toUpperCase();
