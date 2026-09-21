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
  await q("insert into public.app_config (key, value) values ('initial_admin_email', 'pastor@example.com')");
  admin = await createUser(db, "pastor@example.com");
  editor = await createUser(db, "editora@example.com");
  member = await createUser(db, "membro@example.com");
  await q("update public.profiles set onboarded_at = now()");
  await asUser(db, admin, () => q("select public.admin_set_role($1, 'editor')", [editor]));
});
afterAll(async () => {
  await db.close();
});

describe("audit_export", () => {
  it("só o Admin registra; o registro traz quem, o quê e quantas linhas, sem dados pessoais", async () => {
    for (const who of [editor, member]) {
      await expect(asUser(db, who, () => q("select public.audit_export('members', 3)"))).rejects.toThrow(/não autorizado/);
    }
    await asUser(db, admin, () => q("select public.audit_export('members', 3)"));
    const [log] = await q<{ actor_id: string; entity_id: string; details: { rows: number } }>("select actor_id, entity_id, details from public.audit_log where action = 'data_exported'");
    expect(log).toEqual({ actor_id: admin, entity_id: "members", details: { rows: 3 } });
  });

  it("recusa tipo desconhecido e trata número de linhas negativo ou nulo", async () => {
    await expect(asUser(db, admin, () => q("select public.audit_export('tudo', 1)"))).rejects.toThrow(/inválido/);
    await asUser(db, admin, () => q("select public.audit_export('progress', -5)"));
    await asUser(db, admin, () => q("select public.audit_export('progress', null)"));
    const rows = await q<{ details: { rows: number } }>("select details from public.audit_log where action = 'data_exported' and entity_id = 'progress'");
    expect(rows.map((r) => r.details.rows)).toEqual([0, 0]);
  });
});
