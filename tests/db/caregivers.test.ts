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
let carla: string; // cuidadora
let caio: string; // cuidador
let ana: string; // membro, cuidada pela Carla
let beto: string; // membro, sem cuidador (parado)
let cida: string; // membro, com o Caio
let lessonIds: string[] = [];

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const setFlag = (key: string, on: boolean) =>
  asUser(db, admin, () => q("update public.app_settings set value = $2::jsonb where key = $1", [key, JSON.stringify(on)]));
const as = <T>(user: string, sql: string, params: unknown[] = []) => asUser(db, user, () => q<T>(sql, params));

async function person(email: string, joinedDaysAgo: number) {
  const id = await createUser(db, email, { name: email.split("@")[0] });
  await q("update public.profiles set created_at = $2, onboarded_at = $2 where id = $1", [id, daysAgo(joinedDaysAgo)]);
  return id;
}
async function activity(userId: string, i: number, agoDays: number) {
  await q(
    `insert into public.lesson_progress (user_id, lesson_id, status, released_at, started_at, updated_at)
     values ($1, $2, 'in_progress', $3, $3, $3)`,
    [userId, lessonIds[i], daysAgo(agoDays)],
  );
}

beforeAll(async () => {
  db = await createDb();
  await db.exec(buildImportSql(cycles.filter((c) => c.number === 1), { publish: true }));
  lessonIds = (await q<{ id: string }>("select id from public.lessons order by position")).map((r) => r.id);

  await q("insert into public.app_config (key, value) values ('initial_admin_email', 'pastor@example.com')");
  admin = await createUser(db, "pastor@example.com");
  editor = await createUser(db, "editora@example.com");
  carla = await createUser(db, "carla@example.com", { name: "Carla" });
  caio = await createUser(db, "caio@example.com", { name: "Caio" });
  await q("update public.profiles set onboarded_at = now() where id in ($1, $2, $3, $4)", [admin, editor, carla, caio]);
  await asUser(db, admin, () => q("select public.admin_set_role($1, 'editor')", [editor]));
  await asUser(db, admin, () => q("select public.admin_set_role($1, 'caregiver')", [carla]));
  await asUser(db, admin, () => q("select public.admin_set_role($1, 'caregiver')", [caio]));

  ana = await person("ana@example.com", 40);
  await activity(ana, 0, 20); // parada há 20 dias
  beto = await person("beto@example.com", 30); // nunca começou, parado desde o cadastro
  cida = await person("cida@example.com", 5);
  await activity(cida, 0, 1); // em dia
});
afterAll(async () => {
  await db.close();
});

describe("recurso desligado (padrão)", () => {
  it("o cuidador não enxerga ninguém, mesmo atribuído", async () => {
    await as(admin, "select public.assign_caregiver($1, $2)", [ana, carla]);
    await expect(as(carla, "select * from public.caregiver_members()")).rejects.toThrow(/não autorizado/);
    await expect(as(carla, "select * from public.caregiver_member_card($1)", [ana])).rejects.toThrow(/não autorizado/);
    expect(await as(carla, "select 1 from public.lesson_progress where user_id = $1", [ana])).toEqual([]);
  });
});

