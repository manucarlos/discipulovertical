import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { buildDbBundle } from "@/lib/db-bundle";
import { createDb } from "./harness";

const dir = path.resolve(__dirname, "../../supabase/migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), "utf8") }));

const BOOTSTRAP = /* sql */ `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz,
    raw_user_meta_data jsonb not null default '{}'::jsonb, raw_app_meta_data jsonb not null default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

const shape = (db: PGlite) =>
  db
    .query<{ k: string }>(
      `select 'tabela ' || c.relname || ' rls=' || c.relrowsecurity as k from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'
       union all select 'funcao ' || p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
       union all select 'politica ' || tablename || '.' || policyname from pg_policies where schemaname = 'public'
       order by 1`,
    )
    .then((r) => r.rows.map((x) => x.k));

describe("banco completo (um arquivo só para o SQL Editor)", () => {
  it("tem as 27 migrações em ordem, numa transação, e cada uma com o seu cabeçalho", () => {
    const sql = buildDbBundle(files);
    expect(files).toHaveLength(27);
    expect(sql).toMatch(/^-- Banco completo[\s\S]*\nbegin;\n/);
    expect(sql).toMatch(/\ncommit;\n/);
    const headers = [...sql.matchAll(/^-- ===== (.+?) =====$/gm)].map((m) => m[1]);
    expect(headers).toEqual(files.map((f) => f.name));
  });

  it("aplicado de uma vez num banco novo, dá exatamente o mesmo resultado que as migrações uma a uma", async () => {
    const single = new PGlite();
    await single.exec(BOOTSTRAP);
    await single.exec(buildDbBundle(files));
    const stepwise = await createDb();
    try {
      expect(await shape(single)).toEqual(await shape(stepwise));
      expect((await shape(single)).length).toBeGreaterThan(150);
    } finally {
      await single.close();
      await stepwise.close();
    }
  });

  it("se uma parte falhar, nada é gravado (transação)", async () => {
    const db = new PGlite();
    await db.exec(BOOTSTRAP);
    const broken = buildDbBundle([...files.slice(0, 3), { name: "99999999999999_quebrada.sql", sql: "create table public.fica_no_ar (id int);\nselect 1/0;" }]);
    await expect(db.exec(broken)).rejects.toThrow();
    await db.exec("rollback").catch(() => undefined);
    const rows = await db.query("select 1 from pg_class where relname in ('profiles', 'fica_no_ar')");
    expect(rows.rows).toEqual([]);
    await db.close();
  });
});
