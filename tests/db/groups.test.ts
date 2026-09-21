import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createDb, createUser } from "./harness";

let db: PGlite;
let admin: string;
let editor: string;
let disc: string; // discipulador
let disc2: string; // outro discipulador
let ana: string; // discípula
let beto: string; // discípulo
let cida: string; // de fora
let lessons: string[] = []; // 3 lições da biblioteca (a 3ª é sensível) + 1 fora da trilha
let outsideLesson: string;
let trackId: string;
let groupId: string;
let code: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);
const as = <T>(user: string, sql: string, params: unknown[] = []) => asUser(db, user, () => q<T>(sql, params));
const setFlag = (on: boolean) => as(admin, "update public.app_settings set value = $1::jsonb where key = 'feature.groups'", [JSON.stringify(on)]);

async function libraryLesson(slug: string, position: number, sensitive = false, status = "published") {
  const [l] = await q<{ id: string }>(
    `insert into public.lessons (kind, cycle_id, slug, title, objective, position, status, sensitive, themes)
     values ('library', null, $1, $2, 'Objetivo', $3, 'draft', $4, '{Teste}') returning id`,
    [slug, `Lição ${slug}`, position, sensitive],
  );
  const [v] = await q<{ id: string }>(
    "insert into public.lesson_versions (lesson_id, content) values ($1, '{\"blocks\":[],\"practice\":null,\"reflection\":null}') returning id",
    [l.id],
  );
  await q("update public.lessons set current_version_id = $2, status = $3 where id = $1", [l.id, v.id, status]);
  return l.id;
}

beforeAll(async () => {
  db = await createDb();
  await q("insert into public.app_config (key, value) values ('initial_admin_email', 'pastor@example.com')");
  admin = await createUser(db, "pastor@example.com", { name: "Pastor" });
  editor = await createUser(db, "editora@example.com");
  disc = await createUser(db, "disc@example.com", { name: "Discipulador" });
  disc2 = await createUser(db, "disc2@example.com", { name: "Outro Discipulador" });
  ana = await createUser(db, "ana@example.com", { name: "Ana" });
  beto = await createUser(db, "beto@example.com", { name: "Beto" });
  cida = await createUser(db, "cida@example.com", { name: "Cida" });
  await q("update public.profiles set onboarded_at = now()");
  await as(admin, "select public.admin_set_role($1, 'editor')", [editor]);

  lessons = [await libraryLesson("lib-1", 1), await libraryLesson("lib-2", 2), await libraryLesson("lib-3", 3, true)];
  outsideLesson = await libraryLesson("lib-fora", 4);
  const [t] = await q<{ id: string }>("insert into public.tracks (title, description) values ('Trilha de teste', 'Três dias') returning id");
  trackId = t.id;
  for (const [i, l] of lessons.entries()) await q("insert into public.track_days (track_id, day_number, lesson_id) values ($1, $2, $3)", [trackId, i + 1, l]);
  await q("update public.tracks set status = 'published' where id = $1", [trackId]);
});
afterAll(async () => {
  await db.close();
});

describe("recurso desligado (padrão)", () => {
  it("ninguém cria grupo, lê trilha ou lição da biblioteca", async () => {
    await expect(as(disc, "select public.create_group('G', $1, current_date, null, null, null)", [trackId])).rejects.toThrow(/Só um discipulador/);
    expect(await as(ana, "select 1 from public.tracks")).toEqual([]);
    expect(await as(ana, "select 1 from public.lessons where kind = 'library'")).toEqual([]);
    expect((await as(admin, "select 1 from public.tracks")).length).toBe(1); // a equipe sempre vê
  });
});

