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
let editor: string;
let member: string;
const ids: Record<string, string> = {};

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);
const count = async (sql: string, params: unknown[] = []) => (await q(sql, params)).length;

const currentVersion = async (slug: string) =>
  (await q<{ current_version_id: string }>("select current_version_id from public.lessons where slug = $1", [slug]))[0]
    .current_version_id;

const FIELDS = {
  title: "Título novo",
  objective: "Novo objetivo",
  key_verse_ref: "João 3.16",
  estimated_minutes: 7,
  tags: ["Fundamentos", "Teste"],
  required: true,
  sensitive: false,
};
const content = (text: string) => ({
  blocks: [{ type: "paragraph", text }],
  practice: { title: "Prática da semana", items: ["Fazer algo"] },
  reflection: "Pense",
});
const NOTES = { pastoral_review_note: "Conferir", video_suggestion: null, draft_notice: null, button_suggestion: null };
const QUIZ = [
  { prompt: "P1?", options: { A: "a", B: "b", C: "c" }, correct_option: "B", explanation: "Porque sim" },
  { prompt: "P2?", options: { A: "a", B: "b" }, correct_option: "A", explanation: "" },
];

/** Chama save_lesson como `user`. A versão esperada é lida antes, como dono do banco. */
async function save(
  user: string,
  slug: string,
  opts: { expected?: string; fields?: object; content?: object; notes?: object; quiz?: object[]; note?: string } = {},
) {
  const expected = opts.expected ?? (await currentVersion(slug));
  return asUser(db, user, () =>
    q<{ save_lesson: string }>("select public.save_lesson($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7)", [
      ids[slug],
      expected,
      JSON.stringify(opts.fields ?? FIELDS),
      JSON.stringify(opts.content ?? content("Texto")),
      JSON.stringify(opts.notes ?? NOTES),
      JSON.stringify(opts.quiz ?? QUIZ),
      opts.note ?? null,
    ]).then((r) => r[0].save_lesson),
  );
}

beforeAll(async () => {
  db = await createDb();
  church = (await q<{ id: string }>("select id from public.churches where slug = 'vertical-church'"))[0].id;
  await db.exec(buildImportSql(cycles.filter((c) => c.number === 1), { churchSlug: "vertical-church" }));
  await q("insert into public.church_admins_pending (email, church_id) values ('pastor@example.com', (select id from public.churches where slug = 'vertical-church'))");
  admin = await createUser(db, "pastor@example.com");
  editor = await createUser(db, "editor@example.com");
  member = await createUser(db, "membro@example.com");
  await asUser(db, admin, () => q("select public.admin_set_role($1, 'editor')", [editor]));
  for (const r of await q<{ id: string; slug: string }>("select id, slug from public.lessons")) ids[r.slug] = r.id;
});
afterAll(async () => {
  await db.close();
});

