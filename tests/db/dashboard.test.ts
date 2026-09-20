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
let outsider: string;
const lessonIds: string[] = [];

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

interface Dashboard {
  period_days: number;
  members_total: number;
  new_in_period: number;
  start_within_7_days: { eligible: number; started: number };
  situations: Record<string, number>;
  cycles: { slug: string; required_total: number; started_members: number; completed_members: number; avg_days: number | null }[];
  lessons: { slug: string; started: number; completed: number; stalled_here: number }[];
  vision: { lessons: number; members_knowing: number; members_total: number };
}
const dashboard = (user = admin, days = 30) =>
  asUser(db, user, () => q<{ d: Dashboard }>("select public.admin_dashboard($1) as d", [days])).then((r) => r[0].d);

async function member(email: string, joinedDaysAgo: number) {
  const id = await createUser(db, email, { name: email.split("@")[0] });
  await q("update public.profiles set created_at = $2, onboarded_at = $2 where id = $1", [id, daysAgo(joinedDaysAgo)]);
  return id;
}
/** Lição i (0 a 7) concluída `completedAgo` dias atrás, aberta um pouco antes. */
async function done(userId: string, i: number, completedAgo: number, openedAgo = completedAgo + 0.01) {
  await q(
    `insert into public.lesson_progress (user_id, lesson_id, status, released_at, started_at, completed_at, updated_at)
     values ($1, $2, 'completed', $3, $3, $4, $4)`,
    [userId, lessonIds[i], daysAgo(openedAgo), daysAgo(completedAgo)],
  );
}
async function opened(userId: string, i: number, agoDays: number) {
  await q(
    `insert into public.lesson_progress (user_id, lesson_id, status, released_at, started_at, updated_at)
     values ($1, $2, 'in_progress', $3, $3, $3)`,
    [userId, lessonIds[i], daysAgo(agoDays)],
  );
}

beforeAll(async () => {
  db = await createDb();
  await db.exec(buildImportSql(cycles.filter((c) => c.number === 1), { publish: true }));
  for (const r of await q<{ id: string }>("select id from public.lessons order by position")) lessonIds.push(r.id);

  await q("insert into public.app_config (key, value) values ('initial_admin_email', 'pastor@example.com')");
  admin = await createUser(db, "pastor@example.com");
  editor = await createUser(db, "editora@example.com");
  outsider = await createUser(db, "visitante@example.com");
  await q("update public.profiles set onboarded_at = now() where id in ($1, $2)", [admin, editor]);
  await asUser(db, admin, () => q("select public.admin_set_role($1, 'editor')", [editor]));

  // Ana: chegou há 20 dias, concluiu a 1ª lição no dia seguinte e depois a trilha inteira (8 lições em 8 dias).
  const ana = await member("ana@example.com", 20);
  for (let i = 0; i < 8; i++) await done(ana, i, 19 - i, 19 - i + 0.5);
  // Beto: chegou há 28 dias, concluiu a 1ª só no dia 10 (fora dos 7 dias) e parou na 2ª, aberta há 16 dias.
  const beto = await member("beto@example.com", 28);
  await done(beto, 0, 18);
  await opened(beto, 1, 16);
  // Cida: chegou há 20 dias e nunca começou (parada desde o primeiro acesso).
  await member("cida@example.com", 20);
  // Davi: chegou há 3 dias (ainda não teve 7 dias para começar) e já abriu a 1ª.
  const davi = await member("davi@example.com", 3);
  await opened(davi, 0, 1);
  // Eva: chegou há 100 dias, fora do período de 30 dias, e concluiu a 1ª.
  const eva = await member("eva@example.com", 100);
  await done(eva, 0, 99);
});
afterAll(async () => {
  await db.close();
});

