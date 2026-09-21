import { computeLessonStates, type LessonState, type ReleaseLesson, type ReleaseProgress } from "@/lib/lessons/release";
import type { EmailKind, Vars } from "@/lib/email/templates";

/** O que o banco entrega ao planejador (cron_snapshot). Só quem aceitou lembretes por e-mail aparece em `members`. */
export interface Snapshot {
  enabled: boolean;
  caregivers_enabled?: boolean;
  church?: { name: string; contact_email: string };
  members?: {
    id: string;
    name: string;
    email: string;
    role: "member" | "caregiver" | "editor" | "admin";
    onboarded_at: string | null;
    last_activity_at: string | null;
    status: string;
  }[];
  cycles?: { id: string; slug: string; title: string; position: number; release_interval_days: number; max_lessons_per_week: number }[];
  lessons?: { id: string; cycle_id: string; slug: string; title: string; position: number; required: boolean }[];
  progress?: { user_id: string; lesson_id: string; released_at: string; started_at: string | null; completed_at: string | null }[];
  cycle_progress?: { user_id: string; cycle_id: string; completed_at: string | null }[];
  sent?: { user_id: string; kind: EmailKind; dedupe_key: string; status: "pending" | "sent" | "failed"; created_at: string }[];
  assignments?: { member_id: string; caregiver_id: string }[];
  alerts?: { id: string; member_id: string; member_name: string; opened_at: string }[];
  summaries?: { caregiver_id: string; members: number; active: number; stalled: number; completed_lessons: number }[];
  templates?: { kind: EmailKind; subject: string; body: string }[];
  admins?: { id: string; name: string; email: string }[];
}

export interface PlannedMessage {
  userId: string;
  email: string;
  kind: EmailKind;
  dedupeKey: string;
  vars: Vars;
}

const DAY_MS = 86_400_000;
const TIME_ZONE = "America/Sao_Paulo";

/** Máximo de lembretes (avisos de lição e convites para voltar) por pessoa em 7 dias. */
export const WEEKLY_REMINDER_LIMIT = 2;
/** Janela de envio no horário de Brasília: das 8h às 20h. */
export const SEND_FROM_HOUR = 8;
export const SEND_UNTIL_HOUR = 20;

const REMINDER_KINDS: ReadonlySet<EmailKind> = new Set(["new_lesson", "nudge_3d", "nudge_7d"]);

const brtParts = (d: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), weekday: get("weekday") };
};

/** Dentro do horário permitido para enviar (8h às 20h de Brasília)? */
export function isSendWindow(now: Date): boolean {
  const { hour } = brtParts(now);
  return hour >= SEND_FROM_HOUR && hour < SEND_UNTIL_HOUR;
}

const dateKey = (iso: string | Date) => brtParts(typeof iso === "string" ? new Date(iso) : iso).date;

