import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createChurch, createDb, createUser } from "./harness";

/**
 * Evolução por pessoa (migração 0030): Ciclos e Trilhas de Grupo lado a lado (nunca somados), frequência
 * (média móvel de 4 semanas), último login ao lado da última leitura — em admin_member_overview (Pessoas),
 * group_roster (painel do discipulador), caregiver_members/caregiver_member_card (Meus membros) e
 * person_group_progress (ficha, seção "Grupo(s) de Discipulado"). Também prova a correção de isolamento por
 * igreja em admin_member_overview (antes desta migração, a função não filtrava por church_id).
 */
let db: PGlite;
let churchA: string;
let churchB: string;
let admin: string;
let caregiver: string;
let discipler: string;
let memberRich: string; // ciclo, trilha e login preenchidos
let memberEmpty: string; // ninguém atribuiu nada a ela: tudo em zero
let adminB: string;
let memberB: string;
let groupId: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
const as = <T>(user: string, sql: string, params: unknown[] = []) => asUser(db, user, () => q<T>(sql, params));
const setFlag = (church: string, key: string, on: boolean) =>
  q(
    `insert into public.app_settings (church_id, key, value) values ($2, $3, $1::jsonb)
     on conflict (church_id, key) do update set value = excluded.value`,
    [JSON.stringify(on), church, key],
  );
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

interface EvoRow {
  member_id: string;
  cycles_completed: number;
  cycles_total: number;
  cycle_freq_4w: string;
  groups_in_progress: number;
  groups_completed: number;
  group_lessons_completed: number;
  group_lessons_started: number;
  group_freq_4w: string;
  last_login_at: string | null;
}

async function libraryLesson(church: string, slug: string, position: number) {
  const [l] = await q<{ id: string }>(
    `insert into public.lessons (church_id, kind, cycle_id, slug, title, objective, position, status)
     values ($1, 'library', null, $2, $3, 'Objetivo', $4, 'published') returning id`,
    [church, slug, `Lição ${slug}`, position],
  );
  const [v] = await q<{ id: string }>(
    "insert into public.lesson_versions (church_id, lesson_id, content) values ($1, $2, '{\"blocks\":[],\"practice\":null,\"reflection\":null}') returning id",
    [church, l.id],
  );
  await q("update public.lessons set current_version_id = $2 where id = $1", [l.id, v.id]);
  return l.id;
}

