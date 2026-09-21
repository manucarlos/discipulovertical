import { describe, expect, it } from "vitest";
import { createResendProvider, providerFromEnv } from "@/lib/email/provider";
import { EMAIL_KINDS, renderEmail, validateTemplate } from "@/lib/email/templates";
import { isAuthorizedCron, safeEqual, siteUrlFromEnv } from "./config";
import { isSendWindow, planReminders, type Snapshot } from "./plan";

const SITE = "https://discipulado.example.org";
// Quarta-feira, 12h em Brasília (15h UTC).
const NOW = new Date("2026-09-16T15:00:00Z");
const daysAgo = (n: number, from = NOW) => new Date(from.getTime() - n * 86_400_000).toISOString();

const templates = EMAIL_KINDS.map((k) => ({ kind: k.kind, subject: `Assunto ${k.kind}`, body: `Corpo ${k.kind}` }));

/** Ciclo 1 com 3 lições; intervalo de 3 dias entre elas. */
function base(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    enabled: true,
    caregivers_enabled: false,
    church: { name: "Vertical Church", contact_email: "" },
    members: [],
    cycles: [{ id: "c1", slug: "c1", title: "Fundamentos", position: 1, release_interval_days: 3, max_lessons_per_week: 2 }],
    lessons: [
      { id: "l1", cycle_id: "c1", slug: "c1-l01", title: "Lição 1", position: 1, required: true },
      { id: "l2", cycle_id: "c1", slug: "c1-l02", title: "Lição 2", position: 2, required: true },
      { id: "l3", cycle_id: "c1", slug: "c1-l03", title: "Lição 3", position: 3, required: true },
    ],
    progress: [],
    cycle_progress: [],
    sent: [],
    assignments: [],
    alerts: [],
    summaries: [],
    templates,
    admins: [],
    ...overrides,
  };
}
const member = (id: string, extra: Partial<NonNullable<Snapshot["members"]>[number]> = {}) => ({
  id,
  name: `Fulana ${id}`,
  email: `${id}@example.com`,
  role: "member" as const,
  onboarded_at: daysAgo(30),
  last_activity_at: daysAgo(30),
  status: "in_progress",
  ...extra,
});
const done = (user: string, lesson: string, completedDaysAgo: number) => ({
  user_id: user,
  lesson_id: lesson,
  released_at: daysAgo(completedDaysAgo + 1),
  started_at: daysAgo(completedDaysAgo + 1),
  completed_at: daysAgo(completedDaysAgo),
});
const kinds = (s: Snapshot, now = NOW) => planReminders(s, now, SITE).map((m) => `${m.userId}:${m.kind}`);

describe("horário de envio (8h às 20h, Brasília)", () => {
  it("respeita a janela", () => {
    expect(isSendWindow(new Date("2026-09-16T10:59:00Z"))).toBe(false); // 7h59
    expect(isSendWindow(new Date("2026-09-16T11:00:00Z"))).toBe(true); // 8h
    expect(isSendWindow(new Date("2026-09-16T22:59:00Z"))).toBe(true); // 19h59
    expect(isSendWindow(new Date("2026-09-16T23:00:00Z"))).toBe(false); // 20h
  });
  it("fora da janela, nada é planejado", () => {
    const s = base({ members: [member("a", { last_activity_at: daysAgo(4) })] });
    expect(kinds(s, new Date("2026-09-16T05:00:00Z"))).toEqual([]);
    expect(kinds(s)).toEqual(["a:nudge_3d"]);
  });
  it("recurso desligado: nada", () => {
    expect(planReminders({ enabled: false }, NOW, SITE)).toEqual([]);
  });
});

