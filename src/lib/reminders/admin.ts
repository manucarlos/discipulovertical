import type { SupabaseClient } from "@supabase/supabase-js";
import { EMAIL_KINDS, isEmailKind, type EmailKind } from "@/lib/email/templates";

export interface TemplateRow {
  kind: EmailKind;
  subject: string;
  body: string;
}

export interface NotificationRow {
  id: string;
  personName: string;
  kind: EmailKind;
  status: "pending" | "sent" | "failed";
  subject: string;
  createdAt: string;
  error: string | null;
}

export const STATUS_LABEL: Record<NotificationRow["status"], string> = {
  pending: "Na fila",
  sent: "Enviado",
  failed: "Falhou",
};

export const KIND_LABEL: Record<EmailKind, string> = Object.fromEntries(EMAIL_KINDS.map((k) => [k.kind, k.label])) as Record<EmailKind, string>;

/** Estado da configuração do envio, para o Admin saber o que falta (sem mostrar nenhum valor). */
export interface SetupStatus {
  provider: boolean;
  cronSecret: boolean;
  siteUrl: boolean;
}

export function setupStatus(env: Record<string, string | undefined> = process.env): SetupStatus {
  const has = (v: string | undefined) => Boolean(v && v.trim());
  return {
    provider: has(env.RESEND_API_KEY) && has(env.EMAIL_FROM),
    cronSecret: has(env.CRON_SECRET),
    siteUrl: has(env.NEXT_PUBLIC_SITE_URL) || has(env.VERCEL_PROJECT_PRODUCTION_URL),
  };
}

export async function loadTemplates(supabase: SupabaseClient): Promise<TemplateRow[]> {
  const { data, error } = await supabase.from("email_templates").select("kind, subject, body");
  if (error) throw new Error(`Falha ao carregar os textos dos e-mails: ${error.message}`);
  const rows = ((data ?? []) as { kind: string; subject: string; body: string }[]).filter((r) => isEmailKind(r.kind)) as TemplateRow[];
  // Na ordem da lista de tipos, não na do banco.
  return EMAIL_KINDS.flatMap((k) => rows.filter((r) => r.kind === k.kind));
}

export async function loadNotifications(supabase: SupabaseClient, limit = 50): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, user_id, kind, status, subject, created_at, error")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Falha ao carregar o registro de envios: ${error.message}`);
  const rows = (data ?? []) as { id: string; user_id: string; kind: EmailKind; status: NotificationRow["status"]; subject: string; created_at: string; error: string | null }[];

  const names = new Map<string, string>();
  const ids = [...new Set(rows.map((r) => r.user_id))];
  if (ids.length > 0) {
    const { data: people } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    for (const p of (people ?? []) as { id: string; display_name: string }[]) names.set(p.id, p.display_name);
  }
  return rows.map((r) => ({
    id: r.id,
    personName: names.get(r.user_id) ?? "(sem nome)",
    kind: r.kind,
    status: r.status,
    subject: r.subject,
    createdAt: r.created_at,
    error: r.error,
  }));
}