describe("discipuladores e trilhas", () => {
  beforeAll(async () => {
    await setFlag(true);
  });

  it("só o Admin marca quem é discipulador, e fica no registro", async () => {
    for (const who of [editor, disc, ana]) {
      await expect(as(who, "select public.admin_set_discipler($1, true)", [disc])).rejects.toThrow(/não autorizado/);
    }
    await as(admin, "select public.admin_set_discipler($1, true)", [disc]);
    await as(admin, "select public.admin_set_discipler($1, true)", [disc2]);
    expect((await q("select 1 from public.profiles where is_discipler")).length).toBe(2);
    expect((await q("select 1 from public.audit_log where action = 'discipler_changed'")).length).toBe(2);
    await expect(as(ana, "update public.profiles set is_discipler = true where id = $1", [ana])).rejects.toThrow(/permission denied/);
  });

  it("trilhas: só o Admin escreve; o cardápio publicado é de todos; rascunho só da equipe", async () => {
    await expect(as(editor, "insert into public.tracks (title) values ('x')")).rejects.toThrow(/row-level security/);
    await expect(as(disc, "insert into public.tracks (title) values ('x')")).rejects.toThrow(/row-level security/);
    const [draft] = await as<{ id: string }>(admin, "insert into public.tracks (title) values ('Rascunho') returning id");
    expect((await as(ana, "select title from public.tracks")).map((r) => (r as { title: string }).title)).toEqual(["Trilha de teste"]);
    expect((await as(editor, "select 1 from public.tracks")).length).toBe(2);
    expect((await as(ana, "select 1 from public.track_days")).length).toBe(3);

    // Não publica sem dias, nem com lição não publicada.
    await expect(as(admin, "update public.tracks set status = 'published' where id = $1", [draft.id])).rejects.toThrow(/pelo menos um dia/);
    const draftLesson = await libraryLesson("lib-rascunho", 9, false, "draft");
    await as(admin, "insert into public.track_days (track_id, day_number, lesson_id) values ($1, 1, $2)", [draft.id, draftLesson]);
    await expect(as(admin, "update public.tracks set status = 'published' where id = $1", [draft.id])).rejects.toThrow(/lições da trilha precisam estar publicadas/);
    await q("delete from public.tracks where id = $1", [draft.id]);
  });

  it("lição da biblioteca não aparece na trilha comum e é só de quem está no grupo", async () => {
    expect(await as(ana, "select 1 from public.lessons where kind = 'library'")).toEqual([]);
    expect((await as(editor, "select 1 from public.lessons where kind = 'library'")).length).toBe(5); // 4 da trilha de teste + o rascunho
    // Uma lição da biblioteca não pertence a ciclo, e uma da trilha precisa de ciclo.
    await q("insert into public.cycles (slug, title, position) values ('c-teste', 'Ciclo de teste', 1)");
    await expect(q("insert into public.lessons (kind, cycle_id, slug, title, position) values ('library', (select id from public.cycles limit 1), 'x', 'x', 1)")).rejects.toThrow(/lessons_kind_cycle/);
    await expect(q("insert into public.lessons (kind, cycle_id, slug, title, position) values ('trail', null, 'y', 'y', 1)")).rejects.toThrow(/lessons_kind_cycle/);
  });
});

