import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { parseHandoff } from "@/lib/content/parse-handoff";
import { buildImportSql, sqlText } from "@/lib/content/to-sql";
import { asUser, createDb, createUser } from "./harness";

const cycles = parseHandoff(fs.readFileSync(path.resolve(__dirname, "../../docs/HANDOFF.md"), "utf8"));

let db: PGlite;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);
const count = async (table: string, where = "true") =>
  Number((await q<{ n: string }>(`select count(*)::int as n from public.${table} where ${where}`))[0].n);

beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

describe("importação como rascunho", () => {
  beforeAll(async () => {
    await db.exec(buildImportSql(cycles));
  });

  it("cria 3 ciclos, 28 lições, 28 versões e 84 perguntas de quiz", async () => {
    expect(await count("cycles")).toBe(3);
    expect(await count("lessons")).toBe(28);
    expect(await count("lesson_versions")).toBe(28);
    expect(await count("quiz_questions")).toBe(84);
    expect(await count("lesson_internal_notes")).toBe(28);
  });

  it("tudo entra como rascunho; as lições com [PREENCHER] ficam marcadas", async () => {
    expect(await count("lessons", "status = 'draft'")).toBe(28);
    expect(await count("lessons", "has_placeholders")).toBe(10);
    expect(await count("lessons", "has_placeholders and slug like 'c3-%'")).toBe(10);
  });

  it("grava configuração e posição do ciclo e da lição", async () => {
    const [c1] = await q<{ title: string; planned_weeks: number; position: number }>(
      "select title, planned_weeks, position from public.cycles where slug = 'c1'",
    );
    expect(c1).toEqual({ title: "Fundamentos", planned_weeks: 4, position: 1 });

    const [l] = await q<Record<string, unknown>>(
      "select title, position, estimated_minutes, tags, key_verse_ref, required, sensitive from public.lessons where slug = 'c1-l02'",
    );
    expect(l).toMatchObject({
      title: "Salvos pela graça",
      position: 2,
      estimated_minutes: 6,
      tags: ["Fundamentos", "Ciclo 1"],
      key_verse_ref: "Efésios 2.8-9",
      required: true,
      sensitive: false,
    });
  });

  it("a versão vigente guarda os blocos e a prática; o gabarito e as notas ficam em outras tabelas", async () => {
    const [v] = await q<{ content: { blocks: { type: string }[]; practice: { items: string[] }; reflection: string } }>(
      `select v.content from public.lesson_versions v
       join public.lessons l on l.current_version_id = v.id where l.slug = 'c1-l01'`,
    );
    expect(v.content.blocks.length).toBeGreaterThan(5);
    expect(v.content.practice.items).toHaveLength(2);
    expect(v.content.reflection).toContain("primeiro sentimento");
    expect(JSON.stringify(v.content)).not.toMatch(/Resposta|Nota para revisão|Sugestão de vídeo/);

    const [notes] = await q<{ button_suggestion: string | null; draft_notice: string | null; pastoral_review_note: string }>(
      `select n.* from public.lesson_internal_notes n join public.lessons l on l.id = n.lesson_id where l.slug = 'c1-l07'`,
    );
    expect(notes.button_suggestion).toContain("Quero me batizar");
    expect(notes.pastoral_review_note).toContain("modo do batismo");

    const [quiz] = await q<{ correct_option: string; options: Record<string, string> }>(
      `select qq.correct_option, qq.options from public.quiz_questions qq
       join public.lessons l on l.id = qq.lesson_id where l.slug = 'c1-l01' and qq.position = 1`,
    );
    expect(quiz.correct_option).toBe("B");
    expect(Object.keys(quiz.options)).toEqual(["A", "B", "C"]);
  });

  it("repetir a importação não duplica nada e não sobrescreve edição do pastor", async () => {
    await q("update public.lessons set title = 'Título editado pelo pastor' where slug = 'c1-l01'");
    await db.exec(buildImportSql(cycles));
    expect(await count("lessons")).toBe(28);
    expect(await count("lesson_versions")).toBe(28);
    expect(await count("quiz_questions")).toBe(84);
    expect(await count("lessons", "title = 'Título editado pelo pastor'")).toBe(1);
  });

  it("nenhum membro vê rascunhos importados", async () => {
    const member = await createUser(db, "membro@example.com");
    expect(await asUser(db, member, () => q("select 1 from public.lessons"))).toHaveLength(0);
    expect(await asUser(db, member, () => q("select 1 from public.lesson_versions"))).toHaveLength(0);
  });
});

describe("importação com --publish (só homologação)", () => {
  let db2: PGlite;
  beforeAll(async () => {
    db2 = await createDb();
    await db2.exec(buildImportSql(cycles, { publish: true }));
  });
  afterAll(async () => {
    await db2.close();
  });

  it("publica só o que não tem [PREENCHER] (o banco não deixa publicar o resto)", async () => {
    const rows = await db2.query<{ status: string; has_placeholders: boolean; n: number }>(
      "select status, has_placeholders, count(*)::int as n from public.lessons group by 1, 2 order by 1, 2",
    );
    expect(rows.rows).toEqual([
      { status: "draft", has_placeholders: true, n: 10 },
      { status: "published", has_placeholders: false, n: 18 },
    ]);
  });

  it("o membro lê as lições publicadas e o conteúdo, mas não o gabarito nem as notas internas", async () => {
    const { rows: ids } = await db2.query<{ id: string }>(
      "insert into auth.users (email, email_confirmed_at) values ('m@example.com', now()) returning id",
    );
    const member = ids[0].id;
    await db2.query("select set_config('request.jwt.claim.sub', $1, false)", [member]);
    await db2.exec("set role authenticated");
    try {
      const lessons = await db2.query("select slug from public.lessons order by slug");
      expect(lessons.rows).toHaveLength(18);
      const versions = await db2.query("select 1 from public.lesson_versions");
      expect(versions.rows).toHaveLength(18);
      expect((await db2.query("select 1 from public.quiz_questions")).rows).toHaveLength(0);
      expect((await db2.query("select 1 from public.lesson_internal_notes")).rows).toHaveLength(0);
    } finally {
      await db2.exec("reset role");
    }
  });
});

describe("sqlText", () => {
  it("escapa aspas simples e preserva barras invertidas e acentos", () => {
    expect(sqlText("d'água")).toBe("'d''água'");
    expect(sqlText('{"a":"b\\n"}')).toBe("'{\"a\":\"b\\n\"}'");
  });
  it("recusa caractere nulo", () => {
    expect(() => sqlText("a\0b")).toThrow();
  });
});
