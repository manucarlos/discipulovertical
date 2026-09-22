import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { asUser, createChurch, createDb, createUser } from "./harness";

/**
 * A prova real da Fase 1 (docs/EXPANSAO.md, migração 0026): duas igrejas no MESMO banco nunca se enxergam
 * por consulta direta (o que o app faz com `supabase.from(...)`), nem por leitura nem por escrita — mesmo
 * quando a pessoa tenta forçar o `church_id` de outra igreja à mão. O que este arquivo NÃO cobre (de
 * propósito): as ~80 funções `security definer` de escrita (save_lesson, admin_set_role, submit_feedback,
 * os `cron_*`...), que ainda RODAM COMO DONAS DAS TABELAS e ignoram toda RLS — isso é a Fase 2, função por
 * função, listada em tests/db/multi-tenant-checklist.test.ts.
 */
let db: PGlite;
let churchA: string;
let churchB: string;
let adminA: string;
let memberA: string;
let adminB: string;
let memberB: string;
let superAdmin: string;
let cycleA: string;
let cycleB: string;
let lessonA: string;
let lessonB: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);

beforeAll(async () => {
  db = await createDb();
  churchA = await createChurch(db, { slug: "igreja-a", name: "Igreja A" });
  churchB = await createChurch(db, { slug: "igreja-b", name: "Igreja B" });

  adminA = await createUser(db, "admin-a@example.com", { name: "Admin A", churchId: churchA, role: "admin" });
  memberA = await createUser(db, "membro-a@example.com", { name: "Membro A", churchId: churchA });
  adminB = await createUser(db, "admin-b@example.com", { name: "Admin B", churchId: churchB, role: "admin" });
  memberB = await createUser(db, "membro-b@example.com", { name: "Membro B", churchId: churchB });

  // Super Admin precisa de role = 'admin' TAMBÉM: as políticas permissivas de cada tabela (anteriores à
  // migração 0026) só liberam is_admin() — sem saber nada de church_id, porque não sabiam de outras igrejas.
  // A restritiva nova (church_id = current_church_id() OR is_super_admin()) só ESTREITA o que a permissiva
  // já deixa passar; nunca alarga. Por isso platform_admins sozinho não basta — é preciso as duas coisas.
  superAdmin = await createUser(db, "super@example.com", { name: "Super Admin", churchId: churchA, role: "admin" });
  await q("insert into public.platform_admins (user_id) values ($1)", [superAdmin]);

  cycleA = (await q<{ id: string }>("insert into public.cycles (church_id, slug, title, position) values ($1, 'c1', 'Ciclo A', 1) returning id", [churchA]))[0].id;
  cycleB = (await q<{ id: string }>("insert into public.cycles (church_id, slug, title, position) values ($1, 'c1', 'Ciclo B', 1) returning id", [churchB]))[0].id;
  // O slug "c1" repetido nas duas confirma, de quebra, que a unicidade agora é por igreja (church_id, slug).

  lessonA = (
    await q<{ id: string }>(
      "insert into public.lessons (church_id, cycle_id, slug, title, position, status) values ($1, $2, 'c1-l01', 'Lição A', 1, 'published') returning id",
      [churchA, cycleA],
    )
  )[0].id;
  lessonB = (
    await q<{ id: string }>(
      "insert into public.lessons (church_id, cycle_id, slug, title, position, status) values ($1, $2, 'c1-l01', 'Lição B', 1, 'published') returning id",
      [churchB, cycleB],
    )
  )[0].id;

  await q("insert into public.consents (church_id, user_id, purpose, term_version) values ($1, $2, 'data_processing', 'v1')", [churchA, memberA]);
  await q("insert into public.consents (church_id, user_id, purpose, term_version) values ($1, $2, 'data_processing', 'v1')", [churchB, memberB]);
});
afterAll(async () => {
  await db.close();
});

describe("perfis: cada Admin só vê a própria igreja", () => {
  it("Admin A não vê ninguém da igreja B, nem por e-mail nem por id", async () => {
    const rows = await asUser(db, adminA, () => q<{ id: string }>("select id from public.profiles"));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(adminA);
    expect(ids).toContain(memberA);
    expect(ids).not.toContain(adminB);
    expect(ids).not.toContain(memberB);
  });

  it("um membro só vê o próprio perfil, mesmo sendo da mesma igreja de outros", async () => {
    expect(await asUser(db, memberA, () => q<{ id: string }>("select id from public.profiles"))).toEqual([{ id: memberA }]);
  });

  it("Admin A não consegue ler o perfil de alguém da igreja B mesmo sabendo o id (busca direta)", async () => {
    expect(await asUser(db, adminA, () => q("select 1 from public.profiles where id = $1", [memberB]))).toEqual([]);
  });
});

