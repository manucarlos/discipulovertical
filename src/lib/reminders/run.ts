import { DEFAULT_CHURCH_NAME } from "@/lib/church";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmail, type EmailKind } from "@/lib/email/templates";
import type { EmailProvider } from "@/lib/email/provider";
import { isSendWindow, planReminders, type Snapshot } from "./plan";

export type RunResult =
  | { status: "outside_window" }
  | { status: "disabled" }
  | { status: "ok"; planned: number; queued: number; sent: number; failed: number };

interface Queued {
  id: string;
  user_id: string;
  kind: EmailKind;
  dedupe_key: string;
  email: string;
  unsubscribe_token: string;
}

/**
 * Uma rodada de lembretes: lê o retrato do banco, decide o que enviar, registra, envia e anota o resultado.
 * Fala com o banco só pelas funções cron_* (que exigem o segredo do agendador); não há chave secreta do Supabase aqui.
 * Nunca lança por causa de UM e-mail que falhou: o erro fica no registro da notificação e a rodada segue.
 */
export async function runReminders(options: {
  supabase: SupabaseClient;
  secret: string;
  provider: EmailProvider;
  siteUrl: string;
  now?: Date;
}): Promise<RunResult> {
  const { supabase, secret, provider } = options;
  const now = options.now ?? new Date();
  const site = options.siteUrl.replace(/\/+$/, "");
  if (!isSendWindow(now)) return { status: "outside_window" };

  const snapshotRes = await supabase.rpc("cron_snapshot", { p_secret: secret });
  if (snapshotRes.error) throw new Error(`Falha ao ler os dados dos lembretes: ${snapshotRes.error.message}`);
  const snapshot = snapshotRes.data as Snapshot;
  if (!snapshot.enabled) return { status: "disabled" };

  // Certificados emitidos há pouco (para o aviso "seu certificado está pronto").
  const certificatesRes = await supabase.rpc("cron_certificates", { p_secret: secret });
  if (certificatesRes.error) throw new Error(`Falha ao ler os certificados: ${certificatesRes.error.message}`);
  snapshot.certificates = (certificatesRes.data ?? []) as NonNullable<Snapshot["certificates"]>;

  const planned = planReminders(snapshot, now, site);
  if (planned.length === 0) return { status: "ok", planned: 0, queued: 0, sent: 0, failed: 0 };

  const templates = new Map((snapshot.templates ?? []).map((t) => [t.kind, t]));
  const churchName = snapshot.church?.name ?? DEFAULT_CHURCH_NAME;
  const subjectOf = (kind: EmailKind, vars: (typeof planned)[number]["vars"]) =>
    renderEmail(templates.get(kind)!, vars, { churchName, unsubscribeUrl: site }).subject;

  const enqueueRes = await supabase.rpc("cron_enqueue", {
    p_secret: secret,
    p_items: planned.map((m) => ({ user_id: m.userId, kind: m.kind, dedupe_key: m.dedupeKey, subject: subjectOf(m.kind, m.vars) })),
  });
  if (enqueueRes.error) throw new Error(`Falha ao registrar os lembretes: ${enqueueRes.error.message}`);
  const queued = (enqueueRes.data ?? []) as Queued[];

  const byKey = new Map(planned.map((m) => [`${m.userId}|${m.kind}|${m.dedupeKey}`, m]));
  let sent = 0;
  let failed = 0;
  for (const q of queued) {
    const message = byKey.get(`${q.user_id}|${q.kind}|${q.dedupe_key}`);
    const template = templates.get(q.kind);
    let outcome: { ok: true } | { ok: false; error: string };
    if (!message || !template) {
      outcome = { ok: false, error: "mensagem sem texto configurado" };
    } else {
      const unsubscribe = `${site}/desinscrever?t=${q.unsubscribe_token}`;
      const rendered = renderEmail(template, message.vars, { churchName, unsubscribeUrl: unsubscribe });
      outcome = await provider.send({
        to: q.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        headers: {
          "List-Unsubscribe": `<${site}/api/descadastro?t=${q.unsubscribe_token}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
    }
    if (outcome.ok) sent++;
    else failed++;
    const report = await supabase.rpc("cron_report", {
      p_secret: secret,
      p_id: q.id,
      p_status: outcome.ok ? "sent" : "failed",
      p_error: outcome.ok ? null : outcome.error,
    });
    if (report.error) throw new Error(`Falha ao anotar o resultado do envio: ${report.error.message}`);
  }

  return { status: "ok", planned: planned.length, queued: queued.length, sent, failed };
}