beforeAll(async () => {
  db = await createDb();
  churchA = await createChurch(db, { slug: "igreja-a-evolucao", name: "Igreja A" });
  churchB = await createChurch(db, { slug: "igreja-b-evolucao", name: "Igreja B" });

  admin = await createUser(db, "pastor@evolucao.com", { name: "Pastor", churchId: churchA, role: "admin" });
  caregiver = await createUser(db, "cuidadora@evolucao.com", { name: "Cuidadora", churchId: churchA, role: "caregiver" });
  discipler = await createUser(db, "discipulador@evolucao.com", { name: "Discipulador", churchId: churchA });
  memberRich = await createUser(db, "rica@evolucao.com", { name: "Rica", churchId: churchA });
  memberEmpty = await createUser(db, "vazia@evolucao.com", { name: "Vazia", churchId: churchA });
  adminB = await createUser(db, "pastor-b@evolucao.com", { name: "Pastor B", churchId: churchB, role: "admin" });
  memberB = await createUser(db, "membro-b@evolucao.com", { name: "Membro B", churchId: churchB });
  await q("update public.profiles set onboarded_at = now() where church_id in ($1, $2)", [churchA, churchB]);
  await setFlag(churchA, "feature.groups", true);
  await setFlag(churchA, "feature.caregivers", true);
  await as(admin, "select public.admin_set_discipler($1, true)", [discipler]);

  // Ciclo com 1 lição obrigatória: Rica conclui; a linha em cycle_progress fica "completed" (feito à mão: quem
  // grava isso hoje é lesson-flow.ts, não testado aqui).
  const [cycle] = await q<{ id: string }>(
    "insert into public.cycles (church_id, slug, title, position) values ($1, 'c1', 'Ciclo 1', 1) returning id",
    [churchA],
  );
  const [lesson] = await q<{ id: string }>(
    "insert into public.lessons (church_id, cycle_id, slug, title, position, status, required) values ($1, $2, 'c1-l01', 'Lição 1', 1, 'published', true) returning id",
    [churchA, cycle.id],
  );
  await q(
    `insert into public.lesson_progress (church_id, user_id, lesson_id, status, released_at, started_at, completed_at, updated_at)
     values ($1, $2, $3, 'completed', $4, $4, $4, $4)`,
    [churchA, memberRich, lesson.id, daysAgo(3)],
  );
  await q("insert into public.cycle_progress (church_id, user_id, cycle_id, status, completed_at) values ($1, $2, $3, 'completed', now())", [
    churchA,
    memberRich,
    cycle.id,
  ]);

  // Trilha de grupo com 3 dias; Rica lê 2 de 3 (trilha em andamento); Vazia entra e não lê nada.
  const lessons = [await libraryLesson(churchA, "lib-1", 1), await libraryLesson(churchA, "lib-2", 2), await libraryLesson(churchA, "lib-3", 3)];
  const [track] = await q<{ id: string }>("insert into public.tracks (church_id, title, status) values ($1, 'Trilha de teste', 'published') returning id", [churchA]);
  for (const [i, l] of lessons.entries()) await q("insert into public.track_days (church_id, track_id, day_number, lesson_id) values ($1, $2, $3, $4)", [churchA, track.id, i + 1, l]);
  const [group] = await as<{ create_group: string }>(discipler, "select public.create_group('Grupo 1', $1, current_date, null, null, null) as create_group", [track.id]);
  groupId = group.create_group;
  await as(memberRich, "select public.join_group($1, 'v1')", [(await q<{ invite_code: string }>("select invite_code from public.discipleship_groups where id = $1", [groupId]))[0].invite_code]);
  await as(memberEmpty, "select public.join_group($1, 'v1')", [(await q<{ invite_code: string }>("select invite_code from public.discipleship_groups where id = $1", [groupId]))[0].invite_code]);
  for (let i = 0; i < 2; i++) {
    await q(
      "insert into public.group_progress (church_id, user_id, group_id, lesson_id, started_at, completed_at) values ($1, $2, $3, $4, $5, $5)",
      [churchA, memberRich, groupId, lessons[i], daysAgo(2)],
    );
  }

  // Cuidadora cuida de Rica; login de Rica registrado há 1 dia.
  await as(admin, "select public.assign_caregiver($1, $2)", [memberRich, caregiver]);
  await q("update auth.users set last_sign_in_at = $2 where id = $1", [memberRich, daysAgo(1)]);
});
afterAll(async () => {
  await db.close();
});