describe("save_lesson", () => {
  it("o editor salva: nova versão, metadados, notas e quiz, tudo de uma vez", async () => {
    const before = await count("select 1 from public.lesson_versions where lesson_id = $1", [ids["c1-l01"]]);
    const version = await save(editor, "c1-l01", { note: "Ajuste do editor" });

    expect(await count("select 1 from public.lesson_versions where lesson_id = $1", [ids["c1-l01"]])).toBe(before + 1);
    const [lesson] = await q<Record<string, unknown>>(
      "select title, objective, key_verse_ref, estimated_minutes, tags, current_version_id, has_placeholders from public.lessons where slug = 'c1-l01'",
    );
    expect(lesson).toMatchObject({
      title: "Título novo",
      objective: "Novo objetivo",
      key_verse_ref: "João 3.16",
      estimated_minutes: 7,
      tags: ["Fundamentos", "Teste"],
      current_version_id: version,
      has_placeholders: false,
    });

    const [v] = await q<{ author_id: string; note: string }>("select author_id, note from public.lesson_versions where id = $1", [version]);
    expect(v).toEqual({ author_id: editor, note: "Ajuste do editor" });

    const quiz = await q<{ position: number; correct_option: string }>(
      "select position, correct_option from public.quiz_questions where lesson_id = $1 order by position",
      [ids["c1-l01"]],
    );
    expect(quiz).toEqual([{ position: 1, correct_option: "B" }, { position: 2, correct_option: "A" }]);
    const [notes] = await q<{ pastoral_review_note: string; video_suggestion: string | null }>(
      "select pastoral_review_note, video_suggestion from public.lesson_internal_notes where lesson_id = $1",
      [ids["c1-l01"]],
    );
    expect(notes).toEqual({ pastoral_review_note: "Conferir", video_suggestion: null });
  });

  it("recalcula has_placeholders pelo texto: no conteúdo ou nas notas, e volta a false quando some", async () => {
    await save(editor, "c1-l02", { content: content("Falta **[PREENCHER: dado]**") });
    expect((await q<{ has_placeholders: boolean }>("select has_placeholders from public.lessons where slug = 'c1-l02'"))[0].has_placeholders).toBe(true);

    await save(editor, "c1-l02", { notes: { ...NOTES, draft_notice: "[PREENCHER: nota]" } });
    expect((await q<{ has_placeholders: boolean }>("select has_placeholders from public.lessons where slug = 'c1-l02'"))[0].has_placeholders).toBe(true);

    await save(editor, "c1-l02");
    expect((await q<{ has_placeholders: boolean }>("select has_placeholders from public.lessons where slug = 'c1-l02'"))[0].has_placeholders).toBe(false);
  });

  it("recusa salvar por cima de uma versão que outra pessoa já mudou (conflito)", async () => {
    const stale = await currentVersion("c1-l03");
    await save(editor, "c1-l03", { content: content("Primeira") });
    await expect(save(editor, "c1-l03", { expected: stale, content: content("Segunda") })).rejects.toThrow(/conflito de edição/);
    // Nada da segunda tentativa foi gravado.
    const [v] = await q<{ content: { blocks: { text: string }[] } }>(
      "select v.content from public.lesson_versions v join public.lessons l on l.current_version_id = v.id where l.slug = 'c1-l03'",
    );
    expect(v.content.blocks[0].text).toBe("Primeira");
  });

  it("exige título", async () => {
    await expect(save(editor, "c1-l03", { fields: { ...FIELDS, title: "   " } })).rejects.toThrow(/título é obrigatório/);
  });

  it("membro não salva", async () => {
    await expect(save(member, "c1-l03")).rejects.toThrow(/sem permissão/);
  });

  describe("lição publicada", () => {
    beforeAll(async () => {
      await asUser(db, admin, () => q("update public.lessons set status = 'published' where slug = 'c1-l04'"));
    });

    it("o editor não salva; o Admin salva e o membro passa a ver a versão nova", async () => {
      await expect(save(editor, "c1-l04")).rejects.toThrow(/sem permissão/);

      const version = await save(admin, "c1-l04", { content: content("Texto revisado pelo pastor") });
      const seen = await asUser(db, member, () =>
        q<{ content: { blocks: { text: string }[] } }>(
          "select v.content from public.lessons l join public.lesson_versions v on v.id = l.current_version_id where l.slug = 'c1-l04'",
        ),
      );
      expect(seen[0].content.blocks[0].text).toBe("Texto revisado pelo pastor");
      expect(await currentVersion("c1-l04")).toBe(version);
    });

    it("não deixa introduzir [PREENCHER] numa lição publicada, e não grava nada da tentativa", async () => {
      const versions = await count("select 1 from public.lesson_versions where lesson_id = $1", [ids["c1-l04"]]);
      const current = await currentVersion("c1-l04");
      await expect(
        save(admin, "c1-l04", { content: content("Ainda falta **[PREENCHER: x]**") }),
      ).rejects.toThrow(/lessons_no_publish_with_placeholders/);
      expect(await count("select 1 from public.lesson_versions where lesson_id = $1", [ids["c1-l04"]])).toBe(versions);
      expect(await currentVersion("c1-l04")).toBe(current);
    });
  });
});

