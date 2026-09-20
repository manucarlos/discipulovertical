import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { parseHandoff } from "@/lib/content/parse-handoff";
import { buildImportSql } from "@/lib/content/to-sql";
import { asUser, createDb, createUser } from "./harness";

/**
 * Reproduz, em SQL, exatamente o que as server actions (src/app/(member)/licao/[slug]/actions.ts)
 * pedem ao banco pelo PostgREST, executando como um membro comum (papel authenticated + RLS).
 * Assim confirmamos que as permissões deixam o fluxo funcionar, e só ele.
 *
 *   upsert(..., { ignoreDuplicates: true })  ->  INSERT ... ON CONFLICT DO NOTHING
 *   upsert(...)                              ->  INSERT ... ON CONFLICT DO UPDATE SET <colunas enviadas>
 */
const cycles = parseHandoff(fs.readFileSync(path.resolve(__dirname, "../../docs/HANDOFF.md"), "utf8"));

let db: PGlite;
let member: string;
let other: string;
let lesson1: string;
let lesson2: string;
let cycle1: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);

beforeAll(async () => {
  db = await createDb();
  await db.exec(buildImportSql(cycles.filter((c) => c.number === 1), { publish: true }));
  member = await createUser(db, "membro@example.com");
  other = await createUser(db, "outro@example.com");
  lesson1 = (await q<{ id: string }>("select id from public.lessons where slug = 'c1-l01'"))[0].id;
  lesson2 = (await q<{ id: string }>("select id from public.lessons where slug = 'c1-l02'"))[0].id;
  cycle1 = (await q<{ id: string }>("select id from public.cycles where slug = 'c1'"))[0].id;
});
afterAll(async () => {
  await db.close();
});

const asMember = <T>(fn: () => Promise<T>) => asUser(db, member, fn);

describe("carregar a trilha (loadTrail)", () => {
  it("o membro lê ciclos e as lições publicadas, sem rascunhos", async () => {
    expect(await asMember(() => q("select 1 from public.cycles where active"))).toHaveLength(1);
    expect(await asMember(() => q("select 1 from public.lessons where status = 'published'"))).toHaveLength(8);
  });

  it("lê o texto da lição pela versão vigente (loadLessonDetail)", async () => {
    const rows = await asMember(() =>
      q<{ content: { blocks: unknown[] } }>(
        `select v.content from public.lessons l join public.lesson_versions v on v.id = l.current_version_id
         where l.slug = 'c1-l01' and l.status = 'published'`,
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].content.blocks.length).toBeGreaterThan(5);
  });

  it("lê as versões da Bíblia e as páginas da igreja", async () => {
    expect((await asMember(() => q("select code from public.bible_versions"))).length).toBe(2);
    expect((await asMember(() => q("select slug from public.church_pages"))).length).toBeGreaterThan(0);
  });
});

describe("openLesson: abrir a lição", () => {
  const open = (lesson: string) =>
    asMember(() =>
      q(
        `insert into public.lesson_progress (user_id, lesson_id, status, released_at, started_at)
         values ($1, $2, 'in_progress', now(), now()) on conflict (user_id, lesson_id) do nothing`,
        [member, lesson],
      ),
    );

  it("cria o progresso e o do ciclo; repetir não altera nada", async () => {
    await open(lesson1);
    await asMember(() =>
      q(
        `insert into public.cycle_progress (user_id, cycle_id, status, started_at)
         values ($1, $2, 'in_progress', now()) on conflict (user_id, cycle_id) do nothing`,
        [member, cycle1],
      ),
    );
    const [before] = await q<{ started_at: string }>("select started_at from public.lesson_progress where user_id = $1", [member]);

    await new Promise((r) => setTimeout(r, 20));
    await open(lesson1);
    const rows = await q<{ started_at: string; status: string }>("select started_at, status from public.lesson_progress where user_id = $1", [member]);
    expect(rows).toHaveLength(1);
    expect(rows[0].started_at).toEqual(before.started_at);
    expect(rows[0].status).toBe("in_progress");
  });
});