describe("atribuição (RN-13)", () => {
  beforeAll(async () => {
    await setFlag("feature.caregivers", true);
  });

  it("só o Admin atribui, tira e distribui", async () => {
    for (const who of [carla, editor, ana]) {
      await expect(as(who, "select public.assign_caregiver($1, $2)", [beto, carla])).rejects.toThrow(/não autorizado/);
      await expect(as(who, "select public.unassign_caregiver($1)", [beto])).rejects.toThrow(/não autorizado/);
      await expect(as(who, "select public.auto_assign_caregivers()")).rejects.toThrow(/não autorizado/);
      await expect(as(who, "select * from public.admin_care_queue()")).rejects.toThrow(/não autorizado/);
    }
  });

  it("não se atribui a quem não é cuidador, nem a equipe, nem a si mesmo", async () => {
    await expect(as(admin, "select public.assign_caregiver($1, $2)", [beto, cida])).rejects.toThrow(/perfil de cuidador/);
    await expect(as(admin, "select public.assign_caregiver($1, $2)", [editor, carla])).rejects.toThrow(/não recebem cuidador/);
    await expect(as(admin, "select public.assign_caregiver($1, $2)", [carla, carla])).rejects.toThrow(/si mesmo/);
  });

  it("um membro tem só um cuidador ativo: reatribuir troca, e a troca fica no registro", async () => {
    await as(admin, "select public.assign_caregiver($1, $2)", [ana, caio]);
    const active = await q<{ caregiver_id: string }>("select caregiver_id from public.care_assignments where member_id = $1 and active", [ana]);
    expect(active).toEqual([{ caregiver_id: caio }]);
    expect((await q("select 1 from public.care_assignments where member_id = $1", [ana])).length).toBe(2); // o histórico fica
    await as(admin, "select public.assign_caregiver($1, $2)", [ana, carla]);
    expect((await q("select 1 from public.audit_log where action = 'care_assigned'")).length).toBeGreaterThanOrEqual(3);
  });

  it("a fila do Admin lista os membros sem cuidador; o rodízio distribui por igual", async () => {
    const queue = await as<{ member_id: string }>(admin, "select member_id from public.admin_care_queue()");
    expect(queue.map((r) => r.member_id).sort()).toEqual([beto, cida].sort());

    expect((await as<{ n: number }>(admin, "select public.auto_assign_caregivers() as n"))[0].n).toBe(2);
    expect(await as(admin, "select 1 from public.admin_care_queue()")).toEqual([]);
    // Carla já tinha a Ana; o Caio (0) recebe o primeiro, e o segundo vai para quem tiver menos.
    const counts = await q<{ caregiver_id: string; n: number }>(
      "select caregiver_id, count(*)::int as n from public.care_assignments where active group by 1 order by 1",
    );
    expect(Math.abs(counts[0].n - counts[1].n)).toBeLessThanOrEqual(1);
    // Rodar de novo não muda nada.
    expect((await as<{ n: number }>(admin, "select public.auto_assign_caregivers() as n"))[0].n).toBe(0);
  });

  it("cada um vê só as próprias atribuições; o membro não vê nenhuma", async () => {
    const mine = await as<{ caregiver_id: string }>(carla, "select caregiver_id from public.care_assignments");
    expect(mine.every((r) => r.caregiver_id === carla)).toBe(true);
    expect(await as(ana, "select 1 from public.care_assignments")).toEqual([]);
    expect((await as(admin, "select 1 from public.care_assignments")).length).toBeGreaterThanOrEqual(4);
  });

  it("ninguém grava atribuição direto na tabela", async () => {
    await expect(as(carla, "insert into public.care_assignments (member_id, caregiver_id) values ($1, $2)", [beto, carla])).rejects.toThrow(/permission denied/);
    await expect(as(admin, "update public.care_assignments set active = false")).rejects.toThrow(/permission denied/);
  });

  it("perder o perfil de cuidador devolve os membros para a fila", async () => {
    await as(admin, "select public.assign_caregiver($1, $2)", [ana, carla]);
    await as(admin, "select public.admin_set_role($1, 'member')", [carla]);
    expect(await q("select 1 from public.care_assignments where caregiver_id = $1 and active", [carla])).toEqual([]);
    expect((await as(admin, "select member_id from public.admin_care_queue()")).length).toBeGreaterThanOrEqual(1);
    await as(admin, "select public.admin_set_role($1, 'caregiver')", [carla]);
    await as(admin, "select public.assign_caregiver($1, $2)", [ana, carla]);
    await as(admin, "select public.assign_caregiver($1, $2)", [beto, caio]);
    await as(admin, "select public.assign_caregiver($1, $2)", [cida, caio]);
  });
});

describe("o que o cuidador vê dos atribuídos", () => {
  it("a lista traz só os dele, com a situação", async () => {
    const rows = await as<{ member_id: string; status: string }>(carla, "select member_id, status from public.caregiver_members()");
    expect(rows).toEqual([{ member_id: ana, status: "stalled" }]);
    const caios = await as<{ member_id: string }>(caio, "select member_id from public.caregiver_members()");
    expect(caios.map((r) => r.member_id).sort()).toEqual([beto, cida].sort());
  });

  it("a ficha de contato só abre para quem cuida daquele membro", async () => {
    const [card] = await as<{ display_name: string; email: string }>(carla, "select display_name, email from public.caregiver_member_card($1)", [ana]);
    expect(card).toMatchObject({ display_name: "ana", email: "ana@example.com" });
    await expect(as(carla, "select * from public.caregiver_member_card($1)", [beto])).rejects.toThrow(/não autorizado/);
    await expect(as(editor, "select * from public.caregiver_member_card($1)", [ana])).rejects.toThrow(/não autorizado/);
    await expect(as(cida, "select * from public.caregiver_member_card($1)", [ana])).rejects.toThrow(/não autorizado/);
  });

  it("lê o progresso dos atribuídos e de mais ninguém; o perfil dos outros continua fechado", async () => {
    expect((await as(carla, "select 1 from public.lesson_progress where user_id = $1", [ana])).length).toBe(1);
    expect(await as(carla, "select 1 from public.lesson_progress where user_id = $1", [cida])).toEqual([]);
    expect(await as(carla, "select 1 from public.profiles where id = $1", [ana])).toEqual([]); // o contato vem só pela função
  });

  it("a consulta à ficha fica registrada, com o cuidador como autor", async () => {
    await as(carla, "select public.audit_person_view($1)", [ana]);
    expect((await q("select 1 from public.audit_log where action = 'person_viewed' and actor_id = $1 and entity_id = $2", [carla, ana])).length).toBe(1);
    await expect(as(carla, "select public.audit_person_view($1)", [beto])).rejects.toThrow(/não autorizado/);
  });
});