describe("publicação: barreira final", () => {
  it("bloqueia [PREENCHER] escondido no conteúdo, mesmo com has_placeholders falso", async () => {
    const v = await q<{ id: string }>(
      "insert into public.lesson_versions (church_id, lesson_id, content) values ($1, $2, $3::jsonb) returning id",
      [church, ids["c1-l05"], JSON.stringify(content("**[PREENCHER: escondido]**"))],
    );
    await q("update public.lessons set current_version_id = $1, has_placeholders = false where slug = 'c1-l05'", [v[0].id]);
    await expect(
      asUser(db, admin, () => q("update public.lessons set status = 'published' where slug = 'c1-l05'")),
    ).rejects.toThrow(/\[PREENCHER\]/);
  });

  it("bloqueia [PREENCHER] nas notas internas", async () => {
    await q("update public.lesson_internal_notes set draft_notice = '[PREENCHER: nota]' where lesson_id = $1", [ids["c1-l06"]]);
    await expect(
      asUser(db, admin, () => q("update public.lessons set status = 'published' where slug = 'c1-l06'")),
    ).rejects.toThrow(/\[PREENCHER\]/);
  });

  it("publica quando está limpa, e o editor não publica", async () => {
    await expect(
      asUser(db, editor, () => q("update public.lessons set status = 'published' where slug = 'c1-l07'")),
    ).rejects.toThrow(/row-level security/);
    await asUser(db, admin, () => q("update public.lessons set status = 'published' where slug = 'c1-l07'"));
    expect((await q<{ status: string }>("select status from public.lessons where slug = 'c1-l07'"))[0].status).toBe("published");
  });
});

describe("mudanças de status ficam no log", () => {
  it("registra de onde para onde, e quem fez", async () => {
    await asUser(db, editor, () => q("update public.lessons set status = 'in_review' where slug = 'c1-l08'"));
    const log = await asUser(db, admin, () =>
      q<{ actor_id: string; details: { from: string; to: string; slug: string } }>(
        "select actor_id, details from public.audit_log where action = 'lesson_status_changed' and entity_id = $1",
        [ids["c1-l08"]],
      ),
    );
    expect(log).toHaveLength(1);
    expect(log[0].actor_id).toBe(editor);
    expect(log[0].details).toEqual({ slug: "c1-l08", from: "draft", to: "in_review" });
  });

  it("o editor pode devolver para rascunho, mas não mexe numa lição publicada", async () => {
    await asUser(db, editor, () => q("update public.lessons set status = 'draft' where slug = 'c1-l08'"));
    const rows = await asUser(db, editor, () =>
      q("update public.lessons set status = 'draft' where slug = 'c1-l07' returning 1"),
    );
    expect(rows).toHaveLength(0); // publicada: a RLS esconde a linha do editor
  });
});

describe("create_lesson", () => {
  it("cria um rascunho vazio no fim do ciclo, com slug e posição automáticos", async () => {
    const cycleId = (await q<{ id: string }>("select id from public.cycles where slug = 'c1'"))[0].id;
    const slug = await asUser(db, editor, () =>
      q<{ create_lesson: string }>("select public.create_lesson($1, '  Lição nova  ')", [cycleId]).then((r) => r[0].create_lesson),
    );
    expect(slug).toBe("c1-l09");
    const [l] = await q<{ title: string; position: number; status: string; current_version_id: string }>(
      "select title, position, status, current_version_id from public.lessons where slug = $1",
      [slug],
    );
    expect(l).toMatchObject({ title: "Lição nova", position: 9, status: "draft" });
    const [v] = await q<{ content: { blocks: unknown[] }; note: string }>("select content, note from public.lesson_versions where id = $1", [l.current_version_id]);
    expect(v.content.blocks).toEqual([]);
    expect(v.note).toBe("Lição criada");
    expect(await asUser(db, member, () => q("select 1 from public.lessons where slug = $1", [slug]))).toHaveLength(0);
  });

  it("recusa título vazio e membro comum", async () => {
    const cycleId = (await q<{ id: string }>("select id from public.cycles where slug = 'c1'"))[0].id;
    await expect(asUser(db, editor, () => q("select public.create_lesson($1, '  ')", [cycleId]))).rejects.toThrow(/título é obrigatório/);
    await expect(asUser(db, member, () => q("select public.create_lesson($1, 'X')", [cycleId]))).rejects.toThrow(/row-level security/);
  });
});

