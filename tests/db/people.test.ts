import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { parseHandoff } from "@/lib/content/parse-handoff";
import { buildImportSql } from "@/lib/content/to-sql";
import { asUser, createDb, createUser } from "./harness";

const cycles = parseHandoff(fs.readFileSync(path.resolve(__dirname, "../../docs/HANDOFF.md"), "utf8"));

let db: PGlite;
let admin: string;
let editor: string;
const people: Record<string, string> = {};
const lessonIds: string[] = [];

interface Row {
  member_id: string;
  display_name: string;
  email: string;
  role: string;
  completed_lessons: number;
  started_lessons: number;
  last_activity_at: string | null;
  status: string;
  total_count: string;
}

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);

const overview = (
  args: { search?: string | null; role?: string | null; status?: string | null; limit?: number; offset?: number } = {},
  user = admin,
) =>
  asUser(db, user, () =>
    q<Row>("select * from public.admin_member_overview($1, $2::public.user_role, $3, $4, $5)", [
      args.search ?? null,
      args.role ?? null,
      args.status ?? null,
      args.limit ?? 100,
      args.offset ?? 0,
    ]),
  );

const byEmail = (rows: Row[]) => Object.fromEntries(rows.map((r) => [r.email, r]));
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

async function person(email: string, name: string, opts: { onboardedDaysAgo?: number | null; joinedDaysAgo?: number } = {}) {
  const id = await createUser(db, email, { name });
  const joined = opts.joinedDaysAgo ?? 1;
  const onboarded = opts.onboardedDaysAgo === undefined ? joined : opts.onboardedDaysAgo;
  await q("update public.profiles set created_at = $2, onboarded_at = $3 where id = $1", [
    id,
    daysAgo(joined),
    onboarded === null ? null : daysAgo(onboarded),
  ]);
  people[email] = id;
  return id;
}

async function progress(userId: string, lessonIndex: number, opts: { completed?: boolean; daysAgo: number }) {
  const at = daysAgo(opts.daysAgo);
  await q(
    `insert into public.lesson_progress (user_id, lesson_id, status, released_at, started_at, completed_at, updated_at)
     values ($1, $2, $3, $4, $4, $5, $4)`,
    [userId, lessonIds[lessonIndex], opts.completed ? "completed" : "in_progress", at, opts.completed ? at : null],
  );
}

beforeAll(async () => {
  db = await createDb();
  await db.exec(buildImportSql(cycles.filter((c) => c.number === 1), { publish: true }));
  for (const r of await q<{ id: string }>("select id from public.lessons order by position")) lessonIds.push(r.id);

  await q("insert into public.app_config (key, value) values ('initial_admin_email', 'pastor@example.com')");
  admin = await createUser(db, "pastor@example.com", { name: "Pastor Paulo" });
  editor = await createUser(db, "editora@example.com", { name: "Edna Editora" });
  await q("update public.profiles set onboarded_at = now() where id in ($1, $2)", [admin, editor]);
  await asUser(db, admin, () => q("select public.admin_set_role($1, 'editor')", [editor]));

  const ana = await person("ana@example.com", "Ana Souza", { joinedDaysAgo: 2 }); // em andamento
  await progress(ana, 0, { completed: true, daysAgo: 2 });
  await progress(ana, 1, { daysAgo: 1 });

  const bia = await person("bia@example.com", "Bia Lima", { joinedDaysAgo: 40 }); // parada
  await progress(bia, 0, { completed: true, daysAgo: 30 });

  const caio = await person("caio@example.com", "Caio Nunes", { joinedDaysAgo: 60 }); // concluiu
  for (let i = 0; i < 8; i++) await progress(caio, i, { completed: true, daysAgo: 20 - i });

  await person("dani@example.com", "Dani Rocha", { joinedDaysAgo: 3, onboardedDaysAgo: null }); // sem primeiro acesso
  await person("edu@example.com", "Edu Alves", { joinedDaysAgo: 3 }); // ainda não começou
  await person("flavia@example.com", "Flávia 100%_", { joinedDaysAgo: 30 }); // nunca começou, há 30 dias
});
afterAll(async () => {
  await db.close();
});

