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
      "church_pages",
      "cycles",
      "lesson_internal_notes",
      "lessons",
      "quiz_questions",
      "reflections",
    ]);
  });

  it("toda tabela com RLS tem pelo menos uma política, exceto as que são só do servidor", async () => {
    const rows = await q<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
         and not exists (select 1 from pg_policy p where p.polrelid = c.oid) order by 1`,
    );
    // app_config não tem política de propósito: só o SQL Editor (dono do banco) a acessa.
    expect(rows.map((r) => r.relname)).toEqual(["app_config"]);
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

  it("nenhuma função do schema public pode ser executada pelo papel anônimo", async () => {
    const rows = await q<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`,
    );
    expect(rows.map((r) => r.proname)).toEqual([]);
  });
});