describe("restore_lesson_version", () => {
  it("restaura o conteúdo como versão nova: o histórico só cresce", async () => {
    await save(editor, "c1-l02", { content: content("Versão A") });
    const versionA = await currentVersion("c1-l02");
    await save(editor, "c1-l02", { content: content("Versão B") });
    const before = await count("select 1 from public.lesson_versions where lesson_id = $1", [ids["c1-l02"]]);

    const expected = await currentVersion("c1-l02");
    const restored = await asUser(db, editor, () =>
      q<{ restore_lesson_version: string }>("select public.restore_lesson_version($1, $2, $3)", [
        ids["c1-l02"],
        versionA,
        expected,
      ]).then((r) => r[0].restore_lesson_version),
    );

    expect(await count("select 1 from public.lesson_versions where lesson_id = $1", [ids["c1-l02"]])).toBe(before + 1);
    expect(await currentVersion("c1-l02")).toBe(restored);
    const [v] = await q<{ content: { blocks: { text: string }[] }; note: string }>("select content, note from public.lesson_versions where id = $1", [restored]);
    expect(v.content.blocks[0].text).toBe("Versão A");
    expect(v.note).toMatch(/^Restaurada da versão de \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it("recusa versão de outra lição e conflito de edição", async () => {
    const otherLessonVersion = await currentVersion("c1-l03");
    const own = await currentVersion("c1-l02");
    await expect(
      asUser(db, editor, () => q("select public.restore_lesson_version($1, $2, $3)", [ids["c1-l02"], otherLessonVersion, own])),
    ).rejects.toThrow(/versão não encontrada/);
    await expect(
      asUser(db, editor, () => q("select public.restore_lesson_version($1, $2, $3)", [ids["c1-l02"], own, otherLessonVersion])),
    ).rejects.toThrow(/conflito de edição/);
  });
});

describe("move_lesson", () => {
  const positions = async () =>
    Object.fromEntries((await q<{ slug: string; position: number }>("select slug, position from public.lessons where slug in ('c1-l02','c1-l03','c1-l07')")).map((r) => [r.slug, r.position]));

  it("troca com a vizinha, sem quebrar a unicidade das posições", async () => {
    // l02 (draft) e l03 (draft): sobe a 3 e ela passa a ser a 2.
    await asUser(db, editor, () => q("select public.move_lesson($1, 'up')", [ids["c1-l03"]]));
    expect(await positions()).toMatchObject({ "c1-l03": 2, "c1-l02": 3 });
    await asUser(db, editor, () => q("select public.move_lesson($1, 'down')", [ids["c1-l03"]]));
    expect(await positions()).toMatchObject({ "c1-l02": 2, "c1-l03": 3 });
  });

  it("na ponta do ciclo não faz nada", async () => {
    await asUser(db, editor, () => q("select public.move_lesson($1, 'up')", [ids["c1-l01"]]));
    expect((await q<{ position: number }>("select position from public.lessons where slug = 'c1-l01'"))[0].position).toBe(1);
  });

  it("o editor não reordena lição publicada; o Admin reordena e fica no log", async () => {
    // c1-l07 está publicada; a vizinha de cima é a c1-l06 (rascunho).
    await expect(asUser(db, editor, () => q("select public.move_lesson($1, 'up')", [ids["c1-l07"]]))).rejects.toThrow(/só o administrador/);
    await asUser(db, admin, () => q("select public.move_lesson($1, 'up')", [ids["c1-l07"]]));
    expect((await positions())["c1-l07"]).toBe(6);
    expect(await count("select 1 from public.audit_log where action = 'lesson_moved' and entity_id = $1", [ids["c1-l07"]])).toBe(1);
    await asUser(db, admin, () => q("select public.move_lesson($1, 'down')", [ids["c1-l07"]]));
  });

  it("membro comum não reordena", async () => {
    await expect(asUser(db, member, () => q("select public.move_lesson($1, 'up')", [ids["c1-l03"]]))).rejects.toThrow(/não autorizado/);
  });

  it("recusa direção inválida", async () => {
    await expect(asUser(db, editor, () => q("select public.move_lesson($1, 'sideways')", [ids["c1-l03"]]))).rejects.toThrow(/direção inválida/);
  });
});