describe("lembretes por ausência", () => {
  it("3 a 6 dias sem acesso: lembrete gentil, com o link da lição em que a pessoa parou", () => {
    // Concluiu a lição 1 há 7 dias; a 2 abriu há 4 (intervalo de 3) e ele nunca voltou.
    const s = base({ members: [member("a", { last_activity_at: daysAgo(7) })], progress: [done("a", "l1", 7)] });
    const [m] = planReminders(s, NOW, SITE);
    expect(m).toMatchObject({ userId: "a", kind: "nudge_3d", email: "a@example.com" });
    expect(m.vars).toMatchObject({ nome: "Fulana", licao: "Lição 2", link: `${SITE}/licao/c1-l02`, igreja: "Vertical Church" });
  });

  it("7 a 13 dias: convite carinhoso; 14 ou mais: nenhum lembrete (aí é o alerta ao cuidador)", () => {
    expect(kinds(base({ members: [member("a", { last_activity_at: daysAgo(8) })] }))).toEqual(["a:nudge_7d"]);
    expect(kinds(base({ members: [member("a", { last_activity_at: daysAgo(20) })] }))).toEqual([]);
  });

  it("menos de 3 dias: nada; quem voltou a acessar não recebe convite", () => {
    expect(kinds(base({ members: [member("a", { last_activity_at: daysAgo(1) })] }))).toEqual([]);
  });

  it("quem concluiu a trilha inteira, ou ainda não fez o primeiro acesso, não recebe convite", () => {
    expect(kinds(base({ members: [member("a", { last_activity_at: daysAgo(5), status: "completed" })] }))).toEqual([]);
    expect(kinds(base({ members: [member("a", { last_activity_at: daysAgo(5), status: "onboarding_pending" })] }))).toEqual([]);
  });

  it("uma mensagem por ausência: já enviada não repete; depois de voltar e sumir de novo, é outra ausência", () => {
    const key = daysAgo(4).slice(0, 10);
    const sent = [{ user_id: "a", kind: "nudge_3d" as const, dedupe_key: key, status: "sent" as const, created_at: daysAgo(0.5) }];
    const s = base({ members: [member("a", { last_activity_at: daysAgo(4) })], sent });
    expect(kinds(s)).toEqual([]);
    const later = new Date(NOW.getTime() + 20 * 86_400_000);
    const again = base({ members: [member("a", { last_activity_at: daysAgo(4, later) })], sent });
    expect(kinds(again, later)).toEqual(["a:nudge_3d"]);
  });

  it("no máximo 2 lembretes por semana", () => {
    const two = [
      { user_id: "a", kind: "new_lesson" as const, dedupe_key: "x", status: "sent" as const, created_at: daysAgo(5) },
      { user_id: "a", kind: "nudge_3d" as const, dedupe_key: "y", status: "sent" as const, created_at: daysAgo(2) },
    ];
    const s = base({ members: [member("a", { last_activity_at: daysAgo(8) })], sent: two });
    expect(kinds(s)).toEqual([]);
    // Um envio que falhou não conta; e os de mais de 7 dias saem da conta.
    const failed = [{ ...two[0], status: "failed" as const, created_at: daysAgo(3) }, { ...two[1], created_at: daysAgo(8) }];
    expect(kinds(base({ members: [member("a", { last_activity_at: daysAgo(8) })], sent: failed }))).toEqual(["a:nudge_7d"]);
  });

  it("um envio que falhou há pouco tempo pode ser tentado de novo; um antigo, não", () => {
    const key = daysAgo(4).slice(0, 10);
    const failed = (age: number) => [{ user_id: "a", kind: "nudge_3d" as const, dedupe_key: key, status: "failed" as const, created_at: daysAgo(age) }];
    const members = [member("a", { last_activity_at: daysAgo(4) })];
    expect(kinds(base({ members, sent: failed(1) }))).toEqual(["a:nudge_3d"]);
    expect(kinds(base({ members, sent: failed(3) }))).toEqual([]);
  });

  it("um lembrete por rodada por pessoa, o mais importante primeiro", () => {
    const s = base({ members: [member("a", { last_activity_at: daysAgo(8) })] });
    expect(kinds(s)).toEqual(["a:nudge_7d"]);
  });

  it("editor e administrador não recebem lembretes de trilha", () => {
    expect(kinds(base({ members: [member("a", { role: "editor", last_activity_at: daysAgo(5) }), member("b", { role: "admin", last_activity_at: daysAgo(5) })] }))).toEqual([]);
  });

  it("sem texto configurado para o tipo, não planeja", () => {
    const s = base({ members: [member("a", { last_activity_at: daysAgo(4) })], templates: templates.filter((t) => t.kind !== "nudge_3d") });
    expect(kinds(s)).toEqual([]);
  });
});