describe("criar e entrar no grupo", () => {
  it("só discipulador cria, e só com trilha publicada; o convite tem formato próprio", async () => {
    await expect(as(ana, "select public.create_group('G', $1, current_date, null, null, null)", [trackId])).rejects.toThrow(/Só um discipulador/);
    const [draft] = await q<{ id: string }>("insert into public.tracks (title) values ('Rascunho 2') returning id");
    await expect(as(disc, "select public.create_group('G', $1, current_date, null, null, null)", [draft.id])).rejects.toThrow(/trilha publicada/);

    const [g] = await as<{ id: string }>(disc, "select public.create_group('  Grupo da Manhã ', $1, current_date, '{1,2,3,4,5}', 7, 6) as id", [trackId]);
    groupId = g.id;
    const [row] = await q<{ invite_code: string; name: string; discipler_id: string; release_hour: number; active_weekdays: number[] }>("select * from public.discipleship_groups");
    code = row.invite_code;
    expect(row).toMatchObject({ name: "Grupo da Manhã", discipler_id: disc, release_hour: 7, active_weekdays: [1, 2, 3, 4, 5] });
    expect(code).toMatch(/^G-[0-9A-F]{8}$/);
  });

  it("dados de grupo inválidos são recusados pelo banco", async () => {
    await expect(as(disc, "select public.create_group('G', $1, current_date, '{0,9}', 6, 1)", [trackId])).rejects.toThrow(/check/);
    await expect(as(disc, "select public.create_group('G', $1, current_date, '{1}', 25, 1)", [trackId])).rejects.toThrow(/check/);
    await expect(as(disc, "select public.create_group('   ', $1, current_date, '{1}', 6, 1)", [trackId])).rejects.toThrow(/check/);
  });

  it("o discípulo entra pelo código (com o consentimento), inclusive em minúsculas; sem consentimento ou código errado, não", async () => {
    await expect(as(ana, "select public.join_group($1, '')", [code])).rejects.toThrow(/consentimento/);
    await expect(as(ana, "select public.join_group('G-00000000', 'v1')")).rejects.toThrow(/Convite não encontrado/);
    await expect(as(disc, "select public.join_group($1, 'v1')", [code])).rejects.toThrow(/Você conduz/);
    await as(ana, "select public.join_group($1, 'v1')", [code.toLowerCase()]);
    await as(beto, "select public.join_group($1, 'v1')", [code]);
    await as(ana, "select public.join_group($1, 'v2')", [code]); // de novo: sem duplicar
    expect(await q("select 1 from public.group_members where group_id = $1", [groupId])).toHaveLength(2);
    expect((await q<{ consent_version: string }>("select consent_version from public.group_members where user_id = $1", [ana]))[0].consent_version).toBe("v2");
  });

  it("quem vê o grupo: o discipulador, os membros e o Admin; de fora, nada; outro discipulador, nada", async () => {
    expect((await as(disc, "select 1 from public.discipleship_groups")).length).toBe(1);
    expect((await as(ana, "select 1 from public.discipleship_groups")).length).toBe(1);
    expect((await as(admin, "select 1 from public.discipleship_groups")).length).toBe(1);
    expect(await as(cida, "select 1 from public.discipleship_groups")).toEqual([]);
    expect(await as(disc2, "select 1 from public.discipleship_groups")).toEqual([]);
    expect((await as(disc, "select 1 from public.group_members")).length).toBe(2);
    expect((await as<{ user_id: string }>(ana, "select user_id from public.group_members")).map((r) => r.user_id)).toEqual([ana]); // o discípulo só vê a si
    await expect(as(disc, "update public.discipleship_groups set name = 'x'")).rejects.toThrow(/permission denied/);
  });

  it("as lições da trilha do grupo abrem para o discipulador e os membros; a de fora e os de fora, não", async () => {
    for (const who of [ana, beto, disc]) {
      expect((await as(who, "select 1 from public.lessons where kind = 'library'")).length, who).toBe(3);
      expect((await as(who, "select 1 from public.lesson_versions")).length, who).toBe(3);
    }
    expect(await as(cida, "select 1 from public.lessons where kind = 'library'")).toEqual([]);
    expect(await as(disc2, "select 1 from public.lessons where kind = 'library'")).toEqual([]);
    expect(await as(ana, "select 1 from public.lessons where id = $1", [outsideLesson])).toEqual([]);
  });
});

