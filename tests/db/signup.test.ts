import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDb } from "./harness";

/**
 * O cadastro de gente NOVA (sem convite de administrador pendente), pelo caminho exato do Supabase de
 * verdade — INSERT sem confirmar, confirmação depois por UPDATE — e SEM passar por `createUser()`
 * (tests/db/harness.ts): esse atalho de teste já "empurra" quem não tem igreja para a semente, o que
 * mascarou exatamente este bug (achado só ao testar contra produção, não pelos testes automatizados até
 * aqui — ver migração 0027). Este arquivo existe para nunca mais deixar passar.
 */
let db: PGlite;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);

beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

describe("cadastro de gente nova (sem administrador pendente)", () => {
  it("ganha a igreja semente automaticamente, mesmo sem confirmar ainda", async () => {
    const [{ id }] = await q<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ('novo-membro@example.com', '{\"full_name\": \"Novo Membro\"}') returning id",
    );
    const [row] = await q<{ church_id: string | null; role: string }>("select church_id, role from public.profiles where id = $1", [id]);
    const [{ id: seed }] = await q<{ id: string }>("select id from public.churches where slug = 'vertical-church'");
    expect(row).toEqual({ church_id: seed, role: "member" });
  });

  it("continua com a igreja semente depois de confirmar o e-mail (o caminho normal do Google)", async () => {
    const [{ id }] = await q<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ('outro-membro@example.com', '{}') returning id",
    );
    await q("update auth.users set email_confirmed_at = now() where id = $1", [id]);
    const [{ id: seed }] = await q<{ id: string }>("select id from public.churches where slug = 'vertical-church'");
    expect((await q<{ church_id: string }>("select church_id from public.profiles where id = $1", [id]))[0].church_id).toBe(seed);
  });

  it("completa o primeiro acesso de verdade: consentimento e dados do perfil, como a tela faz", async () => {
    const [{ id }] = await q<{ id: string }>(
      "insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ('terceiro-membro@example.com', now(), '{}') returning id",
    );
    // Exatamente o que src/app/onboarding/actions.ts faz: consents primeiro, perfil depois.
    const consents = await asUser(db, id, () =>
      q<{ id: string }>(
        "insert into public.consents (user_id, purpose, term_version) values ($1, 'data_processing', 'v1') returning id",
        [id],
      ),
    );
    expect(consents).toHaveLength(1);
    await asUser(db, id, () =>
      q("update public.profiles set display_name = 'Terceiro', onboarded_at = now() where id = $1", [id]),
    );
    const [row] = await q<{ onboarded_at: string | null }>("select onboarded_at from public.profiles where id = $1", [id]);
    expect(row.onboarded_at).not.toBeNull();
  });

  it("administrador pendente continua funcionando normalmente (não regride)", async () => {
    const [{ id: church }] = await q<{ id: string }>("insert into public.churches (slug, name) values ('igreja-pendente-teste', 'Igreja Pendente') returning id");
    await q("insert into public.church_admins_pending (email, church_id) values ('pendente@example.com', $1)", [church]);
    const [{ id }] = await q<{ id: string }>(
      "insert into auth.users (email, email_confirmed_at, raw_user_meta_data) values ('pendente@example.com', now(), '{}') returning id",
    );
    const [row] = await q<{ church_id: string; role: string }>("select church_id, role from public.profiles where id = $1", [id]);
    expect(row).toEqual({ church_id: church, role: "admin" });
    expect(await q("select 1 from public.church_admins_pending where email = 'pendente@example.com'")).toEqual([]);
  });
});
