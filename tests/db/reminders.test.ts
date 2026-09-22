import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { parseHandoff } from "@/lib/content/parse-handoff";
import { buildImportSql } from "@/lib/content/to-sql";
import { asUser, createDb, createUser } from "./harness";

const cycles = parseHandoff(fs.readFileSync(path.resolve(__dirname, "../../docs/HANDOFF.md"), "utf8"));
const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";

let db: PGlite;
let church: string;
let admin: string;
let editor: string;
let ana: string; // aceitou lembretes
let beto: string; // não aceitou
let cida: string; // aceitou
let lessonIds: string[] = [];

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);
const as = <T>(user: string, sql: string, params: unknown[] = []) => asUser(db, user, () => q<T>(sql, params));
const setFlag = (key: string, on: boolean) => as(admin, "update public.app_settings set value = $2::jsonb where key = $1", [key, JSON.stringify(on)]);

/** Chama como o papel anônimo, sem sessão: é assim que o agendador e o link de descadastro chegam. */
async function asAnon<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec("set role anon");
  try {
    return await q<T>(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
const snapshot = (secret = SECRET) => asAnon<{ v: Record<string, unknown> }>("select public.cron_snapshot($1) as v", [secret]).then((r) => r[0].v);
const enqueue = (items: unknown[], secret = SECRET) =>
  asAnon<{ v: { id: string; user_id: string; kind: string; dedupe_key: string; email: string; unsubscribe_token: string }[] }>(
    "select public.cron_enqueue($1, $2::jsonb) as v",
    [secret, JSON.stringify(items)],
  ).then((r) => r[0].v);
const item = (user: string, kind: string, key: string) => ({ user_id: user, kind, dedupe_key: key, subject: `Assunto ${kind}` });
const consent = (user: string, on = true) =>
  on
    ? q("insert into public.consents (church_id, user_id, purpose, term_version) values ($1, $2, 'email_reminders', 'v1')", [church, user])
    : q("update public.consents set revoked_at = now() where user_id = $1 and purpose = 'email_reminders'", [user]);

beforeAll(async () => {
  db = await createDb();
  church = (await q<{ id: string }>("select id from public.churches where slug = 'vertical-church'"))[0].id;
  await db.exec(buildImportSql(cycles.filter((c) => c.number === 1), { publish: true, churchSlug: "vertical-church" }));
  lessonIds = (await q<{ id: string }>("select id from public.lessons order by position")).map((r) => r.id);

  await q("insert into public.church_admins_pending (email, church_id) values ('pastor@example.com', (select id from public.churches where slug = 'vertical-church'))");
  await q("insert into public.app_config (key, value) values ('cron_secret_hash', encode(sha256(convert_to($1, 'UTF8')), 'hex'))", [SECRET]);
  admin = await createUser(db, "pastor@example.com", { name: "Pastor" });
  editor = await createUser(db, "editora@example.com");
  ana = await createUser(db, "ana@example.com", { name: "Ana Paula" });
  beto = await createUser(db, "beto@example.com", { name: "Beto" });
  cida = await createUser(db, "cida@example.com", { name: "Cida" });
  await q("update public.profiles set onboarded_at = now()");
  await as(admin, "select public.admin_set_role($1, 'editor')", [editor]);
  await consent(ana);
  await consent(cida);
  await q(
    `insert into public.lesson_progress (church_id, user_id, lesson_id, status, released_at, started_at, completed_at)
     values ($1, $2, $3, 'completed', now() - interval '5 days', now() - interval '5 days', now() - interval '4 days')`,
    [church, ana, lessonIds[0]],
  );
});
afterAll(async () => {
  await db.close();
});

describe("segredo do agendador", () => {
  it("sem o segredo certo nada funciona (vazio, errado, ou o próprio hash)", async () => {
    for (const secret of ["", "errado", SECRET.toUpperCase()]) {
      await expect(snapshot(secret)).rejects.toThrow(/não autorizado/);
      await expect(enqueue([], secret)).rejects.toThrow(/não autorizado/);
      await expect(asAnon("select public.cron_report($1, $2, 'sent')", [secret, ana])).rejects.toThrow(/não autorizado/);
    }
    const [{ value: hash }] = await q<{ value: string }>("select value from public.app_config where key = 'cron_secret_hash'");
    await expect(snapshot(hash)).rejects.toThrow(/não autorizado/); // o hash guardado não serve de senha
  });

  it("sem cron_secret_hash configurado, ninguém entra", async () => {
    await q("delete from public.app_config where key = 'cron_secret_hash'");
    await expect(snapshot()).rejects.toThrow(/não autorizado/);
    await q("insert into public.app_config (key, value) values ('cron_secret_hash', encode(sha256(convert_to($1, 'UTF8')), 'hex'))", [SECRET]);
  });

  it("a função de conferência do segredo não é chamável de fora", async () => {
    await expect(asAnon("select public.check_cron_secret($1)", [SECRET])).rejects.toThrow(/permission denied/);
  });
});

describe("recurso desligado (padrão)", () => {
  it("o retrato diz apenas 'desligado' e nada é enfileirado", async () => {
    expect(await snapshot()).toEqual({ enabled: false });
    expect(await enqueue([item(ana, "welcome", "welcome")])).toEqual([]);
    expect(await q("select 1 from public.notifications")).toEqual([]);
  });
});

describe("recurso ligado", () => {
  beforeAll(async () => {
    await setFlag("feature.reminders", true);
  });

  it("o retrato traz só quem aceitou lembretes por e-mail, e nada que possa ser segredo", async () => {
    const s = await snapshot();
    expect(s.enabled).toBe(true);
    const emails = (s.members as { email: string }[]).map((m) => m.email).sort();
    expect(emails).toEqual(["ana@example.com", "cida@example.com"]);
    const progress = s.progress as { user_id: string }[];
    expect(progress.every((p) => p.user_id === ana)).toBe(true);
    expect((s.templates as unknown[]).length).toBe(8);
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/whatsapp|correct_option|internal|cron_secret|unsubscribe/i);
  });

  it("enfileira, devolve e-mail e código de descadastro, e não repete a mesma ocorrência", async () => {
    const first = await enqueue([item(ana, "welcome", "welcome")]);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ user_id: ana, kind: "welcome", email: "ana@example.com" });
    expect(first[0].unsubscribe_token).toMatch(/^[0-9a-f-]{36}$/);

    expect(await enqueue([item(ana, "welcome", "welcome")])).toEqual([]); // mesma ocorrência
    const other = await enqueue([item(ana, "cycle_completed", "ciclo-1")]);
    expect(other[0].unsubscribe_token).toBe(first[0].unsubscribe_token); // o código é da pessoa, não do e-mail
  });

  it("quem não tem consentimento não recebe, mesmo que o site peça", async () => {
    expect(await enqueue([item(beto, "welcome", "welcome")])).toEqual([]);
    expect(await q("select 1 from public.notifications where user_id = $1", [beto])).toEqual([]);
  });

  it("no máximo 2 lembretes a cada 7 dias; boas-vindas e resumos não entram na conta", async () => {
    const out = await enqueue([item(cida, "nudge_3d", "a"), item(cida, "new_lesson", "b"), item(cida, "nudge_7d", "c"), item(cida, "cycle_completed", "x")]);
    expect(out.map((r) => r.kind)).toEqual(["nudge_3d", "new_lesson", "cycle_completed"]);
    expect(await enqueue([item(cida, "nudge_7d", "d")])).toEqual([]); // semana cheia
    await q("update public.notifications set created_at = now() - interval '8 days' where user_id = $1 and kind = 'nudge_3d'", [cida]);
    expect((await enqueue([item(cida, "nudge_7d", "e")])).length).toBe(1); // um saiu da janela de 7 dias
  });

  it("reporta o resultado: enviado ou falha (com o erro), só uma vez", async () => {
    const [n] = await q<{ id: string }>("select id from public.notifications where user_id = $1 and kind = 'nudge_3d'", [cida]);
    await asAnon("select public.cron_report($1, $2, 'failed', 'Resend respondeu 500')", [SECRET, n.id]);
    expect((await q<{ status: string; error: string }>("select status, error from public.notifications where id = $1", [n.id]))[0]).toEqual({ status: "failed", error: "Resend respondeu 500" });
    await expect(asAnon("select public.cron_report($1, $2, 'enviado')", [SECRET, n.id])).rejects.toThrow(/inválida/);
    // Um que já saiu do "pendente" não é alterado por um segundo relatório.
    await asAnon("select public.cron_report($1, $2, 'sent')", [SECRET, n.id]);
    expect((await q<{ status: string }>("select status from public.notifications where id = $1", [n.id]))[0].status).toBe("failed");
  });

  it("uma falha recente pode ser reenviada; uma antiga, não", async () => {
    const [n] = await q<{ id: string }>("select id from public.notifications where user_id = $1 and kind = 'nudge_3d'", [cida]);
    await q("update public.notifications set created_at = now() - interval '9 days' where user_id = $1 and kind in ('new_lesson', 'nudge_7d')", [cida]); // libera a cota da semana
    await q("update public.notifications set created_at = now() - interval '1 hour' where id = $1", [n.id]);
    const retry = await enqueue([item(cida, "nudge_3d", "a")]);
    expect(retry).toHaveLength(1);
    expect(retry[0].id).toBe(n.id);
    expect((await q<{ status: string; error: string | null }>("select status, error from public.notifications where id = $1", [n.id]))[0]).toEqual({ status: "pending", error: null });

    await asAnon("select public.cron_report($1, $2, 'failed', 'x')", [SECRET, n.id]);
    await q("update public.notifications set created_at = now() - interval '3 days' where id = $1", [n.id]);
    expect(await enqueue([item(cida, "nudge_3d", "a")])).toEqual([]);
  });

  it("descadastrar desliga o consentimento, é idempotente e some do retrato; código inválido não faz nada", async () => {
    const [{ token }] = await q<{ token: string }>("select token from public.email_unsubscribe_tokens where user_id = $1", [ana]);
    expect((await asAnon<{ v: boolean }>("select public.unsubscribe_email($1) as v", [token]))[0].v).toBe(true);
    expect(await q("select 1 from public.consents where user_id = $1 and purpose = 'email_reminders' and revoked_at is null", [ana])).toEqual([]);
    expect((await asAnon<{ v: boolean }>("select public.unsubscribe_email($1) as v", [token]))[0].v).toBe(true); // de novo: sem erro
    expect((await asAnon<{ v: boolean }>("select public.unsubscribe_email($1) as v", ["00000000-0000-4000-8000-000000000000"]))[0].v).toBe(false);

    expect(await q("select 1 from public.audit_log where action = 'email_unsubscribed' and entity_id = $1", [ana])).toHaveLength(1);
    expect(((await snapshot()).members as { email: string }[]).map((m) => m.email)).toEqual(["cida@example.com"]);
    expect(await enqueue([item(ana, "cycle_completed", "outro")])).toEqual([]); // sem consentimento, nada sai
    await consent(ana);
  });

  it("o código de descadastro não é legível por ninguém pelo banco aberto", async () => {
    await expect(as(ana, "select token from public.email_unsubscribe_tokens")).rejects.toThrow(/permission denied/);
    await expect(as(admin, "select token from public.email_unsubscribe_tokens")).rejects.toThrow(/permission denied/);
    await expect(asAnon("select token from public.email_unsubscribe_tokens")).rejects.toThrow(/permission denied/);
  });

  it("o registro de notificações é só do Admin", async () => {
    expect((await as(admin, "select 1 from public.notifications")).length).toBeGreaterThan(0);
    expect(await as(ana, "select 1 from public.notifications")).toEqual([]);
    expect(await as(editor, "select 1 from public.notifications")).toEqual([]);
    await expect(as(admin, "update public.notifications set status = 'sent'")).rejects.toThrow(/permission denied/);
    await expect(as(admin, "insert into public.notifications (user_id, kind, dedupe_key, subject) values ($1, 'welcome', 'x', 'x')", [ana])).rejects.toThrow(/permission denied/);
  });
});