describe("admin_member_overview: evolução e isolamento por igreja", () => {
  const overview = (user: string) =>
    as<EvoRow>(user, "select * from public.admin_member_overview(null, null, null, 100, 0)");

  it("só vê gente da própria igreja (a falha de church_id descrita na migração 0026 está fechada aqui)", async () => {
    const asA = await overview(admin);
    const asB = await overview(adminB);
    expect(asA.map((r) => r.member_id)).toContain(memberRich);
    expect(asA.map((r) => r.member_id)).not.toContain(memberB);
    expect(asB.map((r) => r.member_id)).toContain(memberB);
    expect(asB.map((r) => r.member_id)).not.toContain(memberRich);
  });

  it("traz Ciclo e Trilha lado a lado, nunca somados", async () => {
    const rows = await overview(admin);
    const rica = rows.find((r) => r.member_id === memberRich)!;
    expect(rica.cycles_completed).toBe(1);
    expect(rica.cycles_total).toBe(1);
    expect(Number(rica.cycle_freq_4w)).toBeCloseTo(0.3, 1); // 1 lição concluída em 28 dias / 4 semanas, arredondado
    expect(rica.groups_in_progress).toBe(1); // 2 de 3 dias: ainda não concluiu a trilha
    expect(rica.groups_completed).toBe(0);
    expect(rica.group_lessons_completed).toBe(2);
    expect(rica.group_lessons_started).toBe(2);
    expect(Number(rica.group_freq_4w)).toBeCloseTo(0.5, 1); // 2 lições de grupo em 28 dias / 4
  });

  it("último login e última leitura são dados diferentes", async () => {
    const rows = await overview(admin);
    const rica = rows.find((r) => r.member_id === memberRich)!;
    expect(rica.last_login_at).not.toBeNull();
    expect(new Date(rica.last_login_at!).getTime()).toBeGreaterThan(Date.now() - 2 * 86_400_000);
  });

  it("quem não tem nada fica em zero, não nulo, e sem login nunca registrado", async () => {
    const rows = await overview(admin);
    const vazia = rows.find((r) => r.member_id === memberEmpty)!;
    expect(vazia).toMatchObject({
      cycles_completed: 0,
      groups_in_progress: 1, // entrou no grupo, ainda não leu nada
      groups_completed: 0,
      group_lessons_completed: 0,
      group_lessons_started: 0,
      last_login_at: null,
    });
  });
});

describe("group_roster e caregiver_*: a mesma evolução, no recorte de cada papel", () => {
  it("o discipulador vê a evolução de Ciclo de quem está no grupo dele, junto com a do grupo", async () => {
    const rows = await as<EvoRow & { display_name: string }>(discipler, "select * from public.group_roster($1)", [groupId]);
    const rica = rows.find((r) => r.member_id === memberRich || (r as unknown as { user_id: string }).user_id === memberRich);
    expect(rica).toBeDefined();
    expect(rica!.cycles_completed).toBe(1);
    expect(rica!.group_lessons_completed).toBe(2);
  });

  it("a cuidadora vê a mesma evolução na lista e na ficha de quem cuida", async () => {
    const list = await as<EvoRow>(caregiver, "select * from public.caregiver_members()");
    const rica = list.find((r) => r.member_id === memberRich)!;
    expect(rica.cycles_completed).toBe(1);
    expect(rica.group_lessons_completed).toBe(2);

    const [card] = await as<EvoRow>(caregiver, "select * from public.caregiver_member_card($1)", [memberRich]);
    expect(card.cycles_completed).toBe(1);
    expect(card.groups_in_progress).toBe(1);
  });
});

describe("person_group_progress: as trilhas de uma pessoa, segregadas de Ciclos", () => {
  it("Admin, a cuidadora dela e o discipulador do grupo dela podem ver; qualquer outro membro, não", async () => {
    for (const who of [admin, caregiver, discipler]) {
      const rows = await as(who, "select 1 from public.person_group_progress($1)", [memberRich]);
      expect(rows.length).toBeGreaterThan(0);
    }
    await expect(as(memberEmpty, "select * from public.person_group_progress($1)", [memberRich])).rejects.toThrow(/não autorizado/);
  });

  it("traz uma linha por trilha, com os dias concluídos daquela trilha (nunca cruzado com Ciclo)", async () => {
    const [row] = await as<{ track_title: string; total_days: number; completed_days: number; started_days: number }>(
      admin,
      "select track_title, total_days, completed_days, started_days from public.person_group_progress($1)",
      [memberRich],
    );
    expect(row).toMatchObject({ track_title: "Trilha de teste", total_days: 3, completed_days: 2, started_days: 2 });
  });

  it("desligar Grupo de Discipulado esvazia a resposta, sem quebrar", async () => {
    await setFlag(churchA, "feature.groups", false);
    expect(await as(admin, "select 1 from public.person_group_progress($1)", [memberRich])).toEqual([]);
    await setFlag(churchA, "feature.groups", true);
  });
});
