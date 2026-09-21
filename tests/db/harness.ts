import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

/**
 * Imita o que o Supabase fornece antes das nossas migrações: schema auth,
 * auth.users, auth.uid(), papéis anon/authenticated/service_role e os
 * privilégios padrão do schema public (o Supabase concede tudo por padrão;
 * as migrações precisam revogar explicitamente).
 */
const SUPABASE_BOOTSTRAP = /* sql */ `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    email_confirmed_at timestamptz,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    raw_app_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;

  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_BOOTSTRAP);
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    try {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
    } catch (err) {
      throw new Error(`Falha ao aplicar a migração ${file}: ${(err as Error).message}`);
    }
  }
  return db;
}

/**
 * Cria um usuário como o login Google faz no Supabase de verdade: o INSERT vem SEM e-mail
 * confirmado (dispara o gatilho que cria o perfil) e a confirmação chega logo depois, num UPDATE.
 * Com `confirmedOnInsert`, o e-mail já nasce confirmado (outros provedores, ou o SQL Editor).
 */
export async function createUser(
  db: PGlite,
  email: string,
  opts: { confirmed?: boolean; confirmedOnInsert?: boolean; name?: string } = {},
): Promise<string> {
  const { confirmed = true, confirmedOnInsert = false, name = "" } = opts;
  const now = new Date().toISOString();
  const res = await db.query<{ id: string }>(
    `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, $3::jsonb) returning id`,
    [email, confirmed && confirmedOnInsert ? now : null, JSON.stringify({ full_name: name })],
  );
  const id = res.rows[0].id;
  if (confirmed && !confirmedOnInsert) {
    await db.query("update auth.users set email_confirmed_at = $2 where id = $1", [id, now]);
  }
  return id;
}

/** Executa `fn` como um usuário logado (papel `authenticated`), como o PostgREST faz. */
export async function asUser<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
