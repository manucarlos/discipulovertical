import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDb, createUser } from "./harness";

/** Formulário de feedback do piloto (RF-32): público para escrever, só do Admin para ler. */
let db: PGlite;
let admin: string;
let member: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);

const setFeedback = (on: boolean) =>
  q("update public.app_settings set value = $1::jsonb where key = 'feature.feedback'", [JSON.stringify(on)]);

async function asAnon<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec("set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

const submit = (over: Partial<Record<string, unknown>> = {}) => {
  const a = { device: "iphone", entered: "sim", lesson: "sim", ease: 4, alone: "com_ajuda", liked: "Leve", confusing: null, suggestion: null, name: null, contact: null, ...over };
  return q("select public.submit_feedback($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)", [
    a.device, a.entered, a.lesson, a.ease, a.alone, a.liked, a.confusing, a.suggestion, a.name, a.contact,
  ]);
};
const count = async () => Number((await q<{ n: string }>("select count(*) as n from public.feedback_responses"))[0].n);

beforeAll(async () => {
  db = await createDb();
  await q("insert into public.church_admins_pending (email, church_id) values ('pastor@example.com', (select id from public.churches where slug = 'vertical-church'))");
  admin = await createUser(db, "pastor@example.com");
  member = await createUser(db, "membro@example.com");
});
afterAll(async () => {
  await db.close();
});

describe("chave do formulário", () => {
  it("nasce desligada, e a página pública sabe disso sem login", async () => {
    expect((await q<{ value: boolean }>("select value from public.app_settings where key = 'feature.feedback'"))[0].value).toBe(false);
    const v = await asAnon(async () => (await q<{ v: Record<string, boolean> }>("select public.public_features() as v"))[0].v);
    expect(v).toEqual({ email_login: false, feedback: false });
  });

  it("com a chave desligada, nem o visitante nem o membro enviam", async () => {
    await expect(asAnon(() => submit())).rejects.toThrow(/fechado/);
    await expect(asUser(db, member, () => submit())).rejects.toThrow(/fechado/);
    expect(await count()).toBe(0);
  });
});

describe("enviar (visitante sem login)", () => {
  beforeAll(async () => {
    await asUser(db, admin, () => setFeedback(true));
  });

  it("aceita a resposta, limpa os espaços e guarda vazio como nulo", async () => {
    await asAnon(() => submit({ liked: "  Gostei da leitura.  ", confusing: "   ", contact: "" }));
    const [row] = await q<Record<string, unknown>>("select * from public.feedback_responses");
    expect(row).toMatchObject({ device: "iphone", entered: "sim", lesson_done: "sim", ease: 4, alone: "com_ajuda", liked: "Gostei da leitura.", confusing: null, contact: null });
    expect(row.created_at).toBeTruthy();
    await q("delete from public.feedback_responses");
  });

  it("recusa valores fora da lista, nota fora de 1 a 5 e texto grande demais", async () => {
    await expect(asAnon(() => submit({ device: "geladeira" }))).rejects.toThrow();
    await expect(asAnon(() => submit({ entered: "talvez" }))).rejects.toThrow();
    await expect(asAnon(() => submit({ ease: 0 }))).rejects.toThrow();
    await expect(asAnon(() => submit({ ease: 6 }))).rejects.toThrow();
    await expect(asAnon(() => submit({ liked: "a".repeat(1001) }))).rejects.toThrow();
    await expect(asAnon(() => submit({ contact: "c".repeat(121) }))).rejects.toThrow();
    expect(await count()).toBe(0);
  });

  it("o visitante não lê, não apaga e não grava direto na tabela", async () => {
    await asAnon(() => submit());
    await expect(asAnon(() => q("select * from public.feedback_responses"))).rejects.toThrow(/permission denied/);
    await expect(asAnon(() => q("delete from public.feedback_responses"))).rejects.toThrow(/permission denied/);
    await expect(
      asAnon(() => q("insert into public.feedback_responses (device, entered, lesson_done, ease, alone) values ('iphone','sim','sim',5,'sim')")),
    ).rejects.toThrow(/permission denied/);
    await q("delete from public.feedback_responses");
  });

  it("limita a 30 respostas por hora e depois pede para voltar mais tarde", async () => {
    for (let i = 0; i < 30; i++) await asAnon(() => submit());
    await expect(asAnon(() => submit())).rejects.toThrow(/muitas respostas/);
    expect(await count()).toBe(30);
    // Passada a hora, volta a aceitar.
    await q("update public.feedback_responses set created_at = now() - interval '2 hours'");
    await asAnon(() => submit());
    expect(await count()).toBe(31);
    await q("delete from public.feedback_responses");
  });
});

describe("ler e apagar (só o Admin)", () => {
  beforeAll(async () => {
    await asUser(db, admin, () => setFeedback(true));
    await asAnon(() => submit({ liked: "Primeira" }));
    await asAnon(() => submit({ liked: "Segunda" }));
  });

  it("o membro não vê nada e não apaga nada", async () => {
    expect(await asUser(db, member, () => q("select id from public.feedback_responses"))).toHaveLength(0);
    expect(await asUser(db, member, () => q("delete from public.feedback_responses returning id"))).toHaveLength(0);
    expect(await count()).toBe(2);
  });

  it("o membro não consegue nem gravar direto na tabela", async () => {
    await expect(
      asUser(db, member, () => q("insert into public.feedback_responses (device, entered, lesson_done, ease, alone) values ('iphone','sim','sim',5,'sim')")),
    ).rejects.toThrow();
  });

  it("o Admin lê todas e apaga uma por vez", async () => {
    const rows = await asUser(db, admin, () => q<{ id: string; liked: string }>("select id, liked from public.feedback_responses order by liked"));
    expect(rows.map((r) => r.liked)).toEqual(["Primeira", "Segunda"]);
    const deleted = await asUser(db, admin, () => q("delete from public.feedback_responses where id = $1 returning id", [rows[0].id]));
    expect(deleted).toHaveLength(1);
    expect(await count()).toBe(1);
  });

  it("o Admin desliga o formulário e o envio volta a ser recusado", async () => {
    await asUser(db, admin, () => setFeedback(false));
    await expect(asAnon(() => submit())).rejects.toThrow(/fechado/);
  });
});