describe("saveReadingPosition: guardar até onde leu", () => {
  const save = (lesson: string, position: number) =>
    asMember(() =>
      q(
        `update public.lesson_progress set last_position = $3, updated_at = now()
         where user_id = $1 and lesson_id = $2 and status <> 'completed' returning last_position`,
        [member, lesson, position],
      ),
    );

  it("atualiza a posição enquanto a lição não foi concluída", async () => {
    const rows = await save(lesson1, 0.4);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].last_position)).toBeCloseTo(0.4);
  });
});

describe("completeLesson: concluir a lição", () => {
  it("faz o upsert com as colunas que a action envia e a marca como concluída", async () => {
    await asMember(() =>
      q(
        `insert into public.lesson_progress (user_id, lesson_id, status, released_at, started_at, completed_at, last_position, updated_at)
         values ($1, $2, 'completed', now(), now(), now(), 1, now())
         on conflict (user_id, lesson_id) do update set
           status = excluded.status, released_at = excluded.released_at, started_at = excluded.started_at,
           completed_at = excluded.completed_at, last_position = excluded.last_position, updated_at = excluded.updated_at`,
        [member, lesson1],
      ),
    );
    const [row] = await q<{ status: string; completed_at: string | null; last_position: string }>(
      "select status, completed_at, last_position from public.lesson_progress where user_id = $1 and lesson_id = $2",
      [member, lesson1],
    );
    expect(row.status).toBe("completed");
    expect(row.completed_at).not.toBeNull();
    expect(Number(row.last_position)).toBe(1);
  });

  it("depois de concluída, guardar posição não a reabre", async () => {
    const rows = await asMember(() =>
      q(
        `update public.lesson_progress set last_position = 0.1 where user_id = $1 and lesson_id = $2 and status <> 'completed' returning 1`,
        [member, lesson1],
      ),
    );
    expect(rows).toHaveLength(0);
    const [row] = await q<{ last_position: string }>("select last_position from public.lesson_progress where user_id = $1 and lesson_id = $2", [member, lesson1]);
    expect(Number(row.last_position)).toBe(1);
  });

  it("marca o ciclo como concluído (update do cycle_progress existente)", async () => {
    await asMember(() =>
      q(
        `insert into public.cycle_progress (user_id, cycle_id, status, completed_at) values ($1, $2, 'completed', now())
         on conflict (user_id, cycle_id) do update set status = excluded.status, completed_at = excluded.completed_at`,
        [member, cycle1],
      ),
    );
    const [row] = await q<{ status: string }>("select status from public.cycle_progress where user_id = $1", [member]);
    expect(row.status).toBe("completed");
  });

  it("concluir uma lição nova (sem abrir antes) também funciona pelo upsert", async () => {
    await asMember(() =>
      q(
        `insert into public.lesson_progress (user_id, lesson_id, status, released_at, started_at, completed_at, last_position, updated_at)
         values ($1, $2, 'completed', now(), now(), now(), 1, now())
         on conflict (user_id, lesson_id) do update set status = excluded.status, completed_at = excluded.completed_at`,
        [member, lesson2],
      ),
    );
    expect(await q("select 1 from public.lesson_progress where user_id = $1", [member])).toHaveLength(2);
  });
});

describe("isolamento entre membros", () => {
  it("o upsert não permite escrever no progresso de outra pessoa, nem por ON CONFLICT", async () => {
    await expect(
      asUser(db, other, () =>
        q(
          `insert into public.lesson_progress (user_id, lesson_id, status) values ($1, $2, 'completed')
           on conflict (user_id, lesson_id) do update set status = excluded.status`,
          [member, lesson1],
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    const [row] = await q<{ status: string }>("select status from public.lesson_progress where user_id = $1 and lesson_id = $2", [member, lesson1]);
    expect(row.status).toBe("completed");
  });

  it("o outro membro não enxerga o progresso do primeiro e começa do zero", async () => {
    expect(await asUser(db, other, () => q("select 1 from public.lesson_progress"))).toHaveLength(0);
    expect(await asUser(db, other, () => q("select 1 from public.cycle_progress"))).toHaveLength(0);
  });

  it("nem quem atualiza a posição consegue mexer na de outro (update sem linhas)", async () => {
    const rows = await asUser(db, other, () =>
      q("update public.lesson_progress set last_position = 0.9 where user_id = $1 returning 1", [member]),
    );
    expect(rows).toHaveLength(0);
  });
});
