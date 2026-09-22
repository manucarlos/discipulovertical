import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { parseHandoff } from "@/lib/content/parse-handoff";
import { buildImportSql } from "@/lib/content/to-sql";
import { asUser, createDb, createUser } from "./harness";

const cycles = parseHandoff(fs.readFileSync(path.resolve(__dirname, "../../docs/HANDOFF.md"), "utf8"));

let db: PGlite;
let church: string;
let admin: string;
let admin2: string;
let maria: string;
let joao: string;
let lessonId: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);
const count = async (sql: string, params: unknown[] = []) => (await q(sql, params)).length;

beforeAll(async () => {
  db = await createDb();
  church = (await q<{ id: string }>("select id from public.churches where slug = 'vertical-church'"))[0].id;
  await db.exec(buildImportSql(cycles.filter((c) => c.number === 1), { publish: true, churchSlug: "vertical-church" }));
  lessonId = (await q<{ id: string }>("select id from public.lessons where slug = 'c1-l01'"))[0].id;

  await q("insert into public.church_admins_pending (email, church_id) values ('pastor@example.com', (select id from public.churches where slug = 'vertical-church'))");
  admin = await createUser(db, "pastor@example.com", { name: "Pastor" });
  maria = await createUser(db, "maria@example.com", { name: "Maria" });
  joao = await createUser(db, "joao@example.com", { name: "João" });

  for (const id of [maria, joao]) {
    await q("insert into public.consents (church_id, user_id, purpose, term_version) values ($1, $2, 'data_processing', 'v1')", [church, id]);
    await q("insert into public.lesson_progress (church_id, user_id, lesson_id, status, started_at) values ($1, $2, $3, 'in_progress', now())", [church, id, lessonId]);
  }
  admin2 = await createUser(db, "outro-admin@example.com", { name: "Outro Admin" });
  await asUser(db, admin, () => q("select public.admin_set_role($1, 'admin')", [admin2]));
});
afterAll(async () => {
  await db.close();
});

describe("delete_my_account", () => {
  it("visitante sem login é recusado", async () => {
    await expect(q("select public.delete_my_account()")).rejects.toThrow(/não autorizado/);
  });

  it("apaga a conta, o perfil e tudo o que depende dela; não toca nas outras", async () => {
    await asUser(db, maria, () => q("select public.delete_my_account()"));

    expect(await count("select 1 from auth.users where id = $1", [maria])).toBe(0);
    expect(await count("select 1 from public.profiles where id = $1", [maria])).toBe(0);
    expect(await count("select 1 from public.consents where user_id = $1", [maria])).toBe(0);
    expect(await count("select 1 from public.lesson_progress where user_id = $1", [maria])).toBe(0);

    // João continua intacto.
    expect(await count("select 1 from public.profiles where id = $1", [joao])).toBe(1);
    expect(await count("select 1 from public.consents where user_id = $1", [joao])).toBe(1);
    expect(await count("select 1 from public.lesson_progress where user_id = $1", [joao])).toBe(1);
  });

  it("deixa um registro no log de auditoria sem nada que identifique a pessoa", async () => {
    const log = await q<{ actor_id: string | null; entity_id: string | null; details: Record<string, unknown> }>(
      "select actor_id, entity_id, details from public.audit_log where action = 'account_deleted'",
    );
    expect(log).toHaveLength(1);
    expect(log[0].actor_id).toBeNull();
    expect(log[0].entity_id).toBeNull();
    expect(log[0].details).toEqual({ role: "member" });
    expect(JSON.stringify(log[0])).not.toMatch(/maria/i);
  });

  it("uma conta que já não existe não consegue excluir de novo", async () => {
    await expect(asUser(db, maria, () => q("select public.delete_my_account()"))).rejects.toThrow(/conta não encontrada/);
  });

  it("um editor apaga a conta, mas as versões que escreveu continuam, sem o vínculo com ele", async () => {
    const editor = await createUser(db, "editora@example.com", { name: "Edna" });
    await asUser(db, admin, () => q("select public.admin_set_role($1, 'editor')", [editor]));
    await asUser(db, editor, () =>
      q(
        `insert into public.lesson_versions (lesson_id, content, author_id, note) values ($1, '{"blocks": []}', $2, 'minha')`,
        [lessonId, editor],
      ),
    );

    await asUser(db, editor, () => q("select public.delete_my_account()"));

    const kept = await q<{ author_id: string | null }>("select author_id from public.lesson_versions where note = 'minha'");
    expect(kept).toEqual([{ author_id: null }]);
    expect(await count("select 1 from public.profiles where id = $1", [editor])).toBe(0);
  });

  it("com dois administradores um pode sair; o que sobra passa a ser o último e não pode", async () => {
    await asUser(db, admin2, () => q("select public.delete_my_account()"));
    expect(await count("select 1 from public.profiles where id = $1", [admin2])).toBe(0);

    await expect(asUser(db, admin, () => q("select public.delete_my_account()"))).rejects.toThrow(/último administrador/);
    expect(await count("select 1 from public.profiles where id = $1", [admin])).toBe(1);
  });

  it("depois de excluída, a pessoa pode entrar de novo e começa do zero", async () => {
    const again = await createUser(db, "maria@example.com", { name: "Maria" });
    expect(again).not.toBe(maria);
    expect(await count("select 1 from public.consents where user_id = $1", [again])).toBe(0);
    expect(await count("select 1 from public.lesson_progress where user_id = $1", [again])).toBe(0);
  });
});