describe("nova lição liberada", () => {
  it("avisa quando a lição abriu depois de uma espera e a pessoa ainda não a abriu", () => {
    // Concluiu a lição 1 há 4 dias; o intervalo é de 3, então a 2 abriu há 1 dia.
    const s = base({ members: [member("a", { last_activity_at: daysAgo(4) })], progress: [done("a", "l1", 4)] });
    expect(kinds(s)).toEqual(["a:new_lesson"]);
    const [m] = planReminders(s, NOW, SITE);
    expect(m.dedupeKey).toBe("l2");
    expect(m.vars.licao).toBe("Lição 2");
  });

  it("a espera não conta como ausência: 3 dias de intervalo viram 'nova lição', não 'sentimos sua falta'", () => {
    const s = base({ members: [member("a", { last_activity_at: daysAgo(3.2) })], progress: [done("a", "l1", 3.2)] });
    expect(kinds(s)).toEqual(["a:new_lesson"]);
  });

  it("não avisa quem acabou de concluir (a lição seguinte abriu na hora)", () => {
    const s = base({
      cycles: [{ id: "c1", slug: "c1", title: "Fundamentos", position: 1, release_interval_days: 0, max_lessons_per_week: 5 }],
      members: [member("a", { last_activity_at: daysAgo(0.1) })],
      progress: [done("a", "l1", 0.1)],
    });
    expect(kinds(s)).toEqual([]);
  });

  it("uma vez por lição", () => {
    const sent = [{ user_id: "a", kind: "new_lesson" as const, dedupe_key: "l2", status: "sent" as const, created_at: daysAgo(0.5) }];
    const s = base({ members: [member("a", { last_activity_at: daysAgo(4) })], progress: [done("a", "l1", 4)], sent });
    expect(kinds(s)).toEqual([]);
  });
});

describe("boas-vindas e ciclo concluído", () => {
  it("boas-vindas a quem chegou há menos de 3 dias, uma vez; quem já era da casa não recebe", () => {
    const recent = member("a", { onboarded_at: daysAgo(0.5), last_activity_at: daysAgo(0.5) });
    const [m] = planReminders(base({ members: [recent] }), NOW, SITE);
    expect(m).toMatchObject({ kind: "welcome", dedupeKey: "welcome" });
    expect(m.vars.licao).toBe("Lição 1");
    expect(kinds(base({ members: [member("a", { last_activity_at: daysAgo(1) })] }))).toEqual([]);
    const sent = [{ user_id: "a", kind: "welcome" as const, dedupe_key: "welcome", status: "sent" as const, created_at: daysAgo(0.2) }];
    expect(kinds(base({ members: [recent], sent }))).toEqual([]);
  });

  it("parabéns pelo ciclo concluído na última semana, uma vez por ciclo", () => {
    const s = base({
      members: [member("a", { last_activity_at: daysAgo(1) })],
      cycle_progress: [{ user_id: "a", cycle_id: "c1", completed_at: daysAgo(1) }],
    });
    const [m] = planReminders(s, NOW, SITE);
    expect(m).toMatchObject({ kind: "cycle_completed", dedupeKey: "c1" });
    expect(m.vars).toMatchObject({ ciclo: "Fundamentos", link: `${SITE}/ciclo/c1` });
    const old = base({ members: [member("a")], cycle_progress: [{ user_id: "a", cycle_id: "c1", completed_at: daysAgo(20) }] });
    expect(kinds(old)).not.toContain("a:cycle_completed");
  });
});