describe("progresso e reflexões (RG-07, RG-08)", () => {
  it("o discípulo grava o próprio progresso só para lições da trilha do grupo", async () => {
    await as(ana, "insert into public.group_progress (user_id, group_id, lesson_id, completed_at) values ($1, $2, $3, now())", [ana, groupId, lessons[0]]);
    await expect(as(ana, "insert into public.group_progress (user_id, group_id, lesson_id) values ($1, $2, $3)", [ana, groupId, outsideLesson])).rejects.toThrow(/row-level security/);
    await expect(as(ana, "insert into public.group_progress (user_id, group_id, lesson_id) values ($1, $2, $3)", [beto, groupId, lessons[0]])).rejects.toThrow(/row-level security/);
    await expect(as(cida, "insert into public.group_progress (user_id, group_id, lesson_id) values ($1, $2, $3)", [cida, groupId, lessons[0]])).rejects.toThrow(/row-level security/);
    await as(beto, "insert into public.group_progress (user_id, group_id, lesson_id) values ($1, $2, $3)", [beto, groupId, lessons[0]]);
  });

  it("o discipulador lê o progresso do grupo; o outro discipulador e o discípulo colega, não", async () => {
    expect((await as(disc, "select 1 from public.group_progress")).length).toBe(2);
    expect((await as<{ user_id: string }>(ana, "select user_id from public.group_progress")).map((r) => r.user_id)).toEqual([ana]);
    expect(await as(disc2, "select 1 from public.group_progress")).toEqual([]);
  });

  it("reflexões: o discipulador lê só as compartilhadas; a privada fica só com o dono", async () => {
    await as(ana, "insert into public.group_reflections (user_id, group_id, lesson_id, body, shared) values ($1, $2, $3, 'Comum, compartilhada', true)", [ana, groupId, lessons[0]]);
    await as(ana, "insert into public.group_reflections (user_id, group_id, lesson_id, body, shared) values ($1, $2, $3, 'Sensível, privada', false)", [ana, groupId, lessons[2]]);
    expect((await as<{ body: string }>(disc, "select body from public.group_reflections")).map((r) => r.body)).toEqual(["Comum, compartilhada"]);
    expect((await as(ana, "select 1 from public.group_reflections")).length).toBe(2);
    expect(await as(beto, "select 1 from public.group_reflections")).toEqual([]);
    expect(await as(admin, "select 1 from public.group_reflections")).toEqual([]); // nem o Admin lê as reflexões do grupo
    expect(await as(disc2, "select 1 from public.group_reflections")).toEqual([]);
    // O discípulo muda o que compartilha, reflexão por reflexão.
    await as(ana, "update public.group_reflections set shared = true where lesson_id = $1", [lessons[2]]);
    expect((await as(disc, "select 1 from public.group_reflections")).length).toBe(2);
    await as(ana, "update public.group_reflections set shared = false where lesson_id = $1", [lessons[2]]);
    expect(await as(disc, "update public.group_reflections set shared = true returning 1")).toEqual([]); // o discipulador não altera nada
  });

  it("sair do grupo tira o acesso do discipulador aos dados da pessoa, sem apagar o que ela escreveu", async () => {
    await as(ana, "select public.leave_group($1)", [groupId]);
    expect((await as<{ user_id: string }>(disc, "select user_id from public.group_progress")).map((r) => r.user_id)).toEqual([beto]);
    expect(await as(disc, "select 1 from public.group_reflections")).toEqual([]);
    expect((await as(disc, "select user_id from public.group_members where status = 'active'")).length).toBe(1);
    expect((await as(ana, "select 1 from public.group_reflections")).length).toBe(2); // continua dela
    expect(await as(ana, "select 1 from public.discipleship_groups")).toEqual([]);
    expect(await as(ana, "select 1 from public.lessons where kind = 'library'")).toEqual([]);
    await as(ana, "select public.join_group($1, 'v1')", [code]); // pode voltar
    expect((await as(disc, "select 1 from public.group_progress")).length).toBe(2);
  });
});