describe("conteúdo: ciclos e lições de uma igreja são invisíveis para a outra", () => {
  it("cada Admin só lê os próprios ciclos e lições, mesmo publicados", async () => {
    expect((await asUser(db, adminA, () => q("select 1 from public.cycles"))).length).toBe(1);
    expect((await asUser(db, adminA, () => q("select 1 from public.lessons"))).length).toBe(1);
    expect((await asUser(db, adminB, () => q("select 1 from public.cycles"))).length).toBe(1);
    expect((await asUser(db, adminB, () => q("select 1 from public.lessons"))).length).toBe(1);
  });

  it("um membro nunca vê a lição da outra igreja, mesmo sabendo o id (busca direta)", async () => {
    expect(await asUser(db, memberA, () => q("select 1 from public.lessons where id = $1", [lessonB]))).toEqual([]);
    expect(await asUser(db, memberB, () => q("select 1 from public.lessons where id = $1", [lessonA]))).toEqual([]);
  });

  it("o mesmo slug existe nas duas igrejas sem conflito (unicidade agora é por igreja)", async () => {
    const rows = await q<{ church_id: string; slug: string }>("select church_id, slug from public.cycles order by church_id");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.slug === "c1")).toBe(true);
  });
});

describe("consentimentos e progresso: sem vazamento entre igrejas", () => {
  it("Admin de uma igreja não lê consentimentos da outra, mesmo sem RLS de dono (é Admin, não é o titular)", async () => {
    expect(await asUser(db, adminB, () => q("select 1 from public.consents where user_id = $1", [memberA]))).toEqual([]);
  });

  it("membro grava e lê o próprio progresso; o mesmo id de lição em outra igreja não colide", async () => {
    await asUser(db, memberA, () => q("insert into public.lesson_progress (user_id, lesson_id, status) values ($1, $2, 'in_progress')", [memberA, lessonA]));
    await asUser(db, memberB, () => q("insert into public.lesson_progress (user_id, lesson_id, status) values ($1, $2, 'in_progress')", [memberB, lessonB]));
    expect((await asUser(db, memberA, () => q("select 1 from public.lesson_progress"))).length).toBe(1);
    expect((await asUser(db, memberB, () => q("select 1 from public.lesson_progress"))).length).toBe(1);
  });
});

describe("escrever com o church_id de outra igreja é recusado, mesmo à força", () => {
  it("o Admin da igreja A não consegue criar um ciclo já apontando para a igreja B", async () => {
    await expect(
      asUser(db, adminA, () => q("insert into public.cycles (church_id, slug, title, position) values ($1, 'invasor', 'x', 9)", [churchB])),
    ).rejects.toThrow(/row-level security/);
  });

  it("nem \"sequestrar\" uma lição já existente da igreja B, mudando o church_id dela para a A", async () => {
    // adminA nem enxerga a linha da igreja B: o UPDATE não dá erro, só não acha nada para mudar.
    const rows = await asUser(db, adminA, () => q("update public.lessons set church_id = $1 where id = $2 returning 1", [churchA, lessonB]));
    expect(rows).toEqual([]);
    expect((await q<{ church_id: string }>("select church_id from public.lessons where id = $1", [lessonB]))[0].church_id).toBe(churchB);
  });
});

describe("convite: entrar por um código só leva à igreja daquele código", () => {
  it("quem ainda não tem igreja entra na A pelo convite dela, e nunca enxerga a B", async () => {
    const [{ invite_code: codeA }] = await q<{ invite_code: string }>("select invite_code from public.churches where id = $1", [churchA]);
    const newcomer = await createUser(db, "novo@example.com", { churchId: null }); // nasce sem igreja, de propósito
    await asUser(db, newcomer, () => q("select public.claim_church($1)", [codeA]));
    expect((await q<{ church_id: string }>("select church_id from public.profiles where id = $1", [newcomer]))[0].church_id).toBe(churchA);
    expect(await asUser(db, newcomer, () => q("select 1 from public.lessons where id = $1", [lessonB]))).toEqual([]);
  });
});

describe("Super Admin: acima das igrejas, lê e escreve nas duas", () => {
  it("lê perfis, ciclos e lições das duas igrejas", async () => {
    const profiles = await asUser(db, superAdmin, () => q<{ id: string }>("select id from public.profiles"));
    expect(profiles.map((p) => p.id)).toEqual(expect.arrayContaining([adminA, memberA, adminB, memberB]));
    expect((await asUser(db, superAdmin, () => q("select 1 from public.cycles"))).length).toBe(2);
    expect((await asUser(db, superAdmin, () => q("select 1 from public.lessons"))).length).toBe(2);
  });

  it("escreve na igreja B mesmo sem pertencer a ela", async () => {
    const rows = await asUser(db, superAdmin, () =>
      q<{ id: string }>("insert into public.cycles (church_id, slug, title, position) values ($1, 'c2', 'Ciclo Novo B', 2) returning id", [churchB]),
    );
    expect(rows).toHaveLength(1);
    expect((await asUser(db, adminB, () => q("select 1 from public.cycles where slug = 'c2'"))).length).toBe(1);
  });
});
