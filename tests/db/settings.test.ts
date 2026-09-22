import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDb, createUser } from "./harness";

let db: PGlite;
let admin: string;
let editor: string;
let member: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);

beforeAll(async () => {
  db = await createDb();
  await q("insert into public.church_admins_pending (email, church_id) values ('pastor@example.com', (select id from public.churches where slug = 'vertical-church'))");
  admin = await createUser(db, "pastor@example.com");
  editor = await createUser(db, "editora@example.com");
  member = await createUser(db, "membro@example.com");
  await q("update public.profiles set onboarded_at = now()");
  await asUser(db, admin, () => q("select public.admin_set_role($1, 'editor')", [editor]));
});
afterAll(async () => {
  await db.close();
});

describe("app_settings", () => {
  it("nasce com todos os recursos desligados", async () => {
    const rows = await asUser(db, member, () => q<{ key: string; value: unknown }>("select key, value from public.app_settings"));
    const features = rows.filter((r) => r.key.startsWith("feature."));
    expect(features.length).toBeGreaterThanOrEqual(10);
    expect(features.every((r) => r.value === false)).toBe(true);
    // Nome e contato da igreja não são mais app_settings (migração 0026): viraram colunas de `churches`.
    expect((await q<{ name: string }>("select name from public.churches where slug = 'vertical-church'"))[0].name).toBe("Vertical Church");
  });

  it("qualquer pessoa logada lê; o visitante sem login não", async () => {
    expect((await asUser(db, member, () => q("select key from public.app_settings"))).length).toBeGreaterThan(0);
    await db.exec("set role anon");
    try {
      await expect(q("select key from public.app_settings")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });

  it("só o Admin grava: editor e membro são recusados", async () => {
    for (const who of [editor, member]) {
      const rows = await asUser(db, who, () =>
        q("update public.app_settings set value = 'true'::jsonb where key = 'feature.quiz' returning key"),
      );
      expect(rows).toHaveLength(0); // a política esconde a linha: nada é alterado
      await expect(
        asUser(db, who, () => q(`insert into public.app_settings (key, value) values ('feature.quiz', 'true')`)),
      ).rejects.toThrow();
    }
    expect((await q<{ value: boolean }>("select value from public.app_settings where key = 'feature.quiz'"))[0].value).toBe(false);
  });

  it("o Admin liga um recurso, e a mudança fica no registro com autor e data", async () => {
    await asUser(db, admin, () => q("update public.app_settings set value = 'true'::jsonb where key = 'feature.quiz'"));
    const [row] = await q<{ value: boolean; updated_by: string }>("select value, updated_by from public.app_settings where key = 'feature.quiz'");
    expect(row.value).toBe(true);
    expect(row.updated_by).toBe(admin);
    const log = await q<{ actor_id: string; details: { key: string; value: boolean } }>(
      "select actor_id, details from public.audit_log where action = 'setting_changed' order by id desc limit 1",
    );
    expect(log[0].actor_id).toBe(admin);
    expect(log[0].details).toEqual({ key: "feature.quiz", value: true });
  });

  it("gravar o mesmo valor de novo não enche o registro", async () => {
    const before = (await q<{ n: string }>("select count(*) as n from public.audit_log where action = 'setting_changed'"))[0].n;
    await asUser(db, admin, () => q("update public.app_settings set value = 'true'::jsonb where key = 'feature.quiz'"));
    const after = (await q<{ n: string }>("select count(*) as n from public.audit_log where action = 'setting_changed'"))[0].n;
    expect(after).toBe(before);
  });

  it("não aceita chave desconhecida nem valor do tipo errado", async () => {
    await expect(
      asUser(db, admin, () => q(`insert into public.app_settings (key, value) values ('feature.inventado', 'true')`)),
    ).rejects.toThrow(/known_keys/);
    await expect(
      asUser(db, admin, () => q(`update public.app_settings set value = '"sim"'::jsonb where key = 'feature.groups'`)),
    ).rejects.toThrow(/value_types/);
  });

  it("o autor gravado é sempre quem fez a mudança, mesmo que o cliente tente mentir", async () => {
    await asUser(db, admin, () =>
      q("update public.app_settings set value = 'true'::jsonb, updated_by = $1 where key = 'feature.reflections'", [member]),
    );
    const [row] = await q<{ updated_by: string }>("select updated_by from public.app_settings where key = 'feature.reflections'");
    expect(row.updated_by).toBe(admin);
  });
});

describe("public_features (antes do login)", () => {
  const asAnon = async () => {
    await db.exec("set role anon");
    try {
      return (await q<{ v: Record<string, boolean> }>("select public.public_features() as v"))[0].v;
    } finally {
      await db.exec("reset role");
    }
  };

  it("sem login, devolve só se o login por e-mail e o formulário de feedback estão ligados (desligados por padrão)", async () => {
    expect(await asAnon()).toEqual({ email_login: false, feedback: false });
    await asUser(db, admin, () => q("update public.app_settings set value = 'true'::jsonb where key = 'feature.email_login'"));
    expect(await asAnon()).toEqual({ email_login: true, feedback: false });
    await asUser(db, admin, () => q("update public.app_settings set value = 'false'::jsonb where key = 'feature.email_login'"));
  });
});