describe("pausas e encontros", () => {
  it("só o discipulador (e o Admin) pausa e registra encontro; as notas não chegam aos discípulos", async () => {
    await expect(as(ana, "select public.add_group_pause($1, current_date, current_date)", [groupId])).rejects.toThrow(/não autorizado/);
    await expect(as(disc2, "select public.add_group_pause($1, current_date, current_date)", [groupId])).rejects.toThrow(/não autorizado/);
    await expect(as(disc, "select public.add_group_pause($1, current_date + 2, current_date)", [groupId])).rejects.toThrow(/fim da pausa/);
    await as(disc, "select public.add_group_pause($1, current_date + 1, current_date + 3)", [groupId]);
    expect((await as(ana, "select 1 from public.group_pauses")).length).toBe(1); // os membros veem a pausa
    const [pause] = await q<{ id: string }>("select id from public.group_pauses");
    await expect(as(ana, "select public.remove_group_pause($1)", [pause.id])).rejects.toThrow(/não autorizado/);

    await as(disc, "select public.save_group_meeting($1, current_date, 'Falamos de perdão.', $2)", [groupId, [ana, beto, cida]]);
    const [m] = await q<{ attendees: string[]; notes: string }>("select attendees, notes from public.group_meetings");
    expect(m.notes).toBe("Falamos de perdão.");
    expect(m.attendees.sort()).toEqual([ana, beto].sort()); // a Cida não está no grupo: fora da lista
    expect(await as(ana, "select 1 from public.group_meetings")).toEqual([]);
    expect((await as(disc, "select 1 from public.group_meetings")).length).toBe(1);
    await as(disc, "select public.save_group_meeting($1, current_date, 'Corrigido.', $2)", [groupId, [beto]]);
    expect((await q<{ notes: string }>("select notes from public.group_meetings"))[0].notes).toBe("Corrigido.");
    expect(await q("select 1 from public.group_meetings")).toHaveLength(1);
    await as(disc, "select public.remove_group_pause($1)", [pause.id]);
  });
});

