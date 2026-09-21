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
let ana: string; // concluiu o ciclo 1, presente
let beto: string; // concluiu o ciclo 1, ausente
let cida: string; // não concluiu, presente
let dora: string; // concluiu, sem presença registrada
let cycleId: string;
let eventId: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);
const as = <T>(user: string, sql: string, params: unknown[] = []) => asUser(db, user, () => q<T>(sql, params));
const setFlag = (key: string, on: boolean) => as(admin, "update public.app_settings set value = $2::jsonb where key = $1", [key, JSON.stringify(on)]);
async function asAnon<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec("set role anon");
  try {
    return await q<T>(sql, params);
  } finally {
    await db.exec("reset role");
  }
}
const finish = (user: string) =>
  q("insert into public.cycle_progress (user_id, cycle_id, status, completed_at) values ($1, $2, 'completed', now())", [user, cycleId]);

beforeAll(async () => {
  db = await createDb();
  await db.exec(buildImportSql(cycles.filter((c) => c.number === 1), { publish: true }));
  cycleId = (await q<{ id: string }>("select id from public.cycles limit 1"))[0].id;

  await q("insert into public.app_config (key, value) values ('initial_admin_email', 'pastor@example.com')");
  admin = await createUser(db, "pastor@example.com", { name: "Pastor" });
  editor = await createUser(db, "editora@example.com");
  ana = await createUser(db, "ana@example.com", { name: "Ana Paula Souza" });
  beto = await createUser(db, "beto@example.com", { name: "Beto" });
  cida = await createUser(db, "cida@example.com", { name: "Cida" });
  dora = await createUser(db, "dora@example.com", { name: "Dora" });
  await q("update public.profiles set onboarded_at = now()");
  await as(admin, "select public.admin_set_role($1, 'editor')", [editor]);
  for (const u of [ana, beto, dora]) await finish(u);
});
afterAll(async () => {
  await db.close();
});

describe("encerramentos", () => {
  it("só o Admin cria, edita e apaga eventos", async () => {
    for (const who of [editor, ana]) {
      await expect(
        as(who, "insert into public.closure_events (cycle_id, title, starts_at) values ($1, 'Culto', now())", [cycleId]),
      ).rejects.toThrow(/row-level security/);
    }
    const [row] = await as<{ id: string; created_by: string }>(
      admin,
      "insert into public.closure_events (cycle_id, title, kind, starts_at, location) values ($1, 'Culto de boas-vindas', 'Culto', now() + interval '10 days', 'Templo') returning id, created_by",
      [cycleId],
    );
    eventId = row.id;
    expect(row.created_by).toBe(admin);
    expect(await as(ana, "update public.closure_events set title = 'x' returning 1")).toEqual([]);
    expect(await as(ana, "delete from public.closure_events returning 1")).toEqual([]);
  });

  it("com o recurso desligado o membro não vê o evento; o Admin vê", async () => {
    expect(await as(ana, "select 1 from public.closure_events")).toEqual([]);
    expect((await as(admin, "select 1 from public.closure_events")).length).toBe(1);
    await setFlag("feature.closures", true);
    expect((await as(ana, "select title from public.closure_events"))[0]).toEqual({ title: "Culto de boas-vindas" });
  });

  it("não aceita título vazio", async () => {
    await expect(
      as(admin, "insert into public.closure_events (cycle_id, title, starts_at) values ($1, '  ', now())", [cycleId]),
    ).rejects.toThrow(/check/);
  });
});

