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
let ana: string;
let beto: string;
let lessonId: string; // lição com quiz de 3 perguntas
let noQuizLessonId: string; // lição sem quiz
let draftLessonId: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);
const setFlag = (key: string, on: boolean) =>
  asUser(db, admin, () => q("update public.app_settings set value = $2::jsonb where key = $1", [key, JSON.stringify(on)]));

interface Quiz {
  position: number;
  prompt: string;
  options: Record<string, string>;
}
interface Attempt {
  correct_count: number;
  total: number;
  passed: boolean;
  results: { position: number; correct: boolean; explanation: string }[];
}
const getQuiz = (user: string, lesson = lessonId) =>
  asUser(db, user, () => q<{ v: Quiz[] }>("select public.get_quiz($1) as v", [lesson])).then((r) => r[0].v);
const submit = (user: string, answers: Record<string, string>, lesson = lessonId) =>
  asUser(db, user, () => q<{ v: Attempt }>("select public.submit_quiz($1, $2::jsonb) as v", [lesson, JSON.stringify(answers)])).then((r) => r[0].v);
const complete = (user: string, lesson = lessonId) =>
  asUser(db, user, () =>
    q(
      `insert into public.lesson_progress (user_id, lesson_id, status, started_at, completed_at)
       values ($1, $2, 'completed', now(), now())
       on conflict (user_id, lesson_id) do update set status = 'completed', completed_at = now()`,
      [user, lesson],
    ),
  );

beforeAll(async () => {
  db = await createDb();
  church = (await q<{ id: string }>("select id from public.churches where slug = 'vertical-church'"))[0].id;
  await db.exec(buildImportSql(cycles.filter((c) => c.number === 1), { publish: true, churchSlug: "vertical-church" }));
  const lessons = await q<{ id: string }>("select id from public.lessons order by position");
  [lessonId, noQuizLessonId] = [lessons[0].id, lessons[1].id];

  await q("insert into public.church_admins_pending (email, church_id) values ('pastor@example.com', (select id from public.churches where slug = 'vertical-church'))");
  admin = await createUser(db, "pastor@example.com");
  editor = await createUser(db, "editora@example.com");
  ana = await createUser(db, "ana@example.com");
  beto = await createUser(db, "beto@example.com");
  await q("update public.profiles set onboarded_at = now()");
  await asUser(db, admin, () => q("select public.admin_set_role($1, 'editor')", [editor]));

  await q("delete from public.quiz_questions"); // começa sem quiz vindo da importação
  await q(
    `insert into public.quiz_questions (church_id, lesson_id, position, prompt, options, correct_option, explanation) values
      ($1, $2, 1, 'P1?', '{"A":"um","B":"dois","C":"três"}', 'B', 'Porque dois.'),
      ($1, $2, 2, 'P2?', '{"A":"um","B":"dois"}', 'A', 'Porque um.'),
      ($1, $2, 3, 'P3?', '{"A":"um","B":"dois"}', 'B', 'Porque dois de novo.')`,
    [church, lessonId],
  );
  // Uma lição rascunho com quiz (o membro não pode ver).
  const [draft] = await q<{ id: string }>(
    `insert into public.lessons (church_id, cycle_id, slug, title, objective, position, status)
     select church_id, cycle_id, 'rascunho-x', 'Rascunho', 'Objetivo', 99, 'draft' from public.lessons limit 1 returning id`,
  );
  draftLessonId = draft.id;
  await q(`insert into public.quiz_questions (church_id, lesson_id, position, prompt, options, correct_option) values ($1, $2, 1, 'X?', '{"A":"a","B":"b"}', 'A')`, [church, draftLessonId]);
});
afterAll(async () => {
  await db.close();
});

describe("quiz desligado (padrão)", () => {
  it("não entrega perguntas nem corrige, e a conclusão continua livre (MVP)", async () => {
    expect(await getQuiz(ana)).toEqual([]);
    await expect(submit(ana, { "1": "B" })).rejects.toThrow(/não está ativo/);
    await complete(ana); // sem quiz aprovado, mas o recurso está desligado
    expect((await q("select 1 from public.lesson_progress where user_id = $1 and status = 'completed'", [ana])).length).toBe(1);
    await q("delete from public.lesson_progress where user_id = $1", [ana]);
  });
});