describe("notas de cuidado", () => {
  it("o cuidador escreve sobre quem cuida; ler é só do autor e do Admin", async () => {
    await as(carla, "insert into public.care_notes (member_id, author_id, body) values ($1, $2, 'Liguei; está viajando.')", [ana, carla]);
    expect((await as(carla, "select body from public.care_notes")).length).toBe(1);
    expect((await as(admin, "select body from public.care_notes")).length).toBe(1);
    expect(await as(caio, "select body from public.care_notes")).toEqual([]);
    expect(await as(editor, "select body from public.care_notes")).toEqual([]);
    expect(await as(ana, "select body from public.care_notes")).toEqual([]); // nem o próprio membro
  });

  it("não escreve sobre quem não é dele, nem em nome de outro, nem texto vazio", async () => {
    await expect(as(carla, "insert into public.care_notes (member_id, author_id, body) values ($1, $2, 'oi')", [beto, carla])).rejects.toThrow(/row-level security/);
    await expect(as(caio, "insert into public.care_notes (member_id, author_id, body) values ($1, $2, 'oi')", [beto, carla])).rejects.toThrow(/row-level security/);
    await expect(as(carla, "insert into public.care_notes (member_id, author_id, body) values ($1, $2, '  ')", [ana, carla])).rejects.toThrow(/check/);
  });

  it("não dá para editar, e só o autor apaga", async () => {
    await expect(as(carla, "update public.care_notes set body = 'x'")).rejects.toThrow(/permission denied/);
    expect(await as(caio, "delete from public.care_notes returning 1")).toEqual([]);
    expect(await as(admin, "delete from public.care_notes returning 1")).toEqual([]);
    expect((await as(carla, "delete from public.care_notes returning 1")).length).toBe(1);
  });

  it("com o recurso desligado ninguém escreve nota", async () => {
    await setFlag("feature.caregivers", false);
    await expect(as(carla, "insert into public.care_notes (member_id, author_id, body) values ($1, $2, 'oi')", [ana, carla])).rejects.toThrow(/row-level security/);
    await setFlag("feature.caregivers", true);
  });
});