describe("presença", () => {
  it("só o Admin registra; direto na tabela ninguém grava", async () => {
    await expect(as(editor, "select public.save_attendance($1, $2, $3)", [eventId, [ana], []])).rejects.toThrow(/não autorizado/);
    await expect(as(ana, "select public.save_attendance($1, $2, $3)", [eventId, [ana], []])).rejects.toThrow(/não autorizado/);
    await expect(as(admin, "insert into public.closure_attendance (event_id, user_id, present) values ($1, $2, true)", [eventId, ana])).rejects.toThrow(/permission denied/);
  });

  it("confirma presentes e ausentes, pode corrigir depois, e registra quem confirmou", async () => {
    await as(admin, "select public.save_attendance($1, $2, $3)", [eventId, [ana, cida], [beto]]);
    const rows = await q<{ user_id: string; present: boolean; confirmed_by: string }>("select user_id, present, confirmed_by from public.closure_attendance order by present desc, user_id");
    expect(rows.filter((r) => r.present).map((r) => r.user_id).sort()).toEqual([ana, cida].sort());
    expect(rows.every((r) => r.confirmed_by === admin)).toBe(true);

    await as(admin, "select public.save_attendance($1, $2, $3)", [eventId, [beto], [cida]]);
    expect((await q<{ present: boolean }>("select present from public.closure_attendance where user_id = $1", [beto]))[0].present).toBe(true);
    expect((await q<{ present: boolean }>("select present from public.closure_attendance where user_id = $1", [cida]))[0].present).toBe(false);
    await as(admin, "select public.save_attendance($1, $2, $3)", [eventId, [ana], [beto]]); // volta ao combinado: Ana presente, Beto ausente
    expect((await q("select 1 from public.audit_log where action = 'closure_attendance_saved'")).length).toBe(3);
  });

  it("recusa a mesma pessoa nas duas listas e evento que não existe", async () => {
    await expect(as(admin, "select public.save_attendance($1, $2, $3)", [eventId, [ana], [ana]])).rejects.toThrow(/presente e ausente/);
    await expect(as(admin, "select public.save_attendance($1, $2, $3)", ["00000000-0000-4000-8000-000000000000", [ana], []])).rejects.toThrow(/não encontrado/);
  });

  it("cada membro vê só a própria presença; o Admin vê todas", async () => {
    expect((await as<{ user_id: string }>(ana, "select user_id from public.closure_attendance")).map((r) => r.user_id)).toEqual([ana]);
    expect(await as(editor, "select 1 from public.closure_attendance")).toEqual([]);
    expect((await as(admin, "select 1 from public.closure_attendance")).length).toBe(3);
  });
});