describe("cuidado: alertas e resumo semanal", () => {
  const care = (extra: Partial<Snapshot> = {}) =>
    base({
      caregivers_enabled: true,
      members: [member("cuid", { role: "caregiver", last_activity_at: daysAgo(1) })],
      alerts: [{ id: "al1", member_id: "m1", member_name: "Beto Souza", opened_at: daysAgo(1) }],
      assignments: [{ member_id: "m1", caregiver_id: "cuid" }],
      ...extra,
    });

  it("o alerta vai ao cuidador do membro, com o link da ficha", () => {
    const [m] = planReminders(care(), NOW, SITE);
    expect(m).toMatchObject({ userId: "cuid", kind: "stalled_alert", dedupeKey: "al1" });
    expect(m.vars).toMatchObject({ membro: "Beto Souza", link: `${SITE}/cuidado/m1` });
  });

  it("sem cuidador, vai aos administradores; com cuidador que não aceitou e-mails, não vai a ninguém", () => {
    const noCaregiver = care({ assignments: [], admins: [{ id: "adm", name: "Pastor Silva", email: "p@example.com" }] });
    const [m] = planReminders(noCaregiver, NOW, SITE).filter((x) => x.kind === "stalled_alert");
    expect(m).toMatchObject({ userId: "adm", email: "p@example.com" });
    expect(m.vars.link).toBe(`${SITE}/admin/cuidado`);
    expect(kinds(care({ members: [] }))).toEqual([]);
  });

  it("com o recurso de cuidadores desligado, nada disso sai", () => {
    expect(kinds(care({ caregivers_enabled: false }))).toEqual([]);
  });

  it("o alerta é avisado uma vez só", () => {
    const sent = [{ user_id: "cuid", kind: "stalled_alert" as const, dedupe_key: "al1", status: "sent" as const, created_at: daysAgo(1) }];
    expect(kinds(care({ sent }))).toEqual([]);
  });

  it("resumo semanal: segunda a quarta, uma vez por semana, só números", () => {
    const summaries = [{ caregiver_id: "cuid", members: 3, active: 2, stalled: 1, completed_lessons: 4 }];
    const [m] = planReminders(care({ alerts: [], summaries }), NOW, SITE);
    expect(m).toMatchObject({ kind: "weekly_summary", dedupeKey: "2026-09-14" }); // a segunda-feira daquela semana
    expect(m.vars.resumo).toContain("3 membros estão com você");
    expect(m.vars.resumo).toContain("1 parado há mais de 14 dias");
    const friday = kinds(care({ alerts: [], summaries }), new Date("2026-09-18T15:00:00Z"));
    expect(friday.filter((k) => k.endsWith("weekly_summary"))).toEqual([]); // sexta: fora do período
    const sent = [{ user_id: "cuid", kind: "weekly_summary" as const, dedupe_key: "2026-09-14", status: "sent" as const, created_at: daysAgo(1) }];
    expect(kinds(care({ alerts: [], summaries, sent }))).toEqual([]);
    expect(kinds(care({ alerts: [], summaries: [{ ...summaries[0], members: 0 }] }))).toEqual([]);
  });
});