/** A segunda-feira (yyyy-mm-dd, em Brasília) da semana de `now`, ou null se hoje for depois de quarta. */
function summaryWeekKey(now: Date): string | null {
  const { weekday } = brtParts(now);
  const back = { Mon: 0, Tue: 1, Wed: 2 }[weekday as "Mon" | "Tue" | "Wed"];
  if (back === undefined) return null; // o resumo sai de segunda a quarta (dá folga se o agendador falhar num dia)
  return dateKey(new Date(now.getTime() - back * DAY_MS));
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "amigo(a)";

/**
 * Decide quais e-mails enviar agora. Função pura: só olha o retrato que o banco entregou e o relógio.
 *
 * Regras (seção 10 do handoff): só com consentimento (quem está em `members`), das 8h às 20h de Brasília,
 * no máximo 2 lembretes por pessoa a cada 7 dias, uma mensagem por ocorrência (mesma lição, mesma ausência,
 * mesmo alerta, mesma semana) e nada de convite a quem voltou a acessar: a ausência é medida a cada execução,
 * então um aviso "pendente" some sozinho quando a pessoa volta.
 */
export function planReminders(snapshot: Snapshot, now: Date, siteUrl: string): PlannedMessage[] {
  if (!snapshot.enabled || !isSendWindow(now)) return [];

  const site = siteUrl.replace(/\/+$/, "");
  const churchName = snapshot.church?.name ?? "Vertical Church";
  const members = snapshot.members ?? [];
  const lessons = snapshot.lessons ?? [];
  const cycles = new Map((snapshot.cycles ?? []).map((c) => [c.id, c]));
  const templates = new Set((snapshot.templates ?? []).map((t) => t.kind));
  const out: PlannedMessage[] = [];

  // Já enviado (ou a caminho) = não repete. Um envio que falhou há menos de 2 dias pode tentar de novo.
  const alreadySent = new Set<string>();
  const weeklyCount = new Map<string, number>();
  for (const s of snapshot.sent ?? []) {
    const age = now.getTime() - new Date(s.created_at).getTime();
    const retry = s.status === "failed" && age < 2 * DAY_MS;
    if (!retry) alreadySent.add(`${s.user_id}|${s.kind}|${s.dedupe_key}`);
    if (REMINDER_KINDS.has(s.kind) && s.status !== "failed" && age < 7 * DAY_MS) {
      weeklyCount.set(s.user_id, (weeklyCount.get(s.user_id) ?? 0) + 1);
    }
  }
  const isNew = (userId: string, kind: EmailKind, key: string) =>
    templates.has(kind) && !alreadySent.has(`${userId}|${kind}|${key}`);
  const push = (m: Omit<PlannedMessage, "vars"> & { vars: Vars }) => {
    out.push({ ...m, vars: { igreja: churchName, ...m.vars } });
  };

  const releaseLessons: ReleaseLesson[] = lessons.flatMap((l) => {
    const cycle = cycles.get(l.cycle_id);
    return cycle
      ? [{ id: l.id, cyclePosition: cycle.position, position: l.position, required: l.required, releaseIntervalDays: cycle.release_interval_days, maxLessonsPerWeek: cycle.max_lessons_per_week }]
      : [];
  });
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const progressByUser = new Map<string, ReleaseProgress[]>();
  for (const p of snapshot.progress ?? []) {
    const list = progressByUser.get(p.user_id) ?? [];
    list.push({
      lessonId: p.lesson_id,
      releasedAt: new Date(p.released_at),
      startedAt: p.started_at ? new Date(p.started_at) : null,
      completedAt: p.completed_at ? new Date(p.completed_at) : null,
    });
    progressByUser.set(p.user_id, list);
  }

  for (const m of members) {
    if (m.role !== "member" && m.role !== "caregiver") continue;
    const progress = progressByUser.get(m.id) ?? [];
    const states = computeLessonStates(releaseLessons, progress, now);
    const ordered = [...releaseLessons].sort((a, b) => a.cyclePosition - b.cyclePosition || a.position - b.position);
    const stateOf = (id: string): LessonState | undefined => states.get(id);
    const resume = ordered.find((l) => {
      const s = stateOf(l.id)?.state;
      return s === "available" || s === "in_progress";
    });
    const resumeLesson = resume ? lessonById.get(resume.id) : undefined;
    const resumeCycle = resumeLesson ? cycles.get(resumeLesson.cycle_id) : undefined;
    const lessonVars: Vars = {
      nome: firstName(m.name),
      licao: resumeLesson?.title ?? "",
      ciclo: resumeCycle?.title ?? "",
      link: resumeLesson ? `${site}/licao/${resumeLesson.slug}` : site,
    };

    // 1. Boas-vindas: só a quem acabou de chegar (ligar o recurso depois não manda boas-vindas a quem já é da casa).
    if (m.onboarded_at && now.getTime() - new Date(m.onboarded_at).getTime() < 3 * DAY_MS && isNew(m.id, "welcome", "welcome")) {
      push({ userId: m.id, email: m.email, kind: "welcome", dedupeKey: "welcome", vars: { ...lessonVars, licao: ordered[0] ? (lessonById.get(ordered[0].id)?.title ?? "") : "" } });
    }

    // 2. Ciclo concluído na última semana.
    for (const cp of (snapshot.cycle_progress ?? []).filter((c) => c.user_id === m.id && c.completed_at)) {
      const cycle = cycles.get(cp.cycle_id);
      if (!cycle || now.getTime() - new Date(cp.completed_at!).getTime() > 7 * DAY_MS) continue;
      if (isNew(m.id, "cycle_completed", cp.cycle_id)) {
        push({ userId: m.id, email: m.email, kind: "cycle_completed", dedupeKey: cp.cycle_id, vars: { nome: firstName(m.name), ciclo: cycle.title, link: `${site}/ciclo/${cycle.slug}` } });
      }
    }

    // 3. Lembretes (no máximo 2 por semana; um por execução, o mais importante primeiro).
    if (!resume || m.status === "completed" || m.status === "onboarding_pending") continue;
    const lastAccess = m.last_activity_at ?? m.onboarded_at;
    if (!lastAccess) continue;
    if ((weeklyCount.get(m.id) ?? 0) >= WEEKLY_REMINDER_LIMIT) continue;

    // Quem estava esperando a próxima lição não "sumiu": a ausência só conta a partir do momento em que ela abriu.
    const previous = ordered.filter((l) => l.required).findLast((l) => (l.cyclePosition - resume.cyclePosition || l.position - resume.position) < 0);
    const previousDone = previous ? progress.find((p) => p.lessonId === previous.id)?.completedAt ?? null : null;
    let since = new Date(lastAccess);
    if (previousDone && stateOf(resume.id)?.state === "available") {
      const opensAt = new Date(previousDone.getTime() + resume.releaseIntervalDays * DAY_MS);
      if (opensAt > since && opensAt <= now) since = opensAt;
    }
    const idleDays = Math.floor((now.getTime() - since.getTime()) / DAY_MS);
    const occurrence = dateKey(since);

    if (idleDays >= 7 && idleDays < 14 && isNew(m.id, "nudge_7d", occurrence)) {
      push({ userId: m.id, email: m.email, kind: "nudge_7d", dedupeKey: occurrence, vars: lessonVars });
    } else if (idleDays >= 3 && idleDays < 7 && isNew(m.id, "nudge_3d", occurrence)) {
      push({ userId: m.id, email: m.email, kind: "nudge_3d", dedupeKey: occurrence, vars: lessonVars });
    } else if (
      idleDays < 3 &&
      resumeLesson &&
      stateOf(resume.id)?.state === "available" &&
      previousDone &&
      now.getTime() - previousDone.getTime() > DAY_MS && // a pessoa esperou pela lição: vale avisar que ela abriu
      isNew(m.id, "new_lesson", resumeLesson.id)
    ) {
      push({ userId: m.id, email: m.email, kind: "new_lesson", dedupeKey: resumeLesson.id, vars: lessonVars });
    }
  }

  // 4. Alerta de quem parou: ao cuidador do membro, ou, sem cuidador, aos administradores.
  if (snapshot.caregivers_enabled) {
    const caregiverOf = new Map((snapshot.assignments ?? []).map((a) => [a.member_id, a.caregiver_id]));
    const byId = new Map(members.map((m) => [m.id, m]));
    for (const alert of snapshot.alerts ?? []) {
      const caregiverId = caregiverOf.get(alert.member_id);
      const caregiver = caregiverId ? byId.get(caregiverId) : undefined;
      const recipients = caregiverId
        ? caregiver
          ? [{ id: caregiver.id, name: caregiver.name, email: caregiver.email, link: `${site}/cuidado/${alert.member_id}` }]
          : [] // cuidador que não aceitou e-mails: o alerta segue no painel
        : (snapshot.admins ?? []).map((a) => ({ ...a, link: `${site}/admin/cuidado` }));
      for (const r of recipients) {
        if (isNew(r.id, "stalled_alert", alert.id)) {
          push({ userId: r.id, email: r.email, kind: "stalled_alert", dedupeKey: alert.id, vars: { nome: firstName(r.name), membro: alert.member_name, link: r.link } });
        }
      }
    }

    // 5. Resumo semanal aos cuidadores (segunda a quarta, uma vez por semana).
    const week = summaryWeekKey(now);
    if (week) {
      for (const s of snapshot.summaries ?? []) {
        const caregiver = members.find((m) => m.id === s.caregiver_id);
        if (!caregiver || s.members === 0 || !isNew(caregiver.id, "weekly_summary", week)) continue;
        const resumo = [
          `• ${s.members} ${s.members === 1 ? "membro está" : "membros estão"} com você`,
          `• ${s.active} ${s.active === 1 ? "esteve ativo" : "estiveram ativos"} esta semana`,
          `• ${s.stalled} ${s.stalled === 1 ? "parado há mais de 14 dias" : "parados há mais de 14 dias"}`,
          `• ${s.completed_lessons} ${s.completed_lessons === 1 ? "lição concluída" : "lições concluídas"}`,
        ].join("\n");
        push({ userId: caregiver.id, email: caregiver.email, kind: "weekly_summary", dedupeKey: week, vars: { nome: firstName(caregiver.name), resumo, link: `${site}/cuidado` } });
      }
    }
  }

  return out;
}