describe("certificados (RN-06)", () => {
  it("só o Admin emite, e só com o recurso ligado", async () => {
    await expect(as(ana, "select public.issue_certificates($1)", [eventId])).rejects.toThrow(/não autorizado/);
    await expect(as(editor, "select public.issue_certificates($1)", [eventId])).rejects.toThrow(/não autorizado/);
    await expect(as(admin, "select public.issue_certificates($1)", [eventId])).rejects.toThrow(/não está ligado/);
    await setFlag("feature.certificates", true);
  });

  it("emite só para quem concluiu o ciclo E teve a presença confirmada", async () => {
    // Ana: concluiu + presente. Beto: concluiu, ausente. Cida: presente (agora ausente) e sem ciclo concluído. Dora: concluiu, sem registro.
    await as(admin, "select public.save_attendance($1, $2, $3)", [eventId, [ana, cida], [beto]]);
    expect((await as<{ n: number }>(admin, "select public.issue_certificates($1) as n", [eventId]))[0].n).toBe(1);
    const certs = await q<{ user_id: string; holder_name: string; code: string; issued_by: string }>("select user_id, holder_name, code, issued_by from public.certificates");
    expect(certs).toHaveLength(1);
    expect(certs[0]).toMatchObject({ user_id: ana, holder_name: "Ana Paula Souza", issued_by: admin });
    expect(certs[0].code).toMatch(/^VC-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it("emitir de novo não duplica; quem passa a ter presença recebe na próxima emissão", async () => {
    expect((await as<{ n: number }>(admin, "select public.issue_certificates($1) as n", [eventId]))[0].n).toBe(0);
    await as(admin, "select public.save_attendance($1, $2, $3)", [eventId, [dora], []]);
    expect((await as<{ n: number }>(admin, "select public.issue_certificates($1) as n", [eventId]))[0].n).toBe(1);
    expect((await q("select 1 from public.certificates")).length).toBe(2);
    expect((await q("select 1 from public.audit_log where action = 'certificates_issued'")).length).toBe(2);
  });

  it("o nome fica como estava na emissão, mesmo que o perfil mude", async () => {
    await q("update public.profiles set display_name = 'Outro Nome' where id = $1", [ana]);
    expect((await q<{ holder_name: string }>("select holder_name from public.certificates where user_id = $1", [ana]))[0].holder_name).toBe("Ana Paula Souza");
  });

  it("cada pessoa vê só o próprio certificado; o Admin vê todos; ninguém grava direto", async () => {
    expect((await as<{ user_id: string }>(ana, "select user_id from public.certificates")).map((r) => r.user_id)).toEqual([ana]);
    expect(await as(beto, "select 1 from public.certificates")).toEqual([]);
    expect(await as(editor, "select 1 from public.certificates")).toEqual([]);
    expect((await as(admin, "select 1 from public.certificates")).length).toBe(2);
    await expect(as(admin, "insert into public.certificates (user_id, cycle_id, holder_name, code) values ($1, $2, 'x', 'VC-0000-0000-0000')", [beto, cycleId])).rejects.toThrow(/permission denied/);
    await expect(as(admin, "update public.certificates set holder_name = 'Falso'")).rejects.toThrow(/permission denied/);
    await expect(as(admin, "delete from public.certificates")).rejects.toThrow(/permission denied/);
  });
});

describe("verificação pública", () => {
  it("quem tem o código confere nome, ciclo e data; sem login", async () => {
    const [{ code }] = await q<{ code: string }>("select code from public.certificates where user_id = $1", [ana]);
    const rows = await asAnon<{ holder_name: string; cycle_title: string; issued_at: string }>("select * from public.verify_certificate($1)", [code]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ holder_name: "Ana Paula Souza", cycle_title: "Fundamentos" });
    // Tolera minúsculas e espaços ao redor (quem digita o código do papel).
    expect(await asAnon("select * from public.verify_certificate($1)", [`  ${code.toLowerCase()} `])).toHaveLength(1);
  });

  it("código inexistente ou vazio não devolve nada, e a resposta não traz nada além do necessário", async () => {
    expect(await asAnon("select * from public.verify_certificate($1)", ["VC-0000-0000-0000"])).toEqual([]);
    expect(await asAnon("select * from public.verify_certificate($1)", [""])).toEqual([]);
    const [{ code }] = await q<{ code: string }>("select code from public.certificates limit 1");
    const [row] = await asAnon<Record<string, unknown>>("select * from public.verify_certificate($1)", [code]);
    expect(Object.keys(row).sort()).toEqual(["cycle_title", "holder_name", "issued_at"]);
  });

  it("o anônimo não lê a tabela de certificados", async () => {
    await expect(asAnon("select code from public.certificates")).rejects.toThrow(/permission denied/);
  });
});

describe("aviso por e-mail do certificado", () => {
  it("o agendador lê os certificados recentes de quem aceitou e-mails, e só com o segredo", async () => {
    const secret = "segredo-de-teste-com-mais-de-32-caracteres";
    await q("insert into public.app_config (key, value) values ('cron_secret_hash', encode(sha256(convert_to($1, 'UTF8')), 'hex'))", [secret]);
    await setFlag("feature.reminders", true);
    await expect(asAnon("select public.cron_certificates($1)", ["errado"])).rejects.toThrow(/não autorizado/);
    expect((await asAnon<{ v: unknown[] }>("select public.cron_certificates($1) as v", [secret]))[0].v).toEqual([]); // ninguém aceitou e-mails ainda
    await q("insert into public.consents (user_id, purpose, term_version) values ($1, 'email_reminders', 'v1')", [ana]);
    const [{ v }] = await asAnon<{ v: { user_id: string; cycle_title: string; code: string }[] }>("select public.cron_certificates($1) as v", [secret]);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ user_id: ana, cycle_title: "Fundamentos" });
  });
});

describe("conta excluída", () => {
  it("excluir a conta apaga certificado e presença; a verificação passa a dizer que não existe", async () => {
    const [{ code }] = await q<{ code: string }>("select code from public.certificates where user_id = $1", [ana]);
    await as(ana, "select public.delete_my_account()");
    expect(await q("select 1 from public.certificates where user_id = $1", [ana])).toEqual([]);
    expect(await q("select 1 from public.closure_attendance where user_id = $1", [ana])).toEqual([]);
    expect(await asAnon("select * from public.verify_certificate($1)", [code])).toEqual([]);
  });
});
