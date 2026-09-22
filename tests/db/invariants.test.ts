import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDb } from "./harness";

/**
 * Regras de segurança que valem para TODA tabela e função do schema public, inclusive as que forem
 * criadas no futuro: se uma migração nova esquecer uma delas, este teste falha.
 */
let db: PGlite;
const q = <T = Record<string, unknown>>(sql: string) => db.query<T>(sql).then((r) => r.rows);

beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

describe("tabelas", () => {
  it("toda tabela do schema public tem RLS ligada", async () => {
    const rows = await q<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity order by 1`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("o papel anônimo não tem nenhum privilégio em tabela alguma", async () => {
    const rows = await q<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public' order by 1, 2`,
    );
    expect(rows).toEqual([]);
  });

  it("ninguém (além do dono) recebe TRUNCATE, REFERENCES ou TRIGGER", async () => {
    const rows = await q<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee in ('anon', 'authenticated') and table_schema = 'public'
         and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER') order by 1, 2`,
    );
    expect(rows).toEqual([]);
  });

  it("só estas tabelas aceitam DELETE por usuários logados (e sempre atrás de política)", async () => {
    const rows = await q<{ table_name: string }>(
      `select distinct table_name from information_schema.role_table_grants
       where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'DELETE' order by 1`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      "care_notes",
      "church_pages",
      "closure_events",
      "cycles",
      "feedback_responses",
      "group_reflections",
      "lesson_internal_notes",
      "lessons",
      "quiz_questions",
      "reflections",
      "track_days",
      "tracks",
    ]);
  });

  it("toda tabela com RLS tem pelo menos uma política, exceto as que são só do servidor", async () => {
    const rows = await q<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
         and not exists (select 1 from pg_policy p where p.polrelid = c.oid) order by 1`,
    );
    // Sem política de propósito: só o SQL Editor (dono do banco) e as funções do banco as acessam.
    // app_config guarda o hash do segredo do agendador. email_unsubscribe_tokens ganhou política própria na
    // migração 0026 (entrou no laço das tabelas comuns, isolada por igreja como as demais).
    // church_admins_pending/platform_admins são do banco único multi-igreja (migração 0026): o operador
    // (SQL Editor) cadastra administradores pendentes; platform_admins é o Super Admin. `churches` TEM
    // política própria (churches_own_read/churches_admin_update — cada um lê e edita só a própria igreja).
    expect(rows.map((r) => r.relname)).toEqual(["app_config", "church_admins_pending", "platform_admins"]);
  });

  it("nenhuma política de escrita libera tudo (using/with check = true) para usuários logados", async () => {
    const rows = await q<{ tablename: string; policyname: string; cmd: string }>(
      `select tablename, policyname, cmd from pg_policies
       where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
         and (qual = 'true' or with_check = 'true') order by 1, 2`,
    );
    expect(rows).toEqual([]);
  });
});

describe("funções", () => {
  it("toda função SECURITY DEFINER fixa o search_path (evita sequestro de nomes)", async () => {
    const rows = await q<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
       order by 1`,
    );
    expect(rows.map((r) => r.proname)).toEqual([]);
  });

  it("só estas funções (e mais nenhuma) podem ser executadas pelo papel anônimo", async () => {
    const rows = await q<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`,
    );
    // Cada uma exige algo que só o e-mail, o certificado ou o agendador têm (o código do descadastro, o código do
    // certificado ou o CRON_SECRET), ou não expõe nada: public_features devolve só duas chaves e submit_feedback só
    // GRAVA (com a chave "feedback" ligada e no máximo 30 respostas por hora); public_identity e public_brand_asset
    // devolvem só o que já é público (nome, cores e imagens da marca).
    expect(rows.map((r) => r.proname)).toEqual([
      "cron_certificates",
      "cron_enqueue",
      "cron_report",
      "cron_snapshot",
      "public_brand_asset",
      "public_features",
      "public_identity",
      "submit_feedback",
      "unsubscribe_email",
      "verify_certificate",
    ]);
  });

  it("as funções do agendador conferem o segredo antes de qualquer coisa", async () => {
    const rows = await q<{ proname: string; src: string }>(
      `select p.proname, p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'cron\_%' order by 1`,
    );
    expect(rows.map((r) => r.proname)).toEqual(["cron_certificates", "cron_enqueue", "cron_report", "cron_snapshot"]);
    for (const r of rows) expect(r.src, r.proname).toMatch(/perform public\.check_cron_secret\(p_secret\)/);
  });
});