describe("pedidos de ajuda pastoral (RG-09, RG-10)", () => {
  let toDiscipler: string;
  let direct: string;

  it("ao discipulador: só o discipulador do grupo vê; o Admin ainda não", async () => {
    [{ id: toDiscipler }] = await as<{ id: string }>(ana, "select public.request_help($1, $2, 'Ansiedade', 'Estou sobrecarregada.', 'discipler') as id", [groupId, lessons[2]]);
    expect((await as(disc, "select 1 from public.help_requests")).length).toBe(1);
    expect((await as(ana, "select 1 from public.help_requests")).length).toBe(1);
    expect(await as(admin, "select 1 from public.help_requests")).toEqual([]);
    expect(await as(disc2, "select 1 from public.help_requests")).toEqual([]);
    expect(await as(beto, "select 1 from public.help_requests")).toEqual([]);
  });

  it("quem não está no grupo não pede ao discipulador dele", async () => {
    await expect(as(cida, "select public.request_help($1, null, 't', 'oi', 'discipler')", [groupId])).rejects.toThrow(/precisa estar no grupo/);
    await expect(as(ana, "select public.request_help($1, null, 't', 'oi', 'outro')", [groupId])).rejects.toThrow(/Destino inválido/);
    await expect(as(ana, "select public.request_help($1, null, 't', '   ', 'discipler')", [groupId])).rejects.toThrow(/check/);
  });

  it("direto à equipe pastoral: o Admin vê, o discipulador NÃO (o pedido pode ser sobre ele)", async () => {
    [{ id: direct }] = await as<{ id: string }>(ana, "select public.request_help($1, null, 'Sobre o meu discipulador', 'Preciso conversar.', 'pastoral') as id", [groupId]);
    expect((await as(admin, "select 1 from public.help_requests")).length).toBe(1);
    expect((await as(disc, "select id from public.help_requests")).map((r) => (r as { id: string }).id)).toEqual([toDiscipler]);
    // Uma pessoa sem grupo também pode pedir direto.
    await as(cida, "select public.request_help(null, null, 'Aconselhamento', 'Preciso de oração.', 'pastoral')");
    expect((await as(admin, "select 1 from public.help_requests")).length).toBe(2);
  });

  it("o discipulador atende, registra e escala; depois de escalado, só a equipe pastoral mexe", async () => {
    await expect(as(disc2, "select public.handle_help_request($1, 'answered', 'x')", [toDiscipler])).rejects.toThrow(/não autorizado/);
    await expect(as(ana, "select public.handle_help_request($1, 'closed', 'x')", [toDiscipler])).rejects.toThrow(/não autorizado/);
    await expect(as(disc, "select public.handle_help_request($1, 'closed', 'x')", [direct])).rejects.toThrow(/não autorizado/);
    await as(disc, "select public.handle_help_request($1, 'in_progress', 'Vou ligar hoje.')", [toDiscipler]);
    const [r] = await q<{ status: string; assignee_id: string; handled_note: string }>("select status, assignee_id, handled_note from public.help_requests where id = $1", [toDiscipler]);
    expect(r).toEqual({ status: "in_progress", assignee_id: disc, handled_note: "Vou ligar hoje." });

    await expect(as(disc2, "select public.escalate_help_request($1)", [toDiscipler])).rejects.toThrow(/não autorizado/);
    await expect(as(disc, "select public.escalate_help_request($1)", [direct])).rejects.toThrow(/não autorizado/);
    await as(disc, "select public.escalate_help_request($1)", [toDiscipler]);
    await as(disc, "select public.escalate_help_request($1)", [toDiscipler]); // idempotente
    expect((await as(admin, "select 1 from public.help_requests")).length).toBe(3);
    await expect(as(disc, "select public.handle_help_request($1, 'closed', 'x')", [toDiscipler])).rejects.toThrow(/não autorizado/);
    await as(admin, "select public.handle_help_request($1, 'answered', 'Conversei com ela.')", [toDiscipler]);
    expect((await q<{ status: string }>("select status from public.help_requests where id = $1", [toDiscipler]))[0].status).toBe("answered");
    expect((await q("select 1 from public.audit_log where action in ('help_request_updated', 'help_request_escalated')")).length).toBe(3);
  });

  it("ninguém grava pedido direto na tabela", async () => {
    await expect(as(ana, "insert into public.help_requests (user_id, message, destination) values ($1, 'x', 'pastoral')", [ana])).rejects.toThrow(/permission denied/);
    await expect(as(admin, "update public.help_requests set status = 'closed'")).rejects.toThrow(/permission denied/);
  });
});