describe("alertas de quem parou (RN-07, RF-25)", () => {
  it("só Admin e cuidador rodam a verificação; membro e editor não", async () => {
    await expect(as(ana, "select public.sync_stalled_alerts()")).rejects.toThrow(/não autorizado/);
    await expect(as(editor, "select public.sync_stalled_alerts()")).rejects.toThrow(/não autorizado/);
  });

  it("abre um alerta para cada pessoa parada, e só para elas; rodar de novo não duplica", async () => {
    expect((await as<{ n: number }>(admin, "select public.sync_stalled_alerts() as n"))[0].n).toBe(2); // Ana e Beto
    expect((await as<{ n: number }>(admin, "select public.sync_stalled_alerts() as n"))[0].n).toBe(0);
    const alerts = await q<{ member_id: string; status: string }>("select member_id, status from public.care_alerts order by member_id");
    expect(alerts.map((a) => a.member_id).sort()).toEqual([ana, beto].sort());
    expect(alerts.every((a) => a.status === "open")).toBe(true);
  });

  it("o cuidador vê só os alertas dos seus; o Admin vê todos; membro e editor, nenhum", async () => {
    expect((await as<{ member_id: string }>(carla, "select member_id from public.care_alerts")).map((r) => r.member_id)).toEqual([ana]);
    expect((await as<{ member_id: string }>(caio, "select member_id from public.care_alerts")).map((r) => r.member_id)).toEqual([beto]);
    expect((await as(admin, "select 1 from public.care_alerts")).length).toBe(2);
    expect(await as(editor, "select 1 from public.care_alerts")).toEqual([]);
    expect(await as(ana, "select 1 from public.care_alerts")).toEqual([]);
  });

  it("a lista do cuidador mostra o alerta em aberto de cada membro, com os parados primeiro", async () => {
    const rows = await as<{ member_id: string; alert_status: string | null }>(caio, "select member_id, alert_status from public.caregiver_members()");
    expect(rows[0]).toEqual({ member_id: beto, alert_status: "open" });
    expect(rows[1]).toEqual({ member_id: cida, alert_status: null });
  });

  it("o cuidador marca 'em contato' e depois 'resolvido' (com nota); o de outro cuidador não mexe", async () => {
    const [alert] = await q<{ id: string }>("select id from public.care_alerts where member_id = $1", [ana]);
    await expect(as(caio, "select public.set_alert_status($1, 'in_contact')", [alert.id])).rejects.toThrow(/não autorizado/);
    await expect(as(editor, "select public.set_alert_status($1, 'in_contact')", [alert.id])).rejects.toThrow(/não autorizado/);
    await expect(as(carla, "select public.set_alert_status($1, 'fechado')", [alert.id])).rejects.toThrow(/inválida/);

    await as(carla, "select public.set_alert_status($1, 'in_contact')", [alert.id]);
    expect((await q<{ status: string; updated_by: string }>("select status, updated_by from public.care_alerts where id = $1", [alert.id]))[0]).toEqual({ status: "in_contact", updated_by: carla });
    await as(carla, "select public.set_alert_status($1, 'resolved', 'Conversamos, voltou ao ritmo.')", [alert.id]);
    const [done] = await q<{ status: string; resolution: string; resolved_at: string | null }>("select status, resolution, resolved_at from public.care_alerts where id = $1", [alert.id]);
    expect(done).toMatchObject({ status: "resolved", resolution: "Conversamos, voltou ao ritmo." });
    expect(done.resolved_at).not.toBeNull();
    await expect(as(carla, "select public.set_alert_status($1, 'open')", [alert.id])).rejects.toThrow(/já foi resolvido/);
    expect((await q("select 1 from public.audit_log where action = 'care_alert_updated'")).length).toBe(2);
  });

  it("depois de resolvido por uma pessoa, não abre outro alerta por 14 dias; passado esse tempo, abre", async () => {
    expect((await as<{ n: number }>(admin, "select public.sync_stalled_alerts() as n"))[0].n).toBe(0);
    await q("update public.care_alerts set resolved_at = now() - interval '15 days' where member_id = $1", [ana]);
    expect((await as<{ n: number }>(admin, "select public.sync_stalled_alerts() as n"))[0].n).toBe(1);
  });

  it("quem voltou a ler tem o alerta fechado sozinho", async () => {
    await q("update public.lesson_progress set updated_at = now() where user_id = $1", [beto]); // sem linha: Beto nunca começou
    await activity(beto, 0, 0);
    expect((await as<{ n: number }>(admin, "select public.sync_stalled_alerts() as n"))[0].n).toBe(0);
    const [alert] = await q<{ status: string; resolution: string }>("select status, resolution from public.care_alerts where member_id = $1", [beto]);
    expect(alert).toEqual({ status: "resolved", resolution: "Voltou a ler a trilha." });
  });

  it("um membro sem cuidador também tem alerta, e só o Admin cuida dele", async () => {
    const dora = await person("dora@example.com", 30);
    await as(admin, "select public.sync_stalled_alerts()");
    const [alert] = await q<{ id: string }>("select id from public.care_alerts where member_id = $1 and status <> 'resolved'", [dora]);
    await expect(as(carla, "select public.set_alert_status($1, 'in_contact')", [alert.id])).rejects.toThrow(/não autorizado/);
    await as(admin, "select public.set_alert_status($1, 'in_contact')", [alert.id]);
  });

  it("ninguém grava alerta direto na tabela", async () => {
    await expect(as(admin, "update public.care_alerts set status = 'resolved'")).rejects.toThrow(/permission denied/);
    await expect(as(carla, "insert into public.care_alerts (member_id) values ($1)", [ana])).rejects.toThrow(/permission denied/);
  });
});

describe("reflexões e o cuidador (RN-03)", () => {
  it("o cuidador lê as reflexões de quem cuida, com registro; as dos outros, não", async () => {
    await setFlag("feature.reflections", true);
    await as(ana, "insert into public.reflections (user_id, lesson_id, body) values ($1, $2, 'Estou passando por um momento difícil.')", [ana, lessonIds[0]]);
    const rows = await as<{ body: string }>(carla, "select body from public.person_reflections($1)", [ana]);
    expect(rows).toEqual([{ body: "Estou passando por um momento difícil." }]);
    expect((await q("select 1 from public.audit_log where action = 'reflections_viewed' and actor_id = $1", [carla])).length).toBe(1);
    await expect(as(caio, "select * from public.person_reflections($1)", [ana])).rejects.toThrow(/não autorizado/);
  });
});

describe("conta excluída", () => {
  it("excluir a conta de um membro apaga atribuições, notas e alertas dele", async () => {
    await as(carla, "insert into public.care_notes (member_id, author_id, body) values ($1, $2, 'nota')", [ana, carla]);
    await as(ana, "select public.delete_my_account()");
    for (const t of ["care_assignments", "care_notes", "care_alerts"]) {
      expect(await q(`select 1 from public.${t} where member_id = $1`, [ana]), t).toEqual([]);
    }
  });
});