describe("textos dos e-mails", () => {
  it("valida tamanho e só aceita as variáveis do tipo", () => {
    expect(validateTemplate("welcome", { subject: "Olá {{nome}}", body: "Oi {{nome}}, veja {{link}}" }).ok).toBe(true);
    expect(validateTemplate("welcome", { subject: " ", body: "x" }).ok).toBe(false);
    expect(validateTemplate("welcome", { subject: "x", body: "" }).ok).toBe(false);
    const unknown = validateTemplate("welcome", { subject: "x", body: "Oi {{apelido}}" });
    expect(unknown).toMatchObject({ ok: false, error: expect.stringContaining("{{apelido}}") });
    // {{resumo}} existe, mas só no resumo semanal
    expect(validateTemplate("welcome", { subject: "x", body: "{{resumo}}" }).ok).toBe(false);
    expect(validateTemplate("weekly_summary", { subject: "x", body: "{{resumo}}" }).ok).toBe(true);
  });

  it("acusa chaves incompletas", () => {
    expect(validateTemplate("welcome", { subject: "x", body: "Oi {{nome}" }).ok).toBe(false);
    expect(validateTemplate("welcome", { subject: "x", body: "Oi {nome}}" }).ok).toBe(false);
    expect(validateTemplate("welcome", { subject: "x", body: "Oi {nome}" }).ok).toBe(false);
  });

  it("renderiza com o rodapé de descadastro, em texto e em HTML seguro", () => {
    const r = renderEmail(
      { subject: "Olá, {{nome}}", body: "Oi {{nome}}!\n\nVeja: {{link}}" },
      { nome: "<b>Ana</b> & cia", link: "https://x.org/a?b=1&c=2" },
      { churchName: "Vertical Church", unsubscribeUrl: "https://x.org/desinscrever?t=abc" },
    );
    expect(r.subject).toBe("Olá, <b>Ana</b> & cia");
    expect(r.text).toContain("Para não receber mais estes e-mails: https://x.org/desinscrever?t=abc");
    expect(r.html).not.toContain("<b>Ana</b>"); // o nome nunca vira marcação
    expect(r.html).toContain("&lt;b&gt;Ana&lt;/b&gt; &amp; cia");
    expect(r.html).toContain('<a href="https://x.org/a?b=1&amp;c=2">');
    expect(r.html).toContain("Não quero mais receber estes e-mails");
  });

  it("variável sem valor some em vez de aparecer como {{...}}", () => {
    const r = renderEmail({ subject: "s", body: "Lição: {{licao}}." }, {}, { churchName: "I", unsubscribeUrl: "u" });
    expect(r.text).toContain("Lição: .");
    expect(r.text).not.toContain("{{");
  });
});

describe("configuração e provedor", () => {
  it("compara o CRON_SECRET sem aceitar vazio, errado ou de outro tamanho", () => {
    expect(isAuthorizedCron("Bearer segredo", "segredo")).toBe(true);
    expect(isAuthorizedCron("Bearer segred", "segredo")).toBe(false);
    expect(isAuthorizedCron("segredo", "segredo")).toBe(false);
    expect(isAuthorizedCron(null, "segredo")).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
    expect(safeEqual("a", "a")).toBe(true);
  });

  it("monta o endereço do site", () => {
    expect(siteUrlFromEnv({ NEXT_PUBLIC_SITE_URL: "https://a.org/" })).toBe("https://a.org");
    expect(siteUrlFromEnv({ VERCEL_PROJECT_PRODUCTION_URL: "a.vercel.app" })).toBe("https://a.vercel.app");
    expect(siteUrlFromEnv({})).toBeNull();
  });

  it("o Resend recebe o pedido certo e a falha vira erro curto, sem dados da pessoa", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = createResendProvider({
      apiKey: "chave",
      from: "Igreja <a@b.org>",
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    });
    expect(await ok.send({ to: "x@y.org", subject: "S", text: "T", html: "<p>T</p>", headers: { "List-Unsubscribe": "<u>" } })).toEqual({ ok: true });
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer chave");
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ from: "Igreja <a@b.org>", to: ["x@y.org"], subject: "S" });

    const bad = createResendProvider({ apiKey: "k", from: "f", fetchImpl: (async () => new Response("erro com x@y.org", { status: 422 })) as unknown as typeof fetch });
    const failure = await bad.send({ to: "x@y.org", subject: "S", text: "T", html: "T" });
    expect(failure).toEqual({ ok: false, error: "Resend respondeu 422" });

    const down = createResendProvider({ apiKey: "k", from: "f", fetchImpl: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch });
    expect(await down.send({ to: "x@y.org", subject: "S", text: "T", html: "T" })).toEqual({ ok: false, error: "Falha de rede: TypeError" });
  });

  it("sem chave ou remetente configurados, não há provedor", () => {
    expect(providerFromEnv({})).toBeNull();
    expect(providerFromEnv({ RESEND_API_KEY: "k" })).toBeNull();
    expect(providerFromEnv({ RESEND_API_KEY: "k", EMAIL_FROM: "a@b.org" })).not.toBeNull();
  });
});