describe("textos dos e-mails", () => {
  it("só o Admin lê e edita; a mudança fica no registro", async () => {
    expect((await as(admin, "select 1 from public.email_templates")).length).toBe(8);
    expect(await as(ana, "select 1 from public.email_templates")).toEqual([]);
    expect(await as(editor, "select 1 from public.email_templates")).toEqual([]);

    expect(await as(editor, "update public.email_templates set subject = 'x' returning 1")).toEqual([]);
    await as(admin, "update public.email_templates set subject = 'Olá, {{nome}}!' where kind = 'welcome'");
    expect((await q<{ subject: string; updated_by: string }>("select subject, updated_by from public.email_templates where kind = 'welcome'"))[0]).toEqual({ subject: "Olá, {{nome}}!", updated_by: admin });
    expect(await q("select 1 from public.audit_log where action = 'email_template_updated' and entity_id = 'welcome'")).toHaveLength(1);
  });

  it("não aceita assunto ou texto vazio, nem tipo novo, nem apagar", async () => {
    await expect(as(admin, "update public.email_templates set subject = '  ' where kind = 'welcome'")).rejects.toThrow(/check/);
    await expect(as(admin, "update public.email_templates set body = '' where kind = 'welcome'")).rejects.toThrow(/check/);
    await expect(as(admin, "insert into public.email_templates (kind, subject, body) values ('spam', 'a', 'b')")).rejects.toThrow(/permission denied/);
    await expect(as(admin, "delete from public.email_templates")).rejects.toThrow(/permission denied/);
    await expect(as(admin, "update public.email_templates set kind = 'spam' where kind = 'welcome'")).rejects.toThrow(/permission denied/);
  });
});

describe("resumo do cuidador no retrato", () => {
  it("traz números por cuidador, sem nomes de membros", async () => {
    await as(admin, "select public.admin_set_role($1, 'caregiver')", [cida]);
    await setFlag("feature.caregivers", true);
    await as(admin, "select public.assign_caregiver($1, $2)", [ana, cida]);
    const s = await snapshot();
    const summaries = s.summaries as { caregiver_id: string; members: number; completed_lessons: number }[];
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ caregiver_id: cida, members: 1 });
    expect(JSON.stringify(summaries)).not.toMatch(/Ana|ana@/);
    expect(s.caregivers_enabled).toBe(true);
  });
});