describe("admin_member_overview", () => {
  it("só o Admin executa: editor, membro e visitante são recusados", async () => {
    await expect(overview({}, editor)).rejects.toThrow(/não autorizado/);
    await expect(overview({}, people["ana@example.com"])).rejects.toThrow(/não autorizado/);
  });

  it("classifica cada pessoa pela situação certa", async () => {
    const rows = byEmail(await overview());
    expect(rows["ana@example.com"].status).toBe("in_progress");
    expect(rows["bia@example.com"].status).toBe("stalled");
    expect(rows["caio@example.com"].status).toBe("completed");
    expect(rows["dani@example.com"].status).toBe("onboarding_pending");
    expect(rows["edu@example.com"].status).toBe("not_started");
    // Nunca começou, mas o primeiro acesso foi há 30 dias: também conta como parada (RN-07).
    expect(rows["flavia@example.com"].status).toBe("stalled");
  });

  it("conta lições concluídas e iniciadas, e informa a última atividade", async () => {
    const rows = byEmail(await overview());
    expect(rows["ana@example.com"]).toMatchObject({ completed_lessons: 1, started_lessons: 2 });
    expect(rows["caio@example.com"]).toMatchObject({ completed_lessons: 8, started_lessons: 8 });
    expect(rows["edu@example.com"]).toMatchObject({ completed_lessons: 0, started_lessons: 0, last_activity_at: null });
    const last = new Date(rows["ana@example.com"].last_activity_at as string).getTime();
    expect(Date.now() - last).toBeLessThan(1.5 * 86_400_000);
  });

  it("filtra por situação", async () => {
    expect((await overview({ status: "stalled" })).map((r) => r.email).sort()).toEqual(["bia@example.com", "flavia@example.com"]);
    expect((await overview({ status: "completed" })).map((r) => r.email)).toEqual(["caio@example.com"]);
    expect((await overview({ status: "onboarding_pending" })).map((r) => r.email)).toEqual(["dani@example.com"]);
  });

  it("filtra por papel", async () => {
    expect((await overview({ role: "editor" })).map((r) => r.email)).toEqual(["editora@example.com"]);
    expect((await overview({ role: "admin" })).map((r) => r.email)).toEqual(["pastor@example.com"]);
    expect((await overview({ role: "member" })).length).toBe(6);
  });

  it("busca por nome ou e-mail, sem diferenciar maiúsculas, e trata % e _ como texto comum", async () => {
    expect((await overview({ search: "  SOUZA " })).map((r) => r.email)).toEqual(["ana@example.com"]);
    expect((await overview({ search: "edu@" })).map((r) => r.email)).toEqual(["edu@example.com"]);
    expect((await overview({ search: "100%_" })).map((r) => r.email)).toEqual(["flavia@example.com"]);
    expect(await overview({ search: "%" })).toHaveLength(1); // só o "100%_" tem um % de verdade
    expect(await overview({ search: "_" })).toHaveLength(1);
    expect(await overview({ search: "não existe" })).toEqual([]);
  });

  it("combina filtros", async () => {
    expect((await overview({ search: "a", status: "stalled", role: "member" })).map((r) => r.email).sort()).toEqual([
      "bia@example.com",
      "flavia@example.com",
    ]);
  });

  it("pagina, ordenando dos mais novos aos mais antigos, com o total de todas as páginas", async () => {
    const first = await overview({ limit: 3, offset: 0 });
    const second = await overview({ limit: 3, offset: 3 });
    expect(first).toHaveLength(3);
    expect(first.every((r) => Number(r.total_count) === 8)).toBe(true);
    expect(second.every((r) => Number(r.total_count) === 8)).toBe(true);
    const ids = [...first, ...second].map((r) => r.member_id);
    expect(new Set(ids).size).toBe(ids.length); // sem repetir entre páginas
    expect(await overview({ limit: 3, offset: 100 })).toEqual([]);
  });

  it("recusa situação inexistente", async () => {
    await expect(overview({ status: "quase" })).rejects.toThrow(/situação inválida/);
  });

  it("quando entra uma lição obrigatória nova, quem tinha concluído tudo deixa de estar 'concluído'", async () => {
    const cycleId = (await q<{ id: string }>("select id from public.cycles where slug = 'c1'"))[0].id;
    const [lesson] = await q<{ id: string }>(
      "insert into public.lessons (cycle_id, slug, title, position) values ($1, 'c1-l99', 'Nova', 99) returning id",
      [cycleId],
    );
    const [version] = await q<{ id: string }>(
      `insert into public.lesson_versions (lesson_id, content) values ($1, '{"blocks": []}') returning id`,
      [lesson.id],
    );
    await q("update public.lessons set current_version_id = $1 where id = $2", [version.id, lesson.id]);
    await q("update public.lessons set status = 'published' where slug = 'c1-l99'");
    const rows = byEmail(await overview());
    expect(rows["caio@example.com"].status).toBe("in_progress");
    expect(rows["caio@example.com"].completed_lessons).toBe(8);
  });
});