describe("quiz ligado", () => {
  beforeAll(async () => {
    await setFlag("feature.quiz", true);
  });

  it("as perguntas chegam sem a resposta certa e sem a explicação", async () => {
    const quiz = await getQuiz(ana);
    expect(quiz.map((x) => x.position)).toEqual([1, 2, 3]);
    expect(quiz[0]).toEqual({ position: 1, prompt: "P1?", options: { A: "um", B: "dois", C: "três" } });
    expect(JSON.stringify(quiz)).not.toMatch(/correct|Porque/);
  });

  it("o membro não lê o gabarito nem direto na tabela", async () => {
    expect(await asUser(db, ana, () => q("select * from public.quiz_questions"))).toEqual([]);
  });

  it("lição rascunho: o membro não acessa o quiz; a equipe sim", async () => {
    await expect(getQuiz(ana, draftLessonId)).rejects.toThrow(/não autorizado/);
    await expect(submit(ana, { "1": "A" }, draftLessonId)).rejects.toThrow(/não autorizado/);
    expect(await getQuiz(editor, draftLessonId)).toHaveLength(1);
  });

  it("quem não está logado não chega ao quiz", async () => {
    await db.exec("set role anon");
    try {
      await expect(q("select public.get_quiz($1)", [lessonId])).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });

  it("errar demais reprova: devolve só acertou/errou e a explicação, e a lição não conclui", async () => {
    const r = await submit(ana, { "1": "A", "2": "B", "3": "B" }); // só a 3 certa
    expect(r).toMatchObject({ correct_count: 1, total: 3, passed: false });
    expect(r.results.map((x) => x.correct)).toEqual([false, false, true]);
    expect(r.results[0].explanation).toBe("Porque dois.");
    expect(JSON.stringify(r)).not.toContain("correct_option");
    await expect(complete(ana)).rejects.toThrow(/acerte o quiz/);
  });

  it("2 de 3 aprova; pode refazer sem limite; e então conclui", async () => {
    await submit(ana, {}); // resposta em branco também é uma tentativa
    const r = await submit(ana, { "1": "B", "2": "A", "3": "A" }); // 2 certas
    expect(r).toMatchObject({ correct_count: 2, passed: true });
    expect((await q("select count(*)::int as n from public.quiz_attempts where user_id = $1", [ana]))[0]).toEqual({ n: 3 });
    await complete(ana);
    expect((await q("select status from public.lesson_progress where user_id = $1", [ana]))[0]).toEqual({ status: "completed" });
  });

  it("a aprovação de uma pessoa não vale para outra", async () => {
    await expect(complete(beto)).rejects.toThrow(/acerte o quiz/);
  });

  it("não dá para gravar tentativa aprovada na mão: só por submit_quiz", async () => {
    await expect(
      asUser(db, beto, () =>
        q(`insert into public.quiz_attempts (user_id, lesson_id, answers, correct_count, total, passed) values ($1, $2, '{}', 3, 3, true)`, [beto, lessonId]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("lição sem quiz continua concluindo normalmente", async () => {
    await complete(beto, noQuizLessonId);
    expect((await q("select 1 from public.lesson_progress where user_id = $1 and status = 'completed'", [beto])).length).toBe(1);
  });

  it("cada pessoa vê só as próprias tentativas; o Admin vê todas; o editor não", async () => {
    expect((await asUser(db, ana, () => q<{ user_id: string }>("select user_id from public.quiz_attempts"))).every((r) => r.user_id === ana)).toBe(true);
    expect(await asUser(db, beto, () => q("select 1 from public.quiz_attempts"))).toEqual([]);
    expect((await asUser(db, admin, () => q("select 1 from public.quiz_attempts"))).length).toBe(3);
    expect(await asUser(db, editor, () => q("select 1 from public.quiz_attempts"))).toEqual([]);
  });

  it("um quiz de 1 ou 2 perguntas exige acertar todas; o de 3, dois", async () => {
    await q("delete from public.quiz_questions where lesson_id = $1 and position > 1", [noQuizLessonId]);
    await q(`insert into public.quiz_questions (church_id, lesson_id, position, prompt, options, correct_option) values ($1, $2, 1, 'Q?', '{"A":"a","B":"b"}', 'A')`, [church, noQuizLessonId]);
    expect(await submit(beto, { "1": "B" }, noQuizLessonId)).toMatchObject({ passed: false });
    expect(await submit(beto, { "1": "A" }, noQuizLessonId)).toMatchObject({ passed: true });
    await q(`insert into public.quiz_questions (church_id, lesson_id, position, prompt, options, correct_option) values ($1, $2, 2, 'R?', '{"A":"a","B":"b"}', 'A')`, [church, noQuizLessonId]);
    expect(await submit(beto, { "1": "A", "2": "B" }, noQuizLessonId)).toMatchObject({ correct_count: 1, total: 2, passed: false });
    await q("delete from public.quiz_questions where lesson_id = $1", [noQuizLessonId]);
  });

  it("uma lição sem perguntas devolve erro claro ao corrigir", async () => {
    await expect(submit(beto, { "1": "A" }, noQuizLessonId)).rejects.toThrow(/não tem quiz/);
  });

  it("respostas que não são um objeto são recusadas", async () => {
    await expect(asUser(db, beto, () => q(`select public.submit_quiz($1, '["B"]'::jsonb)`, [lessonId]))).rejects.toThrow(/inválidas/);
  });

  it("quem já concluiu antes de o quiz ser ligado não é afetado", async () => {
    await setFlag("feature.quiz", false);
    await complete(beto);
    await setFlag("feature.quiz", true);
    await q("update public.lesson_progress set last_position = 1 where user_id = $1", [beto]);
    await asUser(db, beto, () => q("update public.lesson_progress set last_position = 0.5 where user_id = $1", [beto]));
  });
});

describe("reflexões", () => {
  it("com o recurso desligado ninguém grava", async () => {
    await expect(
      asUser(db, ana, () => q("insert into public.reflections (user_id, lesson_id, body) values ($1, $2, 'oi')", [ana, lessonId])),
    ).rejects.toThrow(/row-level security/);
  });

  describe("com o recurso ligado", () => {
    beforeAll(async () => {
      await setFlag("feature.reflections", true);
    });

    it("o dono escreve, edita e apaga a própria reflexão", async () => {
      await asUser(db, ana, () => q("insert into public.reflections (user_id, lesson_id, body) values ($1, $2, 'Aprendi muito')", [ana, lessonId]));
      await asUser(db, ana, () => q("update public.reflections set body = 'Aprendi ainda mais' where user_id = $1", [ana]));
      expect((await asUser(db, ana, () => q<{ body: string }>("select body from public.reflections")))[0].body).toBe("Aprendi ainda mais");
    });

    it("uma reflexão por lição, sem texto vazio nem gigante", async () => {
      await expect(
        asUser(db, ana, () => q("insert into public.reflections (user_id, lesson_id, body) values ($1, $2, 'outra')", [ana, lessonId])),
      ).rejects.toThrow(/unique/);
      await expect(
        asUser(db, beto, () => q("insert into public.reflections (user_id, lesson_id, body) values ($1, $2, '   ')", [beto, lessonId])),
      ).rejects.toThrow(/check/);
      await expect(
        asUser(db, beto, () => q("insert into public.reflections (user_id, lesson_id, body) values ($1, $2, $3)", [beto, lessonId, "x".repeat(5001)])),
      ).rejects.toThrow(/check/);
    });

    it("ninguém lê nem altera a reflexão de outra pessoa; nem o Admin, nem o editor, direto na tabela", async () => {
      for (const who of [beto, editor, admin]) {
        expect(await asUser(db, who, () => q("select 1 from public.reflections"))).toEqual([]);
        expect(await asUser(db, who, () => q("update public.reflections set body = 'hack' returning 1"))).toEqual([]);
        expect(await asUser(db, who, () => q("delete from public.reflections returning 1"))).toEqual([]);
      }
      await expect(
        asUser(db, beto, () => q("insert into public.reflections (user_id, lesson_id, body) values ($1, $2, 'em nome dela')", [ana, noQuizLessonId])),
      ).rejects.toThrow(/row-level security/);
    });

    it("o Admin lê pela função, e cada consulta fica registrada sem o conteúdo", async () => {
      const rows = await asUser(db, admin, () => q<{ body: string; lesson_slug: string }>("select * from public.person_reflections($1)", [ana]));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ body: "Aprendi ainda mais", lesson_slug: "c1-l01" });
      const log = await q<{ actor_id: string; entity_id: string; details: unknown }>(
        "select actor_id, entity_id, details from public.audit_log where action = 'reflections_viewed'",
      );
      expect(log).toEqual([{ actor_id: admin, entity_id: ana, details: {} }]);
    });

    it("editor e membro são recusados na função; o Admin lendo as próprias não gera registro", async () => {
      await expect(asUser(db, editor, () => q("select * from public.person_reflections($1)", [ana]))).rejects.toThrow(/não autorizado/);
      await expect(asUser(db, beto, () => q("select * from public.person_reflections($1)", [ana]))).rejects.toThrow(/não autorizado/);
      const before = (await q<{ n: number }>("select count(*)::int as n from public.audit_log where action = 'reflections_viewed'"))[0].n;
      await asUser(db, admin, () => q("select * from public.person_reflections($1)", [admin]));
      expect((await q<{ n: number }>("select count(*)::int as n from public.audit_log where action = 'reflections_viewed'"))[0].n).toBe(before);
    });

    it("excluir a conta apaga reflexões e tentativas", async () => {
      await asUser(db, ana, () => q("select public.delete_my_account()"));
      expect(await q("select 1 from public.reflections")).toEqual([]);
      expect(await q("select 1 from public.quiz_attempts where user_id = $1", [ana])).toEqual([]);
    });
  });
});