describe("admin_dashboard", () => {
  it("só o Admin: editor, membro e visitante são recusados", async () => {
    await expect(dashboard(editor)).rejects.toThrow(/não autorizado/);
    await expect(dashboard(outsider)).rejects.toThrow(/não autorizado/);
    await expect(q("select public.admin_dashboard(30)")).rejects.toThrow(/não autorizado/);
  });

  it("a equipe fica de fora dos números: só membros contam", async () => {
    const d = await dashboard();
    // 5 membros (Ana, Beto, Cida, Davi, Eva) + o visitante que ainda não é onboarded = 6 perfis de membro.
    expect(d.members_total).toBe(6);
    const total = Object.values(d.situations).reduce((a, b) => a + b, 0);
    expect(total).toBe(6);
  });

  it("novos no período respeita a janela pedida", async () => {
    // Ana, Beto, Cida, Davi e o visitante chegaram nos últimos 30 dias; a Eva chegou há 100.
    expect((await dashboard(admin, 30)).new_in_period).toBe(5);
    expect((await dashboard(admin, 10)).new_in_period).toBe(2); // Davi e o visitante
    expect((await dashboard(admin, 365)).new_in_period).toBe(6);
  });

  it("a situação de cada grupo", async () => {
    const d = await dashboard();
    expect(d.situations.completed).toBe(1); // Ana
    expect(d.situations.stalled).toBe(3); // Beto, Cida e Eva
    expect(d.situations.in_progress).toBe(1); // Davi
    expect(d.situations.onboarding_pending).toBe(1); // o visitante
  });

  it("início em 7 dias: só entram na conta quem já teve 7 dias, e conta quem concluiu a 1ª lição a tempo", async () => {
    const d = await dashboard(admin, 30);
    // Elegíveis no período de 30 dias e com pelo menos 7 dias de casa: Ana (20), Beto (28) e Cida (20).
    // Davi (3 dias) ainda não teve 7 dias; Eva (100 dias) está fora do período.
    expect(d.start_within_7_days).toEqual({ eligible: 3, started: 1 }); // só a Ana concluiu em até 7 dias
    expect((await dashboard(admin, 365)).start_within_7_days).toEqual({ eligible: 4, started: 2 }); // com a Eva (concluiu a 1ª no dia seguinte)
  });

  it("por ciclo: quem começou, quem concluiu e o tempo médio", async () => {
    const [c1] = (await dashboard()).cycles;
    expect(c1).toMatchObject({ slug: "c1", required_total: 8, started_members: 4, completed_members: 1 });
    // Ana: da primeira abertura (19,5 dias atrás) à última conclusão (12 dias atrás): 7,5 dias.
    expect(c1.avg_days).toBeCloseTo(7.5, 1);
  });

  it("funil por lição, com quem parou em cada uma", async () => {
    const lessons = (await dashboard()).lessons;
    const bySlug = Object.fromEntries(lessons.map((l) => [l.slug, l]));
    expect(lessons).toHaveLength(8);
    expect(bySlug["c1-l01"]).toMatchObject({ started: 4, completed: 3, stalled_here: 0 }); // Ana, Beto e Eva concluíram; Davi abriu
    expect(bySlug["c1-l02"]).toMatchObject({ started: 2, completed: 1, stalled_here: 1 }); // Beto parou aqui
    expect(bySlug["c1-l08"]).toMatchObject({ started: 1, completed: 1, stalled_here: 0 });
  });

  it("'conhece a visão': quem concluiu todas as lições com a etiqueta", async () => {
    const d = await dashboard();
    expect(d.vision.lessons).toBe(1); // no Ciclo 1 só a lição 8 tem a etiqueta "visão"
    expect(d.vision.members_knowing).toBe(1); // Ana
    expect(d.vision.members_total).toBe(5); // membros que já concluíram o primeiro acesso
  });

  it("o período é limitado a valores razoáveis", async () => {
    expect((await dashboard(admin, 0)).period_days).toBe(1);
    expect((await dashboard(admin, 100000)).period_days).toBe(365);
  });
});

describe("content_metrics", () => {
  it("o Editor vê as métricas de conteúdo, e nada nelas identifica pessoas", async () => {
    const rows = await asUser(db, editor, () => q<{ m: { slug: string }[] }>("select public.content_metrics() as m"));
    const metrics = rows[0].m;
    expect(metrics).toHaveLength(8);
    const json = JSON.stringify(metrics);
    expect(json).not.toMatch(/@|ana|beto|cida|davi|eva/i);
    expect(Object.keys(metrics[0]).sort()).toEqual(
      ["completed", "cycle_position", "cycle_slug", "position", "slug", "stalled_here", "started", "title"],
    );
  });

  it("membro comum e visitante são recusados", async () => {
    await expect(asUser(db, outsider, () => q("select public.content_metrics()"))).rejects.toThrow(/não autorizado/);
    await expect(q("select public.content_metrics()")).rejects.toThrow(/não autorizado/);
  });

  it("lição em rascunho ou arquivada não aparece", async () => {
    await q("update public.lessons set status = 'archived' where slug = 'c1-l08'");
    const rows = await asUser(db, editor, () => q<{ m: { slug: string }[] }>("select public.content_metrics() as m"));
    expect(rows[0].m.map((l) => l.slug)).not.toContain("c1-l08");
  });
});