describe("administração", () => {
  it("o Admin transfere o grupo, mas só para um discipulador", async () => {
    await expect(as(disc, "select public.admin_transfer_group($1, $2)", [groupId, disc2])).rejects.toThrow(/não autorizado/);
    await expect(as(admin, "select public.admin_transfer_group($1, $2)", [groupId, ana])).rejects.toThrow(/marcada como discipulador/);
    await as(admin, "select public.admin_transfer_group($1, $2)", [groupId, disc2]);
    expect((await as(disc2, "select 1 from public.group_members")).length).toBeGreaterThan(0);
    expect(await as(disc, "select 1 from public.discipleship_groups")).toEqual([]);
    await as(admin, "select public.admin_transfer_group($1, $2)", [groupId, disc]);
  });

  it("encerrar o grupo: só o discipulador e o Admin; grupo encerrado não aceita convites", async () => {
    await expect(as(ana, "select public.set_group_status($1, 'archived')", [groupId])).rejects.toThrow(/não autorizado/);
    await expect(as(disc, "select public.set_group_status($1, 'sumido')", [groupId])).rejects.toThrow(/inválida/);
    await as(disc, "select public.set_group_status($1, 'completed')", [groupId]);
    await expect(as(cida, "select public.join_group($1, 'v1')", [code])).rejects.toThrow(/encerrado/);
    await as(disc, "select public.set_group_status($1, 'active')", [groupId]);
  });

  it("excluir a conta do discipulador deixa o grupo sem discipulador (o Admin reatribui); a de um discípulo apaga os dados dele", async () => {
    await as(beto, "select public.delete_my_account()");
    expect(await q("select 1 from public.group_members where user_id = $1", [beto])).toEqual([]);
    expect(await q("select 1 from public.group_progress where user_id = $1", [beto])).toEqual([]);
    await as(disc, "select public.delete_my_account()");
    expect((await q<{ discipler_id: string | null }>("select discipler_id from public.discipleship_groups"))[0].discipler_id).toBeNull();
    expect((await as(admin, "select 1 from public.discipleship_groups")).length).toBe(1);
    await as(admin, "select public.admin_transfer_group($1, $2)", [groupId, disc2]);
  });

  it("desligar o recurso esconde tudo de novo", async () => {
    await setFlag(false);
    expect(await as(ana, "select 1 from public.discipleship_groups")).toEqual([]);
    expect(await as(disc2, "select 1 from public.discipleship_groups")).toEqual([]);
    expect(await as(ana, "select 1 from public.lessons where kind = 'library'")).toEqual([]);
    await expect(as(disc2, "select public.create_group('G', $1, current_date, null, null, null)", [trackId])).rejects.toThrow(/Só um discipulador/);
  });
});

describe("nomes de quem está no grupo (sem o resto do perfil)", () => {
  it("o discipulador e o Admin leem a lista; discípulos e outros discipuladores, não", async () => {
    await setFlag(true);
    expect((await as<{ display_name: string }>(disc2, "select display_name from public.group_roster($1)", [groupId])).map((r) => r.display_name).sort()).toEqual(["Ana"]);
    expect((await as(admin, "select 1 from public.group_roster($1)", [groupId])).length).toBe(1);
    await expect(as(ana, "select * from public.group_roster($1)", [groupId])).rejects.toThrow(/não autorizado/);
    await expect(as(disc, "select * from public.group_roster($1)", [groupId])).rejects.toThrow(/não autorizado/); // a conta dele foi excluída acima: não conduz mais o grupo
    const [row] = await as<Record<string, unknown>>(disc2, "select * from public.group_roster($1)", [groupId]);
    expect(Object.keys(row).sort()).toEqual(["display_name", "joined_at", "status", "user_id"]);
  });

  it("os nomes dos pedidos de ajuda só saem para quem pode ler o pedido", async () => {
    const [{ id: req }] = await as<{ id: string }>(ana, "select public.request_help($1, null, 'x', 'Preciso de ajuda.', 'discipler') as id", [groupId]);
    expect((await as<{ display_name: string }>(disc2, "select display_name from public.help_request_names($1)", [[req]]))[0].display_name).toBe("Ana");
    expect(await as(admin, "select 1 from public.help_request_names($1)", [[req]])).toEqual([]); // ainda não foi escalado
    expect(await as(beto, "select 1 from public.help_request_names($1)", [[req]])).toEqual([]);
  });
});

describe("prévia do convite", () => {
  it("mostra grupo, discipulador e trilha para um código válido; nada para outro", async () => {
    await setFlag(true);
    const [g] = await q<{ invite_code: string }>("select invite_code from public.discipleship_groups");
    const rows = await as<{ group_name: string; discipler_name: string; track_title: string }>(cida, "select * from public.group_invite_preview($1)", [g.invite_code.toLowerCase()]);
    expect(rows).toEqual([{ group_name: "Grupo da Manhã", discipler_name: "Outro Discipulador", track_title: "Trilha de teste" }]);
    expect(await as(cida, "select * from public.group_invite_preview('G-00000000')")).toEqual([]);
    await db.exec("set role anon");
    try {
      await expect(q("select * from public.group_invite_preview($1)", [g.invite_code])).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});
