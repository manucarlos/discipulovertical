/**
 * Testes de usabilidade com três pessoas, rodando o código REAL do aplicativo (páginas e ações do
 * servidor) sobre o banco em memória, com as regras de segurança reais:
 *
 *   Claudião   administrador (o pastor): prepara o conteúdo, publica e acompanha as pessoas
 *   Claudinho  membro novo: primeiro acesso e primeiros passos da trilha
 *   Claudio    discípulo avançado: percorre a trilha inteira, os três ciclos
 *
 * As histórias seguem a ordem em que uma igreja usaria o sistema e dependem umas das outras.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", async () => {
  const { session } = await import("./session");
  return { createClient: async () => session.client };
});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath() {} }));
vi.mock("@/lib/supabase/anon", async () => {
  const { session } = await import("./session");
  return { createAnonClient: () => session.client };
});
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, prefetch() {} }),
}));

import { completeOnboarding } from "@/app/onboarding/actions";
import OnboardingPage from "@/app/onboarding/page";
import HomePage from "@/app/(member)/page";
import CyclePage from "@/app/(member)/ciclo/[slug]/page";
import LessonPage from "@/app/(member)/licao/[slug]/page";
import ChurchPage from "@/app/(member)/igreja/page";
import { completeLesson, openLesson, saveReadingPosition, saveReflection, submitQuiz, togglePractice } from "@/app/(member)/licao/[slug]/actions";
import AdminTrailPage from "@/app/admin/trilha/page";
import EditLessonPage from "@/app/admin/licao/[slug]/page";
import PreviewPage from "@/app/admin/licao/[slug]/previa/page";
import PeoplePage from "@/app/admin/pessoas/page";
import PersonPage from "@/app/admin/pessoas/[id]/page";
import DashboardPage from "@/app/admin/painel/page";
import EditChurchPage from "@/app/admin/igreja/page";
import { saveChurchPage } from "@/app/admin/igreja/actions";
import SettingsPage from "@/app/admin/configuracoes/page";
import { saveSettings } from "@/app/admin/configuracoes/actions";
import { loadSettings } from "@/lib/features";
import LoginPage from "@/app/login/page";
import ProfilePage from "@/app/(member)/perfil/page";
import { deleteAccount, updateProfile, updateReminders } from "@/app/(member)/perfil/actions";
import { GET as exportMyData } from "@/app/(member)/perfil/exportar/route";
import { changeLessonStatus, restoreLessonVersion, saveLesson } from "@/app/admin/licao/[slug]/actions";
import { createLesson, moveLesson, saveCycleSettings } from "@/app/admin/actions";
import { changeRole } from "@/app/admin/pessoas/actions";
import RemindersPage from "@/app/admin/lembretes/page";
import { saveEmailTemplate, sendTestEmail } from "@/app/admin/lembretes/actions";
import UnsubscribePage from "@/app/desinscrever/page";
import { GET as unsubscribeGet, POST as unsubscribePost } from "@/app/api/descadastro/route";
import { GET as cronGet } from "@/app/api/cron/lembretes/route";
import { FakeEmailProvider } from "@/lib/email/fake";
import type { EmailProvider } from "@/lib/email/provider";
import { runReminders } from "@/lib/reminders/run";
import CarePage from "@/app/(member)/cuidado/page";
import CareMemberPage from "@/app/(member)/cuidado/[id]/page";
import { addCareNote, updateCareAlert } from "@/app/(member)/cuidado/actions";
import CareAdminPage from "@/app/admin/cuidado/page";
import { assignCaregiver, autoAssignCaregivers, unassignCaregiver, updateAdminAlert } from "@/app/admin/cuidado/actions";
import { loadLessonForEditing, type LessonForEditing } from "@/lib/admin/queries";
import { findPlaceholders } from "@/lib/content/placeholders";
import { loadTrail } from "@/lib/trail/queries";
import { session } from "./session";
import { CLAUDIAO, CLAUDINHO, CLAUDIO, CYCLES, form, outcome, visit, World } from "./world";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test";

let world: World;
/** O adaptador imita o cliente do Supabase só no que o app usa; para os tipos do app ele se faz passar por ele. */
const client = () => session.client as unknown as SupabaseClient;

beforeAll(async () => {
  world = await World.create();
});
afterAll(async () => {
  await world.close();
});

// ---------------------------------------------------------------------------------------------
// Ajudantes: o que uma pessoa faz repetidamente
// ---------------------------------------------------------------------------------------------

/** Monta o que o editor envia ao salvar, a partir da lição carregada (como o formulário faria). */
function payloadOf(l: LessonForEditing, patch: Partial<{ title: string; objective: string; content: LessonForEditing["content"]; notes: LessonForEditing["notes"] }> = {}) {
  return {
    title: patch.title ?? l.title,
    objective: patch.objective ?? l.objective,
    keyVerse: l.keyVerse,
    estimatedMinutes: l.estimatedMinutes,
    tags: l.tags,
    required: l.required,
    sensitive: l.sensitive,
    content: patch.content ?? l.content,
    notes: patch.notes ?? l.notes,
    quiz: l.quiz,
    note: "",
  };
}

const MARKER = /\[PREENCHER[^\]]*\]/g;
const fillMarkers = <T>(value: T): T => JSON.parse(JSON.stringify(value).replace(MARKER, "INFORMAÇÃO DE TESTE"));

/** Lê a lição do jeito do membro: abre a tela, registra a abertura e guarda até onde leu. */
async function readLesson(slug: string, position = 0.6) {
  const page = await visit(LessonPage, { params: { slug } });
  expect(page.redirect, `a lição ${slug} deveria estar liberada`).toBeNull();
  expect(page.notFound, `a lição ${slug} deveria existir`).toBe(false);
  await openLesson(slug);
  await saveReadingPosition(slug, position);
  return page;
}

async function finishLesson(slug: string) {
  return outcome(() => completeLesson(slug));
}

const allSlugs = CYCLES.flatMap((c) => c.lessons.map((l) => l.id));

// ---------------------------------------------------------------------------------------------
// HISTÓRIA 1 · Claudião (administrador) prepara o conteúdo
// ---------------------------------------------------------------------------------------------

describe("Claudião, administrador: prepara a plataforma", () => {
  it("no primeiro login vira administrador, e o primeiro acesso pede as informações e o consentimento", async () => {
    const id = await world.login(CLAUDIAO);
    const [profile] = await world.sql<{ role: string }>("select role from public.profiles where id = $1", [id]);
    expect(profile.role).toBe("admin");

    expect((await visit(HomePage)).redirect).toBe("/onboarding");
    const onboarding = await visit(OnboardingPage);
    expect(onboarding.text).toContain("Que bom ter você aqui");
    expect(onboarding.text).toContain("Começar minha trilha");

    // Sem marcar o consentimento não avança, e a mensagem explica o motivo.
    const refused = await completeOnboarding(null, form({ displayName: "Claudião", bibleVersion: "NTLH" }));
    expect(refused).toMatchObject({ error: expect.stringMatching(/consentimento/) });

    const done = await outcome(() => completeOnboarding(null, form({ displayName: "Claudião", bibleVersion: "NTLH", consentData: true })));
    expect(done.redirect).toBe("/");
  });

  it("antes de importar o conteúdo, a trilha do membro e o painel dizem o que falta, sem erro", async () => {
    expect((await visit(HomePage)).text).toContain("Sua trilha começa em breve");
    expect((await visit(AdminTrailPage)).text).toContain("Ainda não há ciclos");
  });

  it("depois de importar, o painel mostra os 3 ciclos, as 28 lições em rascunho e as 10 com pendências", async () => {
    await world.importContent(); // o pastor cola o SQL gerado no SQL Editor
    const page = await visit(AdminTrailPage);
    for (const title of ["1. Fundamentos", "2. Raízes", "3. Pertencimento"]) expect(page.text).toContain(title);
    expect((page.html.match(/href="\/admin\/licao\//g) ?? []).length).toBe(28);
    expect((page.text.match(/Pendências \[PREENCHER\]/g) ?? []).length).toBe(10);
    expect((page.text.match(/Rascunho/g) ?? []).length).toBeGreaterThanOrEqual(28);
    expect(page.text).toContain("Configurações do ciclo"); // só o administrador vê
  });

  it("abre uma lição no editor, edita, salva, e vê a mudança na prévia", async () => {
    const editor = await visit(EditLessonPage, { params: { slug: "c1-l01" } });
    expect(editor.text).toContain("Bem-vindo à família de Deus");
    expect(editor.text).toContain("Texto da lição");
    expect(editor.text).toContain("Notas da equipe");

    const lesson = (await loadLessonForEditing(client(), "c1-l01"))!;
    const saved = await saveLesson("c1-l01", lesson.currentVersionId, payloadOf(lesson, { title: "Bem-vindo(a) à família de Deus" }));
    expect(saved).toMatchObject({ ok: true, hasPlaceholders: false });

    const preview = await visit(PreviewPage, { params: { slug: "c1-l01" } });
    expect(preview.text).toContain("Bem-vindo(a) à família de Deus");
    expect(preview.text).toContain("Pré-visualização da versão salva");
  });

  it("se outra pessoa salvou antes, o salvamento é recusado com uma mensagem clara (conflito)", async () => {
    const lesson = (await loadLessonForEditing(client(), "c1-l02"))!;
    const stale = lesson.currentVersionId;
    expect(await saveLesson("c1-l02", stale, payloadOf(lesson, { objective: "Primeira edição" }))).toMatchObject({ ok: true });

    const second = await saveLesson("c1-l02", stale, payloadOf(lesson, { objective: "Segunda edição" }));
    expect(second).toMatchObject({ ok: false, conflict: true });
    expect((second as { error: string }).error).toMatch(/Recarregue/);
  });

  it("o histórico guarda cada versão e permite voltar atrás", async () => {
    const before = (await loadLessonForEditing(client(), "c1-l02"))!;
    expect(before.versions.length).toBeGreaterThanOrEqual(2);
    const original = before.versions[before.versions.length - 1]; // a importação inicial

    const restored = await restoreLessonVersion("c1-l02", original.id, before.currentVersionId);
    expect(restored).toEqual({ ok: true });
    const after = (await loadLessonForEditing(client(), "c1-l02"))!;
    expect(after.versions.length).toBe(before.versions.length + 1); // o histórico só cresce
    expect(after.versions[0].note).toMatch(/^Restaurada da versão de/);
  });

  it("não deixa publicar uma lição que ainda tem [PREENCHER], e diz por quê", async () => {
    const result = await changeLessonStatus("c3-l01", "published");
    expect(result).toMatchObject({ ok: false });
    expect((result as { error: string }).error).toMatch(/PREENCHER/);
  });

  it("publica os Ciclos 1 e 2 (16 lições) sem pendências", async () => {
    for (const slug of allSlugs.filter((s) => s.startsWith("c1-") || s.startsWith("c2-"))) {
      expect(await changeLessonStatus(slug, "published"), slug).toEqual({ ok: true });
    }
  });

  it("resolve as pendências do Ciclo 3 no editor e publica as 12 lições", async () => {
    const pending: string[] = [];
    for (const slug of allSlugs.filter((s) => s.startsWith("c3-"))) {
      const lesson = (await loadLessonForEditing(client(), slug))!;
      if (!lesson.hasPlaceholders) continue;
      pending.push(slug);
      const saved = await saveLesson(
        slug,
        lesson.currentVersionId,
        payloadOf(lesson, { content: fillMarkers(lesson.content), notes: fillMarkers(lesson.notes) }),
      );
      expect(saved, slug).toMatchObject({ ok: true, hasPlaceholders: false });
    }
    expect(pending).toHaveLength(10); // exatamente as lições que a Parte 3 do handoff aponta

    for (const slug of allSlugs.filter((s) => s.startsWith("c3-"))) {
      const l = (await loadLessonForEditing(client(), slug))!;
      expect(findPlaceholders(l.content, l.notes), slug).toEqual([]);
      expect(await changeLessonStatus(slug, "published"), slug).toEqual({ ok: true });
    }
    const [{ n }] = await world.sql<{ n: number }>("select count(*)::int as n from public.lessons where status = 'published'");
    expect(n).toBe(28);
  });

  it("toda publicação ficou registrada no log de auditoria", async () => {
    const [{ n }] = await world.sql<{ n: number }>("select count(*)::int as n from public.audit_log where action = 'lesson_published'");
    expect(n).toBe(28);
  });
});

// ---------------------------------------------------------------------------------------------
// HISTÓRIA 2 · Claudinho (membro novo)
// ---------------------------------------------------------------------------------------------

describe("Claudinho, membro novo: primeiro acesso e primeiros passos", () => {
  it("quem ainda não entrou é mandado ao login", async () => {
    world.visitor();
    for (const page of [HomePage, ChurchPage]) expect((await visit(page)).redirect).toBe("/login");
    expect((await visit(LessonPage, { params: { slug: "c1-l01" } })).redirect).toBe("/login");
  });

  it("entra pela primeira vez: vira membro e é levado ao primeiro acesso", async () => {
    const id = await world.login(CLAUDINHO);
    const [profile] = await world.sql<{ role: string; onboarded_at: string | null }>("select role, onboarded_at from public.profiles where id = $1", [id]);
    expect(profile).toMatchObject({ role: "member", onboarded_at: null });
    expect((await visit(HomePage)).redirect).toBe("/onboarding");
  });

  it("o primeiro acesso explica cada erro em português, e aceita quando está certo", async () => {
    const attempt = (fields: Record<string, string | boolean>) => completeOnboarding(null, form(fields));
    expect(await attempt({ displayName: "C", bibleVersion: "NTLH", consentData: true })).toMatchObject({ error: expect.stringMatching(/nome/) });
    expect(await attempt({ displayName: "Claudinho", bibleVersion: "ARC", consentData: true })).toMatchObject({ error: expect.stringMatching(/Bíblia/) });
    expect(await attempt({ displayName: "Claudinho", bibleVersion: "NTLH" })).toMatchObject({ error: expect.stringMatching(/consentimento/) });
    expect(await attempt({ displayName: "Claudinho", whatsapp: "123", bibleVersion: "NTLH", consentData: true })).toMatchObject({ error: expect.stringMatching(/WhatsApp/) });
    expect(
      await attempt({ displayName: "Claudinho", bibleVersion: "NTLH", consentData: true, consentWhatsapp: true }),
    ).toMatchObject({ error: expect.stringMatching(/número/) });

    // Nada disso gravou nada.
    expect((await world.sql("select 1 from public.consents where user_id = $1", [CLAUDINHO.id])).length).toBe(0);

    const ok = await outcome(() =>
      attempt({ displayName: "  Claudinho  Silva ", whatsapp: "(11) 91234-5678", bibleVersion: "NTLH", consentData: true, consentEmail: true, consentWhatsapp: true }),
    );
    expect(ok.redirect).toBe("/");

    const [profile] = await world.sql<{ display_name: string; whatsapp: string; onboarded_at: string | null }>(
      "select display_name, whatsapp, onboarded_at from public.profiles where id = $1",
      [CLAUDINHO.id],
    );
    expect(profile.display_name).toBe("Claudinho Silva");
    expect(profile.whatsapp).toBe("5511912345678");
    expect(profile.onboarded_at).not.toBeNull();
    const consents = await world.sql<{ purpose: string }>("select purpose from public.consents where user_id = $1 order by purpose", [CLAUDINHO.id]);
    expect(consents.map((c) => c.purpose)).toEqual(["data_processing", "email_reminders", "whatsapp_reminders"]);
  });

  it("a tela inicial dá as boas-vindas e aponta a primeira lição, sem sobrecarregar", async () => {
    const home = await visit(HomePage);
    expect(home.redirect).toBeNull();
    expect(home.text).toContain("Olá, Claudinho!");
    expect(home.text).toContain("Sua próxima lição");
    expect(home.text).toContain("Bem-vindo(a) à família de Deus");
    expect(home.text).toContain("Começar lição");
    expect(home.text).toContain("0 de 8 lições concluídas (0%)");
    for (const cycle of ["Fundamentos", "Raízes", "Pertencimento"]) expect(home.text).toContain(cycle);
  });

  it("não alcança o painel da equipe, nem pela tela nem pelas ações", async () => {
    expect((await visit(AdminTrailPage)).redirect).toBe("/");
    expect((await visit(PeoplePage)).redirect).toBe("/");
    expect((await visit(EditLessonPage, { params: { slug: "c1-l01" } })).redirect).toBe("/");

    // Chamando as ações do servidor direto, a própria ação manda embora quem não é da equipe...
    expect((await outcome(() => changeLessonStatus("c1-l01", "archived"))).redirect).toBe("/");
    expect((await outcome(() => saveLesson("c1-l01", null, {}))).redirect).toBe("/");

    // ...e, sem passar pelas telas nem pelas ações, o próprio banco recusa.
    const hacked = await client().from("lessons").update({ status: "archived" }).eq("slug", "c1-l01").select("id");
    expect(hacked.data).toEqual([]); // a política esconde a linha: nada foi alterado
    const [{ status }] = await world.sql<{ status: string }>("select status from public.lessons where slug = 'c1-l01'");
    expect(status).toBe("published");
    expect((await client().from("lesson_internal_notes").select("*")).data).toEqual([]);
    expect((await client().from("quiz_questions").select("*")).data).toEqual([]);
    expect((await client().rpc("admin_member_overview", {})).error?.message).toMatch(/não autorizado/);
    expect((await client().rpc("save_lesson", { p_lesson_id: "00000000-0000-4000-8000-000000000000", p_expected_version: null, p_fields: { title: "x" }, p_content: {}, p_notes: {}, p_quiz: [] })).error).not.toBeNull();
    // E não enxerga o perfil de mais ninguém.
    const profiles = await client().from("profiles").select("id");
    expect(profiles.data).toHaveLength(1);
  });

  it("uma lição ainda bloqueada leva de volta ao ciclo e explica quando libera", async () => {
    const locked = await visit(LessonPage, { params: { slug: "c1-l02" } });
    expect(locked.redirect).toBe("/ciclo/c1?bloqueada=1");
    const cycle = await visit(CyclePage, { params: { slug: "c1" }, search: { bloqueada: "1" } });
    expect(cycle.text).toContain("Essa lição ainda não foi liberada");
    expect(cycle.text).toContain("Conclua a lição anterior");
  });

  it("a lição abre inteira e limpa: versículo com link, prática, e nada de material interno", async () => {
    const page = await readLesson("c1-l01", 0.42);
    expect(page.text).toContain("Objetivo:");
    expect(page.text).toContain("Versículo-chave");
    expect(page.text).toContain("Prática da semana");
    expect(page.text).toContain("Concluir lição");
    expect(page.html).toContain("biblegateway.com/passage/?search=Jo%C3%A3o%201.12&amp;version=NTLH"); // a versão que ele escolheu
    for (const internal of ["Nota para revisão pastoral", "Sugestão de vídeo", "Aviso de rascunho", "Pergunta 1", "Resposta:", "[PREENCHER"]) {
      expect(page.text, internal).not.toContain(internal);
    }
    const [row] = await world.sql<{ status: string; last_position: number }>(
      "select status, last_position::float as last_position from public.lesson_progress where user_id = $1",
      [CLAUDINHO.id],
    );
    expect(row.status).toBe("in_progress");
    expect(row.last_position).toBeCloseTo(0.42);
  });

  it("depois de abrir, a tela inicial oferece continuar de onde parou", async () => {
    const home = await visit(HomePage);
    expect(home.text).toContain("Continue de onde parou");
    expect(home.text).toContain("Continuar lição");
  });

  it("concluir a lição leva de volta ao ciclo com uma confirmação, e a próxima fica aguardando", async () => {
    const done = await finishLesson("c1-l01");
    expect(done.redirect).toBe("/ciclo/c1?concluida=c1-l01");

    const cycle = await visit(CyclePage, { params: { slug: "c1" }, search: { concluida: "c1-l01" } });
    expect(cycle.text).toContain("Você concluiu");
    expect(cycle.text).toContain("Muito bem!");
    expect(cycle.text).toContain("1 de 8 lições concluídas");
    expect(cycle.text).toContain("Concluída");
    expect(cycle.text).toMatch(/Libera (em|amanhã|hoje|\w+-feira|sábado|domingo)/); // data de liberação da segunda

    const home = await visit(HomePage);
    expect(home.text).toContain("Descanse um pouco");
    expect(home.text).toContain("Sua próxima lição libera");
    expect(home.text).toContain("Salvos pela graça");
  });

  it("tentar adiantar a próxima lição não funciona: nada é gravado", async () => {
    await openLesson("c1-l02");
    await saveReadingPosition("c1-l02", 0.5);
    const early = await finishLesson("c1-l02");
    expect(early.redirect).toBe("/");
    const rows = await world.sql("select 1 from public.lesson_progress where user_id = $1 and lesson_id = (select id from public.lessons where slug = 'c1-l02')", [CLAUDINHO.id]);
    expect(rows).toHaveLength(0);
    // Posição inválida não derruba nada.
    await expect(saveReadingPosition("c1-l01", Number.NaN)).resolves.toBeUndefined();
  });

  it("concluir duas vezes a mesma lição não estraga nada", async () => {
    await finishLesson("c1-l01");
    const [row] = await world.sql<{ n: number }>("select count(*)::int as n from public.lesson_progress where user_id = $1 and status = 'completed'", [CLAUDINHO.id]);
    expect(row.n).toBe(1);
  });

  it("três dias depois, a segunda lição está liberada e a tela inicial a oferece", async () => {
    await world.passDays(3);
    const home = await visit(HomePage);
    expect(home.text).toContain("Sua próxima lição");
    expect(home.text).toContain("Salvos pela graça");
    await readLesson("c1-l02");
    expect((await finishLesson("c1-l02")).redirect).toBe("/ciclo/c1?concluida=c1-l02");
  });

  it("o limite de 2 lições por semana segura a terceira, mesmo com o intervalo cumprido; o administrador pode ajustar", async () => {
    const trail = await loadTrail(client(), CLAUDINHO.id!);
    const third = trail.cycles[0].lessons[2];
    expect(third.state).toMatchObject({ state: "locked", reason: expect.stringMatching(/interval|weekly_limit/) });

    // Claudião ajusta o ciclo para liberar sem espera e até 3 por semana.
    await world.login(CLAUDIAO);
    const cycleId = (await world.sql<{ id: string }>("select id from public.cycles where slug = 'c1'"))[0].id;
    const saved = await outcome(() =>
      saveCycleSettings(cycleId, form({ title: "Fundamentos", description: "Salvação.", plannedWeeks: "4", releaseIntervalDays: "0", maxLessonsPerWeek: "3", active: true })),
    );
    expect(saved.redirect).toBe("/admin/trilha?ok=Configura%C3%A7%C3%B5es+do+ciclo+salvas.");

    await world.login(CLAUDINHO);
    const after = await loadTrail(client(), CLAUDINHO.id!);
    expect(after.cycles[0].lessons[2].state.state).toBe("available");
    await readLesson("c1-l03");
    expect((await finishLesson("c1-l03")).redirect).toBe("/ciclo/c1?concluida=c1-l03");

    // Com 3 liberações na semana, a quarta espera, e a tela diz quando.
    const fourth = (await loadTrail(client(), CLAUDINHO.id!)).cycles[0].lessons[3];
    expect(fourth.state).toMatchObject({ state: "locked", reason: "weekly_limit" });
    const cycle = await visit(CyclePage, { params: { slug: "c1" } });
    expect(cycle.text).toContain("Libera");
  });

  it("Nossa Igreja mostra a visão e a missão da igreja, e o que ainda não foi escrito aparece como 'Em breve'", async () => {
    const page = await visit(ChurchPage);
    expect(page.text).toContain("Ser uma igreja relevante, influente");
    expect(page.text).toContain("Levar pessoas a um encontro genuíno com Jesus");
    expect(page.text).toContain("Em breve.");
  });
});

// ---------------------------------------------------------------------------------------------
// HISTÓRIA 2b · Claudinho cuida do próprio perfil
// ---------------------------------------------------------------------------------------------

describe("Claudinho cuida do próprio perfil (RF-27)", () => {
  it("o perfil mostra os dados dele, os lembretes que ele aceitou e os direitos que ele tem", async () => {
    await world.login(CLAUDINHO);
    const page = await visit(ProfilePage);
    expect(page.redirect).toBeNull();
    expect(page.text).toContain("Meu perfil");
    expect(page.text).toContain("claudinho@example.com");
    expect(page.html).toContain('value="Claudinho Silva"');
    expect(page.html).toContain('value="5511912345678"');
    expect(page.text).toContain("Você aceitou o tratamento dos seus dados");
    expect(page.text).toContain("Baixar meus dados");
    expect(page.text).toContain("Excluir minha conta");
    // Os dois lembretes já vêm marcados (ele aceitou no primeiro acesso).
    expect((page.html.match(/type="checkbox"[^>]*checked/g) ?? []).length).toBe(2);
  });

  it("corrige o nome e troca a versão da Bíblia; os versículos passam a abrir na NVI", async () => {
    const saved = await updateProfile(null, form({ displayName: "  Claudinho   da Silva ", whatsapp: "(11) 91234-5678", bibleVersion: "NVI" }));
    expect(saved).toEqual({ ok: "Dados salvos." });
    const [row] = await world.sql<{ display_name: string; bible_version: string }>("select display_name, bible_version from public.profiles where id = $1", [CLAUDINHO.id]);
    expect(row).toEqual({ display_name: "Claudinho da Silva", bible_version: "NVI" });

    const lesson = await visit(LessonPage, { params: { slug: "c1-l01" } });
    expect(lesson.html).toContain("version=NVI-PT");
    expect((await visit(HomePage)).text).toContain("Olá, Claudinho!");
  });

  it("cada erro de preenchimento é explicado, e nada é gravado", async () => {
    expect(await updateProfile(null, form({ displayName: "X", bibleVersion: "NVI" }))).toMatchObject({ error: expect.stringMatching(/nome/) });
    expect(await updateProfile(null, form({ displayName: "Claudinho", bibleVersion: "ARC" }))).toMatchObject({ error: expect.stringMatching(/Bíblia/) });
    expect(await updateProfile(null, form({ displayName: "Claudinho", whatsapp: "12", bibleVersion: "NVI" }))).toMatchObject({ error: expect.stringMatching(/WhatsApp/) });
    const [row] = await world.sql<{ display_name: string }>("select display_name from public.profiles where id = $1", [CLAUDINHO.id]);
    expect(row.display_name).toBe("Claudinho da Silva");
  });

  it("liga e desliga os lembretes; cada canal tem seu consentimento, com histórico", async () => {
    const active = async () =>
      (await world.sql<{ purpose: string }>("select purpose from public.consents where user_id = $1 and revoked_at is null order by purpose", [CLAUDINHO.id])).map((r) => r.purpose);
    expect(await active()).toEqual(["data_processing", "email_reminders", "whatsapp_reminders"]);

    expect(await updateReminders(null, form({ email: true }))).toEqual({ ok: "Preferências salvas." }); // desliga o WhatsApp
    expect(await active()).toEqual(["data_processing", "email_reminders"]);

    expect(await updateReminders(null, form({ email: true }))).toEqual({ ok: "Nada mudou." });

    expect(await updateReminders(null, form({ email: true, whatsapp: true }))).toEqual({ ok: "Preferências salvas." }); // liga de novo
    expect(await active()).toEqual(["data_processing", "email_reminders", "whatsapp_reminders"]);
    // O aceite antigo continua registrado como revogado: nada foi apagado.
    const all = await world.sql("select 1 from public.consents where user_id = $1 and purpose = 'whatsapp_reminders'", [CLAUDINHO.id]);
    expect(all).toHaveLength(2);
    expect(await updateReminders(null, form({}))).toEqual({ ok: "Preferências salvas." }); // desliga tudo
    expect(await active()).toEqual(["data_processing"]);
  });

  it("apagar o WhatsApp revoga o lembrete por WhatsApp junto, e não deixa ligá-lo sem número", async () => {
    await updateReminders(null, form({ whatsapp: true }));
    expect(await updateProfile(null, form({ displayName: "Claudinho da Silva", whatsapp: "", bibleVersion: "NVI" }))).toEqual({ ok: "Dados salvos." });
    const active = await world.sql<{ purpose: string }>("select purpose from public.consents where user_id = $1 and revoked_at is null", [CLAUDINHO.id]);
    expect(active.map((c) => c.purpose)).not.toContain("whatsapp_reminders");

    expect(await updateReminders(null, form({ whatsapp: true }))).toMatchObject({ error: expect.stringMatching(/número/) });
    // Devolve o número, como estava.
    await updateProfile(null, form({ displayName: "Claudinho da Silva", whatsapp: "(11) 91234-5678", bibleVersion: "NVI" }));
  });

  it("baixa um arquivo com tudo o que a plataforma guarda sobre ele, e só sobre ele", async () => {
    const response = await exportMyData();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const data = JSON.parse(await response.text());
    expect(data.perfil).toMatchObject({ nome: "Claudinho da Silva", email: "claudinho@example.com", whatsapp: "5511912345678", versao_da_biblia: "NVI" });
    expect(data.consentimentos.length).toBeGreaterThanOrEqual(4);
    expect(data.progresso_das_licoes).toHaveLength(3);
    expect(data.progresso_das_licoes[0]).toMatchObject({ licao: "c1-l01", situacao: "Concluída" });
    expect(data.progresso_dos_ciclos[0]).toMatchObject({ ciclo: "c1", titulo: "Fundamentos" });
    const json = JSON.stringify(data);
    expect(json).not.toMatch(/claudiao@|claudio@|Nota para revisão|Sugestão de vídeo/);
  });

  it("quem não entrou não baixa nada: é mandado ao login", async () => {
    world.visitor();
    expect((await outcome(() => exportMyData())).redirect).toBe("/login");
    await world.login(CLAUDINHO);
  });
});

// ---------------------------------------------------------------------------------------------
// HISTÓRIA 3 · Claudio (discípulo avançado) percorre os três ciclos
// ---------------------------------------------------------------------------------------------

describe("Claudio, discípulo: percorre os três ciclos até o fim", () => {
  it("entra, faz o primeiro acesso escolhendo a NVI, e os versículos passam a abrir na NVI", async () => {
    await world.login(CLAUDIO);
    expect((await visit(HomePage)).redirect).toBe("/onboarding");
    const ok = await outcome(() => completeOnboarding(null, form({ displayName: "Claudio", bibleVersion: "NVI", consentData: true })));
    expect(ok.redirect).toBe("/");

    const page = await readLesson("c1-l01");
    expect(page.html).toContain("version=NVI-PT");
    expect(page.html).not.toContain("version=NTLH");
  });

  it("percorre as 28 lições em ordem, sem nunca ficar preso, e os ciclos se concluem no momento certo", async () => {
    const cycleEnds = new Map<string, string | null>();
    for (const slug of allSlugs) {
      if (slug !== "c1-l01") await readLesson(slug);
      const done = await finishLesson(slug);
      expect(done.redirect, slug).toMatch(new RegExp(`^/ciclo/c[123]\\?concluida=${slug}`));
      cycleEnds.set(slug, done.redirect);
      await world.passDays(4); // o intervalo do ciclo e a cota semanal ficam cumpridos
    }

    // A conclusão do ciclo é anunciada só na última lição de cada um (8, 8 e 12 lições).
    const withCycleFlag = [...cycleEnds].filter(([, url]) => url?.includes("ciclo=1")).map(([slug]) => slug);
    expect(withCycleFlag).toEqual(["c1-l08", "c2-l08", "c3-l12"]);
  });

  it("a tela de ciclo concluído parabeniza e convida ao encontro presencial, sem travar o que vem depois", async () => {
    const page = await visit(CyclePage, { params: { slug: "c1" }, search: { concluida: "c1-l08", ciclo: "1" } });
    expect(page.text).toContain("Parabéns! Você concluiu o ciclo Fundamentos.");
    expect(page.text).toContain("encontro presencial");
    expect(page.text).toContain("8 de 8 lições concluídas");

    const [cycles] = await world.sql<{ n: number }>("select count(*)::int as n from public.cycle_progress where user_id = $1 and status = 'completed'", [CLAUDIO.id]);
    expect(cycles.n).toBe(3);
  });

  it("ao terminar tudo, a tela inicial reconhece a conquista e não deixa a pessoa num beco sem saída", async () => {
    const home = await visit(HomePage);
    expect(home.text).toContain("Você concluiu todos os ciclos disponíveis");
    expect(home.text).toContain("reler qualquer lição");
    for (const cycle of ["Fundamentos", "Raízes", "Pertencimento"]) expect(home.text).toContain(cycle);
  });

  it("pode reler qualquer lição já concluída (RN-08), e isso não muda o progresso", async () => {
    const before = await world.sql<{ completed_at: string }>("select completed_at from public.lesson_progress where user_id = $1 order by lesson_id", [CLAUDIO.id]);
    const page = await visit(LessonPage, { params: { slug: "c2-l03" } });
    expect(page.redirect).toBeNull();
    expect(page.text).toContain("Você já concluiu esta lição.");
    expect(await finishLesson("c2-l03")).toMatchObject({ redirect: "/ciclo/c2?concluida=c2-l03" });
    const after = await world.sql<{ completed_at: string }>("select completed_at from public.lesson_progress where user_id = $1 order by lesson_id", [CLAUDIO.id]);
    expect(after).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------
// HISTÓRIA 4 · Claudião acompanha as pessoas
// ---------------------------------------------------------------------------------------------

describe("Claudião, administrador: acompanha as pessoas", () => {
  it("a lista mostra cada pessoa na situação certa (quem parou de vir aparece como parado)", async () => {
    await world.login(CLAUDIAO);
    const list = await visit(PeoplePage);
    expect(list.text).toContain("3 pessoas");
    const item = (name: string) => list.text.slice(list.text.indexOf(name), list.text.indexOf(name) + 200);
    expect(item("Claudio")).toContain("Concluiu a trilha");
    expect(item("Claudio")).toContain("28 lições concluídas");
    // Passaram-se mais de 100 dias desde que o Claudinho esteve aqui: o pastor precisa enxergar isso.
    expect(item("Claudinho da Silva")).toContain("Parado");
    expect(item("Claudinho da Silva")).toContain("3 lições concluídas");
    expect(item("Claudinho da Silva")).toMatch(/última atividade há \d+ (dias|meses)/);
    // O administrador nunca fez a trilha e não é "parado": o alerta é para membros.
    expect(item("Claudião")).toContain("Administrador");
    expect(item("Claudião")).not.toContain("Parado");
  });

  it("filtra quem está parado e busca por nome", async () => {
    const stalled = await visit(PeoplePage, { search: { situacao: "stalled" } });
    expect(stalled.text).toContain("1 pessoa com estes filtros");
    expect(stalled.text).toContain("Claudinho da Silva");
    expect((await visit(PeoplePage, { search: { situacao: "in_progress" } })).text).toContain("Nenhuma pessoa encontrada.");
    expect((await visit(PeoplePage, { search: { q: "cláud" } })).text).toContain("3 pessoas"); // a busca ignora acentos
    expect((await visit(PeoplePage, { search: { q: "CLAUDIÃO" } })).text).toContain("1 pessoa");
    expect((await visit(PeoplePage, { search: { q: "zzz" } })).text).toContain("Nenhuma pessoa");
  });

  it("o painel mostra os números da igreja: só membros contam, e quem parou de vir aparece", async () => {
    const page = await visit(DashboardPage);
    expect(page.text).toContain("Painel");
    expect(page.text).toContain("2 membros no total"); // Claudinho e Claudio; o administrador fica de fora
    expect(page.text).toMatch(/Parados 1/);
    expect(page.text).toMatch(/Concluíram a trilha 1/);
    expect(page.text).toContain("Ver quem está parado");
    expect(page.text).toContain("Fundamentos");
    // Nos últimos 30 dias ninguém novo entrou (todos chegaram há mais de 100 dias).
    expect(page.text).toMatch(/Novos em 30 dias 0/);
    const ninety = await visit(DashboardPage, { search: { dias: "90" } });
    expect(ninety.text).toContain("Novos em 90 dias");
    expect(ninety.text).toContain("Onde as pessoas estão");
  });

  it("o funil mostra em que lição mais gente concluiu e onde alguém parou", async () => {
    const page = await visit(DashboardPage);
    expect(page.text).toContain("Lição por lição");
    expect(page.text).toContain("Bem-vindo(a) à família de Deus");
    const lessons = (await client().rpc("content_metrics")).data as { slug: string; started: number; completed: number }[];
    expect(lessons.find((l) => l.slug === "c1-l01")).toMatchObject({ started: 2, completed: 2 });
    // Só o Claudio chegou na 4ª lição; o Claudinho parou na 3ª.
    expect(lessons.find((l) => l.slug === "c1-l04")).toMatchObject({ started: 1, completed: 1 });
  });

  it("edita os textos de Nossa Igreja e os membros passam a ver a mudança", async () => {
    const editor = await visit(EditChurchPage);
    expect(editor.html).toContain('value="Nossa visão"');
    expect(editor.html).toContain('value="Nossos valores"');

    const saved = await outcome(() =>
      saveChurchPage("values", form({ title: "Nossos valores", body: "1. Jesus no centro.\r\n\r\n2. A Palavra de Deus." })),
    );
    expect(decodeURIComponent(saved.redirect!.replace(/\+/g, " "))).toContain("Página salva");

    const [row] = await world.sql<{ body: string; updated_by: string }>("select body, updated_by from public.church_pages where slug = 'values'");
    expect(row.body).toBe("1. Jesus no centro.\n\n2. A Palavra de Deus.");
    expect(row.updated_by).toBe(CLAUDIAO.id); // carimbado pelo banco, não pelo navegador
    expect(await world.sql("select 1 from public.audit_log where action = 'church_page_updated' and entity_id = 'values'")).toHaveLength(1);

    await world.login(CLAUDINHO);
    const member = await visit(ChurchPage);
    expect(member.text).toContain("1. Jesus no centro.");
    expect(member.text).toContain("2. A Palavra de Deus.");
    await world.login(CLAUDIAO);
  });

  it("um título em branco não é aceito, e um membro não edita nem pela tela, nem pela ação, nem pelo banco", async () => {
    const blank = await outcome(() => saveChurchPage("values", form({ title: "  ", body: "x" })));
    expect(decodeURIComponent(blank.redirect!.replace(/\+/g, " "))).toContain("título");

    await world.login(CLAUDINHO);
    expect((await visit(EditChurchPage)).redirect).toBe("/");
    expect((await outcome(() => saveChurchPage("values", form({ title: "Hack", body: "hack" })))).redirect).toBe("/");
    const direct = await client().from("church_pages").update({ body: "hack" }).eq("slug", "values").select("slug");
    expect(direct.data).toEqual([]); // a política do banco esconde a linha
    await world.login(CLAUDIAO);
  });

  it("a ficha mostra o progresso lição a lição, o contato e os consentimentos", async () => {
    const page = await visit(PersonPage, { params: { id: CLAUDINHO.id! } });
    expect(page.text).toContain("Claudinho da Silva");
    expect(page.text).toContain("+55 (11) 91234-5678");
    expect(page.text).toContain("NVI"); // a versão que ele escolheu no próprio perfil
    expect(page.text).toMatch(/Concluída em \d{2}\/\d{2}\/\d{4}/);
    expect(page.text).toContain("Tratamento dos dados");
    expect(page.text).toContain("Lembretes por WhatsApp");
    expect(page.text).toContain("Perfil de acesso");
  });

  it("abrir a ficha de alguém fica registrado no log, e abrir a própria não", async () => {
    await world.login(CLAUDIAO);
    await visit(PersonPage, { params: { id: CLAUDIO.id! } });
    await visit(PersonPage, { params: { id: CLAUDIO.id! } }); // repetir logo em seguida não duplica
    const rows = await world.sql<{ actor_id: string }>("select actor_id from public.audit_log where action = 'person_viewed' and entity_id = $1", [CLAUDIO.id]);
    expect(rows).toEqual([{ actor_id: CLAUDIAO.id }]);
    await visit(PersonPage, { params: { id: CLAUDIAO.id! } });
    expect(await world.sql("select 1 from public.audit_log where action = 'person_viewed' and entity_id = $1", [CLAUDIAO.id])).toHaveLength(0);
  });

  it("um endereço de ficha inválido ou inexistente dá 'não encontrado', não erro", async () => {
    expect((await visit(PersonPage, { params: { id: "não-é-um-id" } })).notFound).toBe(true);
    expect((await visit(PersonPage, { params: { id: "00000000-0000-4000-8000-000000000000" } })).notFound).toBe(true);
  });

  it("promove Claudio a editor, e isso fica no histórico da ficha", async () => {
    const changed = await outcome(() => changeRole(CLAUDIO.id!, form({ role: "editor" })));
    expect(changed.redirect).toBe(`/admin/pessoas/${CLAUDIO.id}?ok=Perfil+atualizado.`);
    const page = await visit(PersonPage, { params: { id: CLAUDIO.id! } });
    expect(page.text).toContain("Membro → Editor");
    expect(page.text).toContain("por Claudião");
  });

  it("Claudio, agora editor, vê o painel de conteúdo mas não os dados pessoais, e não publica", async () => {
    await world.login(CLAUDIO);
    const trail = await visit(AdminTrailPage);
    expect(trail.redirect).toBeNull();
    expect(trail.text).not.toContain("Configurações do ciclo"); // só o administrador
    expect((await visit(PeoplePage)).redirect).toBe("/admin/trilha");
    expect((await visit(PersonPage, { params: { id: CLAUDINHO.id! } })).redirect).toBe("/admin/trilha");

    // Numa lição publicada, o editor não salva nem muda o status.
    const lesson = (await loadLessonForEditing(client(), "c1-l05"))!;
    const blocked = await saveLesson("c1-l05", lesson.currentVersionId, payloadOf(lesson, { title: "Tentativa" }));
    expect(blocked).toMatchObject({ ok: false });
    expect((blocked as { error: string }).error).toMatch(/permissão/);
    expect(await changeLessonStatus("c1-l05", "archived")).toMatchObject({ ok: false });

    // A tela dele avisa que é somente leitura.
    const editor = await visit(EditLessonPage, { params: { slug: "c1-l05" } });
    expect(editor.text).toContain("Só o administrador pode alterá-la");
  });

  it("o editor cria uma lição nova, edita e a envia para revisão; só o administrador publica", async () => {
    const cycleId = (await world.sql<{ id: string }>("select id from public.cycles where slug = 'c3'"))[0].id;
    const created = await outcome(() => createLesson(cycleId, form({ title: "Lição extra do Ciclo 3" })));
    expect(created.redirect).toBe("/admin/licao/c3-l13");

    const lesson = (await loadLessonForEditing(client(), "c3-l13"))!;
    expect(lesson.status).toBe("draft");
    const content = { blocks: [{ type: "paragraph" as const, text: "Texto da lição extra (João 3.16)." }], practice: null, reflection: null };
    expect(await saveLesson("c3-l13", lesson.currentVersionId, payloadOf(lesson, { content }))).toMatchObject({ ok: true });

    expect(await changeLessonStatus("c3-l13", "in_review")).toEqual({ ok: true });
    expect(await changeLessonStatus("c3-l13", "published")).toMatchObject({ ok: false });

    await world.login(CLAUDIAO);
    expect(await changeLessonStatus("c3-l13", "published")).toEqual({ ok: true });
  });

  it("uma lição obrigatória nova tira Claudio de 'concluiu a trilha', e ele a recebe como próxima", async () => {
    const list = await visit(PeoplePage, { search: { q: "Claudio" } });
    expect(list.text).toContain("Em andamento");

    await world.login(CLAUDIO);
    await world.passDays(4);
    const home = await visit(HomePage);
    expect(home.text).toContain("Lição extra do Ciclo 3");
  });

  it("volta Claudio a membro; ninguém altera o próprio perfil; e o último administrador é protegido", async () => {
    await world.login(CLAUDIAO);
    expect((await outcome(() => changeRole(CLAUDIO.id!, form({ role: "member" })))).redirect).toContain("ok=Perfil+atualizado.");

    const self = await outcome(() => changeRole(CLAUDIAO.id!, form({ role: "member" })));
    expect(self.redirect).toContain("erro=");
    expect(decodeURIComponent(self.redirect!.replace(/\+/g, " "))).toMatch(/próprio perfil/);

    const [{ role }] = await world.sql<{ role: string }>("select role from public.profiles where id = $1", [CLAUDIAO.id]);
    expect(role).toBe("admin");
    // Direto no banco: o último administrador nunca é removido.
    const rpc = await client().rpc("admin_set_role", { target: CLAUDIAO.id, new_role: "member" });
    expect(rpc.error?.message).toMatch(/último administrador/);
  });

  it("reordena e arquiva lições; quem já concluiu uma lição arquivada continua a ver o progresso", async () => {
    const [{ id: extraId }] = await world.sql<{ id: string }>("select id from public.lessons where slug = 'c3-l13'");
    const [{ id: l12 }] = await world.sql<{ id: string }>("select id from public.lessons where slug = 'c3-l12'");

    expect((await outcome(() => moveLesson(extraId, "up"))).redirect).toBe("/admin/trilha");
    const pos = await world.sql<{ slug: string; position: number }>("select slug, position from public.lessons where slug in ('c3-l12','c3-l13') order by slug");
    expect(pos).toEqual([{ slug: "c3-l12", position: 13 }, { slug: "c3-l13", position: 12 }]);
    await outcome(() => moveLesson(l12, "up")); // devolve à ordem original

    expect(await changeLessonStatus("c3-l13", "archived")).toEqual({ ok: true });
    const logged = await world.sql<{ n: number }>("select count(*)::int as n from public.audit_log where action = 'lesson_status_changed'");
    expect(logged[0].n).toBeGreaterThan(28);
  });
});

// ---------------------------------------------------------------------------------------------
// HISTÓRIA 4b · lição arquivada (RN-11)
// ---------------------------------------------------------------------------------------------

describe("Claudião arquiva lições: quem já concluiu continua podendo reler", () => {
  it("a lição arquivada some da trilha, mas segue aberta (só leitura) para quem a concluiu", async () => {
    await world.login(CLAUDIAO);
    expect(await changeLessonStatus("c1-l01", "archived")).toEqual({ ok: true });
    expect(await changeLessonStatus("c1-l08", "archived")).toEqual({ ok: true });

    // Claudinho concluiu a c1-l01 (mas não a c1-l08).
    await world.login(CLAUDINHO);
    const trail = await loadTrail(client(), CLAUDINHO.id!);
    expect(trail.cycles[0].lessons.map((l) => l.slug)).not.toContain("c1-l01");

    const cycle = await visit(CyclePage, { params: { slug: "c1" } });
    expect(cycle.text).toContain("Lições que saíram da trilha");
    expect(cycle.text).toContain("Bem-vindo(a) à família de Deus");
    expect(cycle.text).not.toContain("Nossa igreja, quem somos"); // a c1-l08 ele nunca concluiu

    const reread = await visit(LessonPage, { params: { slug: "c1-l01" } });
    expect(reread.redirect).toBeNull();
    expect(reread.text).toContain("Esta lição saiu da trilha");
    expect(reread.text).toContain("Objetivo:");
    expect(reread.text).not.toContain("Concluir lição"); // só leitura: nada a concluir
  });

  it("quem nunca a concluiu não a enxerga: 'não encontrada', e o banco não a entrega", async () => {
    expect((await visit(LessonPage, { params: { slug: "c1-l08" } })).notFound).toBe(true);
    const direct = await client().from("lessons").select("slug").eq("slug", "c1-l08");
    expect(direct.data).toEqual([]);
  });

  it("uma lição que nunca existiu também dá 'não encontrada' (sem revelar nada)", async () => {
    expect((await visit(LessonPage, { params: { slug: "nao-existe" } })).notFound).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// HISTÓRIA 4c · o Claudião liga e desliga recursos (RF-28)
// ---------------------------------------------------------------------------------------------

describe("Claudião, administrador: liga e desliga recursos", () => {
  it("a tela mostra todos os recursos desligados, com o nome da igreja", async () => {
    await world.login(CLAUDIAO);
    const page = await visit(SettingsPage);
    expect(page.html).toContain('value="Vertical Church"');
    expect(page.text).toContain("Quiz das lições");
    expect(page.text).toContain("Grupo de Discipulado");
    expect(page.html).not.toContain("checked");
    expect(Object.values((await loadSettings(client())).flags).every((v) => v === false)).toBe(true);
  });

  it("liga o quiz, a mudança vale para todos e fica registrada; desligar volta ao que era", async () => {
    const saved = await outcome(() => saveSettings(form({ church_name: "Igreja Vertical", contact_email: "contato@igreja.org", feature_quiz: true })));
    expect(decodeURIComponent(saved.redirect!.replace(/\+/g, " "))).toContain("Configurações salvas");

    await world.login(CLAUDINHO);
    const asMember = await loadSettings(client());
    expect(asMember.flags.quiz).toBe(true);
    expect(asMember.flags.groups).toBe(false);
    expect(asMember.church).toEqual({ name: "Igreja Vertical", contactEmail: "contato@igreja.org" });

    await world.login(CLAUDIAO);
    expect((await visit(SettingsPage)).html).toMatch(/name="feature_quiz"[^>]*checked/);
    const log = await world.sql<{ details: { key: string; value: boolean } }>(
      "select details from public.audit_log where action = 'setting_changed' and entity_id = 'feature.quiz'",
    );
    expect(log.length).toBeGreaterThanOrEqual(1);

    await outcome(() => saveSettings(form({ church_name: "Igreja Vertical", contact_email: "" })));
    expect((await loadSettings(client())).flags.quiz).toBe(false);
  });

  it("nome em branco e e-mail inválido não são aceitos", async () => {
    const blank = await outcome(() => saveSettings(form({ church_name: "  ", contact_email: "" })));
    expect(decodeURIComponent(blank.redirect!.replace(/\+/g, " "))).toContain("nome da igreja");
    const bad = await outcome(() => saveSettings(form({ church_name: "Igreja", contact_email: "sem-arroba" })));
    expect(decodeURIComponent(bad.redirect!.replace(/\+/g, " "))).toContain("e-mail");
  });

  it("um membro não abre a tela, não salva pela ação e não altera pelo banco", async () => {
    await world.login(CLAUDINHO);
    expect((await visit(SettingsPage)).redirect).toBe("/");
    expect((await outcome(() => saveSettings(form({ church_name: "Hack", feature_groups: true })))).redirect).toBe("/");
    const direct = await client().from("app_settings").update({ value: true }).eq("key", "feature.groups").select("key");
    expect(direct.data).toEqual([]);
    expect((await loadSettings(client())).flags.groups).toBe(false);
    await world.login(CLAUDIAO);
  });
});

// ---------------------------------------------------------------------------------------------
// HISTÓRIA 4d · quiz, prática e reflexão (RF-12, RF-13, RN-02, RN-03), com os recursos ligados pelo Claudião
// ---------------------------------------------------------------------------------------------

describe("Claudinho faz o quiz, marca a prática e escreve a reflexão", () => {
  let slug = "";
  let lessonId = "";
  let questions: { position: number; correct_option: string; explanation: string }[] = [];

  const answersFor = (right: number) =>
    form(Object.fromEntries(questions.map((q, i) => [`q${q.position}`, i < right ? q.correct_option : q.correct_option === "A" ? "B" : "A"])));
  const idle = { status: "idle" } as const;

  it("o Claudião liga o quiz e a reflexão", async () => {
    await world.login(CLAUDIAO);
    const saved = await outcome(() => saveSettings(form({ church_name: "Vertical Church", contact_email: "", feature_quiz: true, feature_reflections: true })));
    expect(decodeURIComponent(saved.redirect!.replace(/\+/g, " "))).toContain("Configurações salvas");
  });

  it("a próxima lição do Claudinho mostra o quiz sem entregar o gabarito, e o botão de concluir fica escondido", async () => {
    await world.login(CLAUDINHO);
    let trail = await loadTrail(client(), CLAUDINHO.id!);
    if (!trail.current?.lessons.some((l) => l.state.state === "available" || l.state.state === "in_progress")) {
      await world.passDays(10);
      trail = await loadTrail(client(), CLAUDINHO.id!);
    }
    const item = trail.current!.lessons.find((l) => l.state.state === "available" || l.state.state === "in_progress")!;
    slug = item.slug;
    lessonId = item.id;
    questions = await world.sql(
      "select position, correct_option, explanation from public.quiz_questions where lesson_id = $1 order by position",
      [lessonId],
    );
    expect(questions.length).toBeGreaterThanOrEqual(2);

    const page = await visit(LessonPage, { params: { slug } });
    expect(page.text).toContain("Para fixar");
    expect(page.text).toContain(`Acerte pelo menos ${Math.max(1, Math.ceil((questions.length * 2) / 3))} de ${questions.length}`);
    expect(page.text).toContain("Responda ao quiz acima");
    expect(page.text).not.toContain("Concluir lição");
    for (const q of questions) if (q.explanation) expect(page.text).not.toContain(q.explanation);
    expect(page.text).toContain("Sua prática");
  });

  it("concluir sem ser aprovado não funciona: nem pela ação, nem direto no banco", async () => {
    await openLesson(slug); // o navegador faz isso ao abrir a lição
    const attempt = await outcome(() => completeLesson(slug));
    expect(attempt.redirect).toBe(`/licao/${slug}?quiz=1`);
    const direct = await client().from("lesson_progress").update({ status: "completed", completed_at: new Date().toISOString() }).eq("lesson_id", lessonId);
    expect(direct.error?.message).toMatch(/acerte o quiz/);
    expect(await world.sql("select 1 from public.lesson_progress where user_id = $1 and lesson_id = $2 and status = 'completed'", [CLAUDINHO.id, lessonId])).toHaveLength(0);
  });

  it("responder pela metade pede que responda tudo; errar não aprova e não entrega o gabarito", async () => {
    const partial = await submitQuiz(slug, idle, form({ [`q${questions[0].position}`]: "A" }));
    expect(partial).toMatchObject({ status: "error", message: expect.stringMatching(/todas as perguntas/) });

    const failed = await submitQuiz(slug, idle, answersFor(0));
    expect(failed).toMatchObject({ status: "done", result: { correctCount: 0, passed: false } });
    expect(JSON.stringify(failed)).not.toContain("correct_option");
  });

  it("acertar aprova, o botão de concluir aparece e a lição conclui", async () => {
    const passed = await submitQuiz(slug, idle, answersFor(questions.length));
    expect(passed).toMatchObject({ status: "done", result: { correctCount: questions.length, passed: true } });

    const page = await visit(LessonPage, { params: { slug } });
    expect(page.text).toContain("Você já foi aprovado neste quiz");
    expect(page.text).toContain("Concluir lição");

    const done = await outcome(() => completeLesson(slug));
    expect(done.redirect).toContain(`concluida=${slug}`);
    expect(await world.sql("select 1 from public.quiz_attempts where user_id = $1 and lesson_id = $2", [CLAUDINHO.id, lessonId])).toHaveLength(2);
  });

  it("marca a prática, escreve a reflexão; texto grande demais é recusado", async () => {
    await outcome(() => togglePractice(slug, form({ done: "1" })));
    expect((await world.sql<{ practice_done: boolean }>("select practice_done from public.lesson_progress where user_id = $1 and lesson_id = $2", [CLAUDINHO.id, lessonId]))[0].practice_done).toBe(true);

    const saved = await outcome(() => saveReflection(slug, form({ body: "Deus me mostrou que preciso perdoar." })));
    expect(saved.redirect).toContain("salvo=reflexao");
    const page = await visit(LessonPage, { params: { slug }, search: { salvo: "reflexao" } });
    expect(page.html).toContain("Deus me mostrou que preciso perdoar.");
    expect(page.text).toContain("Prática feita");
    expect(page.text).toContain("Reflexão salva");

    const big = await outcome(() => saveReflection(slug, form({ body: "x".repeat(5001) })));
    expect(decodeURIComponent(big.redirect!.replace(/\+/g, " "))).toContain("no máximo 5000");
    expect(await world.sql("select 1 from public.reflections where user_id = $1", [CLAUDINHO.id])).toHaveLength(1);
  });

  it("o Claudião lê a reflexão na ficha do Claudinho, e a consulta fica registrada", async () => {
    await world.login(CLAUDIAO);
    const before = await world.sql("select 1 from public.audit_log where action = 'reflections_viewed'");
    const page = await visit(PersonPage, { params: { id: CLAUDINHO.id! } });
    expect(page.text).toContain("Reflexões");
    expect(page.text).toContain("Deus me mostrou que preciso perdoar.");
    expect(await world.sql("select 1 from public.audit_log where action = 'reflections_viewed'")).toHaveLength(before.length + 1);
  });

  it("o arquivo de dados do Claudinho inclui a reflexão e as tentativas de quiz", async () => {
    await world.login(CLAUDINHO);
    const data = JSON.parse(await (await exportMyData()).text());
    expect(data.reflexoes).toHaveLength(1);
    expect(data.reflexoes[0]).toMatchObject({ licao: slug, texto: "Deus me mostrou que preciso perdoar." });
    expect(data.tentativas_de_quiz.map((t: { aprovado: boolean }) => t.aprovado)).toEqual([false, true]);
  });

  it("o Claudio (outra pessoa) não lê a reflexão do Claudinho pelo banco", async () => {
    await world.login(CLAUDIO);
    expect((await client().from("reflections").select("body")).data).toEqual([]);
    expect((await client().rpc("person_reflections", { p_target: CLAUDINHO.id })).error?.message).toMatch(/não autorizado/);
  });

  it("com os recursos desligados de novo, a lição volta a ser a do MVP e a ficha não mostra reflexões", async () => {
    await world.login(CLAUDIAO);
    await outcome(() => saveSettings(form({ church_name: "Vertical Church", contact_email: "" })));
    expect((await visit(PersonPage, { params: { id: CLAUDINHO.id! } })).text).not.toContain("Reflexões");

    await world.login(CLAUDINHO);
    const page = await visit(LessonPage, { params: { slug } });
    expect(page.text).not.toContain("Para fixar");
    expect(page.text).not.toContain("Sua prática");
    // A reflexão já escrita continua guardada (nada é apagado ao desligar).
    expect(await world.sql("select 1 from public.reflections where user_id = $1", [CLAUDINHO.id])).toHaveLength(1);

    // Devolve o estado anterior para as próximas histórias.
    await world.sql("delete from public.reflections");
    await world.sql("delete from public.quiz_attempts");
    await world.sql("delete from public.lesson_progress where user_id = $1 and lesson_id = $2", [CLAUDINHO.id, lessonId]);
    await world.login(CLAUDIAO);
  });
});

// ---------------------------------------------------------------------------------------------
// HISTÓRIA 4e · cuidadores e alertas de quem parou (RF-20, RF-21, RF-25, RN-07, RN-13)
// O Claudio vira cuidador e recebe o Claudinho.
// ---------------------------------------------------------------------------------------------

describe("Cuidado: o Claudio cuida do Claudinho, e o alerta aparece quando ele para", () => {
  const shiftClaudinho = (days: number) =>
    world.sql(
      `update public.lesson_progress set
         started_at = started_at - $2::interval, completed_at = completed_at - $2::interval, updated_at = updated_at - $2::interval
       where user_id = $1`,
      [CLAUDINHO.id, `${days} days`],
    );

  it("com o recurso desligado, ninguém tem tela de cuidado; o Admin já pode se organizar", async () => {
    await world.login(CLAUDIAO);
    expect((await visit(CareAdminPage)).text).toContain("está desligado");
    await outcome(() => changeRole(CLAUDIO.id!, form({ role: "caregiver" })));
    await world.login(CLAUDIO);
    expect((await visit(CarePage)).redirect).toBe("/"); // perfil certo, recurso desligado
  });

  it("o Claudião liga o recurso; o Claudinho aparece na fila e é atribuído ao Claudio", async () => {
    await world.login(CLAUDIAO);
    await outcome(() => saveSettings(form({ church_name: "Vertical Church", contact_email: "", feature_caregivers: true, feature_reflections: true })));

    const page = await visit(CareAdminPage);
    expect(page.text).not.toContain("está desligado");
    expect(page.text).toContain("Sem cuidador");
    expect(page.text).toContain("Claudinho da Silva");

    const assigned = await outcome(() => assignCaregiver(CLAUDINHO.id!, form({ caregiver: CLAUDIO.id!, from: `/admin/pessoas/${CLAUDINHO.id}` })));
    expect(assigned.redirect).toContain(`/admin/pessoas/${CLAUDINHO.id}`);
    expect(decodeURIComponent(assigned.redirect!.replace(/\+/g, " "))).toContain("Cuidador atribuído");

    const ficha = await visit(PersonPage, { params: { id: CLAUDINHO.id! } });
    expect(ficha.text).toContain("Atual: Claudio");
    expect(ficha.text).toContain("Cuidador atribuído"); // no histórico
  });

  it("o Claudio vê o Claudinho na lista, com o contato e o progresso dele", async () => {
    await world.login(CLAUDIO);
    const list = await visit(CarePage);
    expect(list.text).toContain("Meus membros");
    expect(list.text).toContain("Claudinho da Silva");
    expect(list.text).not.toContain("Claudião");

    const ficha = await visit(CareMemberPage, { params: { id: CLAUDINHO.id! } });
    expect(ficha.text).toContain("+55 (11) 91234-5678");
    expect(ficha.html).toContain("https://wa.me/5511912345678");
    expect(ficha.text).toMatch(/Concluída em \d{2}\/\d{2}\/\d{4}/);
    expect(ficha.text).toContain("Notas de cuidado");
    expect(await world.sql("select 1 from public.audit_log where action = 'person_viewed' and actor_id = $1", [CLAUDIO.id])).toHaveLength(1);
  });

  it("o cuidador não abre quem não é dele, e o Claudinho (membro) não tem essa tela", async () => {
    await world.login(CLAUDIO);
    expect((await visit(CareMemberPage, { params: { id: CLAUDIAO.id! } })).notFound).toBe(true);
    expect((await visit(CareMemberPage, { params: { id: "não-é-uuid" } })).notFound).toBe(true);
    expect((await client().from("lesson_progress").select("user_id").eq("user_id", CLAUDIAO.id!)).data).toEqual([]);

    await world.login(CLAUDINHO);
    expect((await visit(CarePage)).redirect).toBe("/");
    expect((await visit(CareMemberPage, { params: { id: CLAUDINHO.id! } })).redirect).toBe("/");
    expect((await outcome(() => addCareNote(CLAUDINHO.id!, form({ body: "x" })))).redirect).toBe("/");
    expect((await client().from("care_alerts").select("id")).data).toEqual([]);
    expect((await client().from("care_assignments").select("id")).data).toEqual([]);
  });

  it("a reflexão do Claudinho aparece para o cuidador dele, e a consulta fica registrada", async () => {
    await world.sql(
      "insert into public.reflections (user_id, lesson_id, body) select $1, id, 'Estou cansado, mas firme.' from public.lessons where slug = 'c1-l02'",
      [CLAUDINHO.id],
    );
    await world.login(CLAUDIO);
    const ficha = await visit(CareMemberPage, { params: { id: CLAUDINHO.id! } });
    expect(ficha.text).toContain("Estou cansado, mas firme.");
    expect(await world.sql("select 1 from public.audit_log where action = 'reflections_viewed' and actor_id = $1", [CLAUDIO.id])).not.toHaveLength(0);
    await world.sql("delete from public.reflections");
  });

  it("o cuidador escreve uma nota, o Claudião a lê na ficha, e outro cuidador não a vê", async () => {
    await world.login(CLAUDIO);
    const saved = await outcome(() => addCareNote(CLAUDINHO.id!, form({ body: "Conversamos após o culto. Pediu oração pelo trabalho." })));
    expect(decodeURIComponent(saved.redirect!.replace(/\+/g, " "))).toContain("Nota salva");
    expect((await visit(CareMemberPage, { params: { id: CLAUDINHO.id! } })).text).toContain("Pediu oração pelo trabalho.");

    const empty = await outcome(() => addCareNote(CLAUDINHO.id!, form({ body: "   " })));
    expect(decodeURIComponent(empty.redirect!.replace(/\+/g, " "))).toContain("Escreva a nota");

    await world.login(CLAUDIAO);
    const adminView = await visit(PersonPage, { params: { id: CLAUDINHO.id! } });
    expect(adminView.text).toContain("Pediu oração pelo trabalho.");
    expect(adminView.text).toContain("por Claudio");
  });

  it("14 dias sem ler: o alerta abre sozinho; o cuidador marca 'em contato' e resolve", async () => {
    await shiftClaudinho(20);
    await world.login(CLAUDIO);
    const list = await visit(CarePage);
    expect(list.text).toContain("Alerta: Aberto");
    expect(list.text).toContain("Parado");

    const ficha = await visit(CareMemberPage, { params: { id: CLAUDINHO.id! } });
    expect(ficha.text).toContain("Pedido de contato");
    const [alert] = await world.sql<{ id: string }>("select id from public.care_alerts where status <> 'resolved'");

    await outcome(() => updateCareAlert(CLAUDINHO.id!, form({ alert: alert.id, status: "in_contact" })));
    expect((await visit(CarePage)).text).toContain("Alerta: Em contato");

    const done = await outcome(() => updateCareAlert(CLAUDINHO.id!, form({ alert: alert.id, status: "resolved", resolution: "Conversamos por telefone." })));
    expect(decodeURIComponent(done.redirect!.replace(/\+/g, " "))).toContain("Alerta resolvido");
    expect(await world.sql("select 1 from public.care_alerts where status = 'resolved' and resolution = 'Conversamos por telefone.'")).toHaveLength(1);
    expect((await visit(CarePage)).text).not.toContain("Alerta: Aberto"); // nada de alerta repetido logo depois do contato
    await shiftClaudinho(-20);
  });

  it("o Claudião vê os alertas de quem não tem cuidador e cuida deles", async () => {
    await world.login(CLAUDIAO);
    await outcome(() => unassignCaregiver(CLAUDINHO.id!));
    await shiftClaudinho(40);
    await world.sql("update public.care_alerts set resolved_at = now() - interval '30 days'");
    const page = await visit(CareAdminPage);
    expect(page.text).toContain("Alertas de quem parou");
    expect(page.text).toContain("sem cuidador (você cuida deste)");
    const [alert] = await world.sql<{ id: string }>("select id from public.care_alerts where status <> 'resolved'");
    await outcome(() => updateAdminAlert(CLAUDINHO.id!, form({ alert: alert.id, status: "resolved", resolution: "" })));
    expect(await world.sql("select 1 from public.care_alerts where status <> 'resolved'")).toHaveLength(0);
    await shiftClaudinho(-40);
  });

  it("o rodízio distribui a fila, e perder o perfil de cuidador devolve o membro para a fila", async () => {
    await world.login(CLAUDIAO);
    const auto = await outcome(() => autoAssignCaregivers());
    expect(decodeURIComponent(auto.redirect!.replace(/\+/g, " "))).toMatch(/atribuído/);
    expect(await world.sql("select 1 from public.care_assignments where active and caregiver_id = $1", [CLAUDIO.id])).not.toHaveLength(0);

    await outcome(() => changeRole(CLAUDIO.id!, form({ role: "member" })));
    expect(await world.sql("select 1 from public.care_assignments where active")).toHaveLength(0);
    expect((await visit(CareAdminPage)).text).toContain("Claudinho da Silva");
  });

  it("desliga o recurso e devolve o estado anterior", async () => {
    await world.login(CLAUDIAO);
    await outcome(() => saveSettings(form({ church_name: "Vertical Church", contact_email: "" })));
    await world.sql("delete from public.care_notes");
    await world.sql("delete from public.care_alerts");
    await world.sql("delete from public.care_assignments");
  });
});

// ---------------------------------------------------------------------------------------------
// HISTÓRIA 4f · lembretes por e-mail (RF-16, seção 10)
// O Claudião liga os lembretes e ajusta um texto; o Claudinho sumiu por 5 dias e recebe um convite gentil.
// ---------------------------------------------------------------------------------------------

describe("Lembretes por e-mail: o Claudinho sumiu por alguns dias", () => {
  const SECRET = "segredo-do-teste-e2e-com-mais-de-32-caracteres";
  const SITE = "https://discipulado.example.org";
  const fake = new FakeEmailProvider();
  /** Meio-dia de Brasília de hoje: dentro do horário de envio, seja qual for a hora em que o teste roda. */
  const noon = () => {
    const d = new Date();
    d.setUTCHours(15, 0, 0, 0);
    return d;
  };
  const run = async (now = noon(), provider: EmailProvider = fake) => {
    world.visitor(); // o agendador não tem sessão
    return runReminders({ supabase: client(), secret: SECRET, provider, siteUrl: SITE, now });
  };
  /** Ajusta os carimbos do Claudinho para que a última atividade dele tenha sido há `days` dias. */
  const makeIdle = async (days: number) => {
    const [row] = await world.sql<{ last: Date }>(
      "select greatest(max(updated_at), max(started_at), max(completed_at)) as last from public.lesson_progress where user_id = $1",
      [CLAUDINHO.id],
    );
    const idleNow = (Date.now() - new Date(row.last).getTime()) / 1000;
    const secs = -(days * 86_400 - idleNow);
    await world.sql(
      `update public.lesson_progress set started_at = started_at + make_interval(secs => $2),
         completed_at = completed_at + make_interval(secs => $2), updated_at = updated_at + make_interval(secs => $2)
       where user_id = $1`,
      [CLAUDINHO.id, secs],
    );
  };
  let unsubscribeToken = "";

  it("o Claudião prepara o envio: segredo no banco, recurso ligado e um texto ajustado", async () => {
    await world.sql("insert into public.app_config (key, value) values ('cron_secret_hash', encode(sha256(convert_to($1, 'UTF8')), 'hex'))", [SECRET]);
    await world.sql("insert into public.consents (user_id, purpose, term_version) values ($1, 'email_reminders', 'v1') on conflict do nothing", [CLAUDINHO.id]);
    await world.sql("update public.consents set revoked_at = null where user_id = $1 and purpose = 'email_reminders'", [CLAUDINHO.id]);

    await world.login(CLAUDIAO);
    const before = await visit(RemindersPage);
    expect(before.text).toContain("Lembretes por e-mail");
    expect(before.text).toContain("Boas-vindas");
    expect(before.text).toContain("Nenhum e-mail foi enviado ainda");
    expect(before.text).toContain("falta configurar"); // o serviço de e-mail ainda não está no site
    expect(before.html).not.toMatch(/RESEND_API_KEY=|re_[A-Za-z0-9]{10}/); // nunca mostra valores

    await outcome(() => saveSettings(form({ church_name: "Vertical Church", contact_email: "", feature_reminders: true })));

    const bad = await outcome(() => saveEmailTemplate("nudge_3d", form({ subject: "Oi {{apelido}}", body: "Texto" })));
    expect(decodeURIComponent(bad.redirect!.replace(/\+/g, " "))).toContain("{{apelido}}");
    const good = await outcome(() =>
      saveEmailTemplate("nudge_3d", form({ subject: "Sentimos sua falta, {{nome}}", body: "Oi {{nome}}, a lição {{licao}} te espera: {{link}}" })),
    );
    expect(decodeURIComponent(good.redirect!.replace(/\+/g, " "))).toContain("Texto salvo");
    expect(await world.sql("select 1 from public.audit_log where action = 'email_template_updated' and entity_id = 'nudge_3d'")).toHaveLength(1);
  });

  it("um membro não edita os textos, nem lê o registro de envios", async () => {
    await world.login(CLAUDINHO);
    expect((await visit(RemindersPage)).redirect).toBe("/");
    expect((await outcome(() => saveEmailTemplate("nudge_3d", form({ subject: "Hack", body: "hack" })))).redirect).toBe("/");
    expect((await client().from("email_templates").select("kind")).data).toEqual([]);
    expect((await client().from("notifications").select("id")).data).toEqual([]);
    const direct = await client().from("email_templates").update({ subject: "Hack" }).eq("kind", "nudge_3d").select("kind");
    expect(direct.data).toEqual([]);
  });

  it("quem está em dia não recebe nada", async () => {
    await makeIdle(0.1);
    const result = await run();
    expect(result).toMatchObject({ status: "ok", sent: 0 });
    expect(fake.sent).toEqual([]);
  });

  it("fora do horário (3h da manhã em Brasília) nada é enviado, mesmo com alguém precisando", async () => {
    await makeIdle(5);
    const night = noon();
    night.setUTCHours(6, 0, 0, 0);
    expect(await run(night)).toEqual({ status: "outside_window" });
    expect(fake.sent).toEqual([]);
  });

  it("5 dias sem acesso: um convite gentil, com o link da lição e o de desligar; um envio que falhou aparece no registro", async () => {
    const failing = new FakeEmailProvider();
    failing.failFor.add(CLAUDINHO.email);
    const first = await run(noon(), failing);
    expect(first).toMatchObject({ status: "ok", queued: 1, sent: 0, failed: 1 });

    await world.login(CLAUDIAO);
    const log = await visit(RemindersPage);
    expect(log.text).toContain("Claudinho da Silva");
    expect(log.text).toContain("Falhou");
    expect(log.text).toContain("falha simulada");
    expect(log.text).not.toContain("claudinho@example.com"); // o registro mostra o nome, não o e-mail

    // Na rodada seguinte o envio que falhou é tentado de novo, e agora chega.
    const second = await run();
    expect(second).toMatchObject({ status: "ok", queued: 1, sent: 1, failed: 0 });
    expect(fake.sent).toHaveLength(1);
    const mail = fake.sent[0];
    expect(mail.to).toBe(CLAUDINHO.email);
    expect(mail.subject).toBe("Sentimos sua falta, Claudinho");
    expect(mail.text).toContain(`${SITE}/licao/`);
    expect(mail.text).toContain("Para não receber mais estes e-mails:");
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    unsubscribeToken = /desinscrever\?t=([0-9a-f-]{36})/.exec(mail.text)![1];

    const rows = await world.sql<{ status: string; kind: string }>("select status, kind from public.notifications");
    expect(rows).toEqual([{ status: "sent", kind: "nudge_3d" }]);
    expect(rows).toHaveLength(1); // a mesma linha foi reaproveitada, não duplicada
  });

  it("rodar de novo não repete o e-mail, e ninguém mais (equipe, quem concluiu tudo) recebe", async () => {
    expect(await run()).toMatchObject({ status: "ok", sent: 0 });
    expect(fake.sent).toHaveLength(1);
  });

  it("abrir o link do e-mail não desliga nada; só o botão de confirmação, e vale para o próximo aviso", async () => {
    world.visitor();
    const page = await visit(UnsubscribePage, { search: { t: unsubscribeToken } });
    expect(page.text).toContain("Sim, parar de receber");
    expect((await visit(UnsubscribePage, { search: { t: "lixo" } })).text).toContain("não é válido");

    const get = await unsubscribeGet(new Request(`${SITE}/api/descadastro?t=${unsubscribeToken}`));
    expect(get.status).toBe(303);
    expect(await world.sql("select 1 from public.consents where user_id = $1 and purpose = 'email_reminders' and revoked_at is null", [CLAUDINHO.id])).not.toHaveLength(0);

    expect((await unsubscribePost(new Request(`${SITE}/api/descadastro?t=lixo`, { method: "POST" }))).status).toBe(400);
    expect((await unsubscribePost(new Request(`${SITE}/api/descadastro?t=00000000-0000-4000-8000-000000000000`, { method: "POST" }))).status).toBe(404);

    const done = await unsubscribePost(new Request(`${SITE}/api/descadastro?t=${unsubscribeToken}`, { method: "POST", body: "" }));
    expect(done.status).toBe(303);
    expect(done.headers.get("location")).toContain("/desinscrever?feito=1");
    expect(await world.sql("select 1 from public.consents where user_id = $1 and purpose = 'email_reminders' and revoked_at is null", [CLAUDINHO.id])).toHaveLength(0);
    expect((await visit(UnsubscribePage, { search: { feito: "1" } })).text).toContain("Você não vai mais receber");

    // O botão "cancelar inscrição" do aplicativo de e-mail (um clique) também funciona, e repetir não dá erro.
    const oneClick = await unsubscribePost(new Request(`${SITE}/api/descadastro?t=${unsubscribeToken}`, { method: "POST", body: "List-Unsubscribe=One-Click" }));
    expect(oneClick.status).toBe(200);
  });

  it("depois de desligar, mais um período de ausência não gera e-mail", async () => {
    await makeIdle(9); // outra ausência, que seria um convite de 7 dias
    expect(await run()).toMatchObject({ status: "ok", planned: 0, sent: 0 });
    expect(fake.sent).toHaveLength(1);
  });

  it("a rota do agendador recusa quem não tem o segredo, e sem serviço de e-mail avisa o que falta", async () => {
    process.env.CRON_SECRET = SECRET;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    const call = (auth?: string) => cronGet(new Request(`${SITE}/api/cron/lembretes`, { headers: auth ? { authorization: auth } : {} }));
    expect((await call()).status).toBe(401);
    expect((await call("Bearer errado")).status).toBe(401);
    expect((await call(SECRET)).status).toBe(401); // sem o "Bearer"
    const noMail = await call(`Bearer ${SECRET}`);
    expect(noMail.status).toBe(503);
    expect(await noMail.text()).toContain("RESEND_API_KEY");
    delete process.env.CRON_SECRET;
    expect((await call(`Bearer ${SECRET}`)).status).toBe(503); // sem CRON_SECRET configurado a rota fica fechada
  });

  it("o botão de teste avisa que falta configurar o serviço de e-mail", async () => {
    await world.login(CLAUDIAO);
    const r = await outcome(() => sendTestEmail("welcome"));
    expect(decodeURIComponent(r.redirect!.replace(/\+/g, " "))).toContain("ainda não está configurado");
  });

  it("desliga o recurso e devolve o estado anterior", async () => {
    await world.login(CLAUDIAO);
    await outcome(() => saveSettings(form({ church_name: "Vertical Church", contact_email: "" })));
    world.visitor();
    expect(await runReminders({ supabase: client(), secret: SECRET, provider: fake, siteUrl: SITE, now: noon() })).toEqual({ status: "disabled" });
    await world.sql("delete from public.notifications");
  });
});

// ---------------------------------------------------------------------------------------------
// HISTÓRIA 5 · o editor vê só métricas de conteúdo; o Claudinho exclui a própria conta
// ---------------------------------------------------------------------------------------------

describe("Fechamento: o que o editor vê no painel e a exclusão de conta", () => {
  it("um editor abre o painel e vê só as métricas de conteúdo, sem nenhuma pessoa", async () => {
    await world.login(CLAUDIAO);
    await outcome(() => changeRole(CLAUDIO.id!, form({ role: "editor" })));
    await world.login(CLAUDIO);
    const page = await visit(DashboardPage);
    expect(page.text).toContain("Painel de conteúdo");
    expect(page.text).toContain("Lição por lição");
    expect(page.text).not.toContain("Ver quem está parado");
    expect(page.text).not.toMatch(/claudinho|claudiao/i);
    expect(page.text).not.toContain("membros no total");
    // Direto no banco, o editor também não alcança os indicadores das pessoas.
    expect((await client().rpc("admin_dashboard", { p_days: 30 })).error?.message).toMatch(/não autorizado/);
    await world.login(CLAUDIAO);
    await outcome(() => changeRole(CLAUDIO.id!, form({ role: "member" })));
  });

  it("a exclusão pede confirmação: sem digitar a palavra, nada acontece", async () => {
    await world.login(CLAUDINHO);
    expect(await deleteAccount(null, form({ confirm: "" }))).toMatchObject({ error: expect.stringMatching(/EXCLUIR/) });
    expect(await deleteAccount(null, form({ confirm: "sim" }))).toMatchObject({ error: expect.stringMatching(/EXCLUIR/) });
    expect(await world.sql("select 1 from public.profiles where id = $1", [CLAUDINHO.id])).toHaveLength(1);
  });

  it("o único administrador não consegue excluir a própria conta, e a mensagem diz o que fazer", async () => {
    await world.login(CLAUDIAO);
    const refused = await deleteAccount(null, form({ confirm: "excluir" }));
    expect(refused).toMatchObject({ error: expect.stringMatching(/último administrador.*Promova outra pessoa/) });
    expect(await world.sql("select 1 from public.profiles where id = $1", [CLAUDIAO.id])).toHaveLength(1);
  });

  it("o Claudinho exclui a conta: tudo dele some, o resto continua, e ele vê a confirmação no login", async () => {
    await world.login(CLAUDINHO);
    const id = CLAUDINHO.id!;
    const done = await outcome(() => deleteAccount(null, form({ confirm: "  excluir " })));
    expect(done.redirect).toBe("/login?conta=excluida");

    for (const table of ["profiles", "consents", "lesson_progress", "cycle_progress"]) {
      const column = table === "profiles" ? "id" : "user_id";
      expect(await world.sql(`select 1 from public.${table} where ${column} = $1`, [id]), table).toHaveLength(0);
    }
    expect(await world.sql("select 1 from auth.users where id = $1", [id])).toHaveLength(0);
    // O Claudio continua com todo o seu progresso.
    const [{ n }] = await world.sql<{ n: number }>("select count(*)::int as n from public.lesson_progress where user_id = $1", [CLAUDIO.id]);
    expect(n).toBe(28);

    // Na tela de login ele vê a confirmação; e a sessão dele acabou.
    expect((await visit(LoginPage, { search: { conta: "excluida" } })).text).toContain("Sua conta foi excluída");
    expect((await visit(HomePage)).redirect).toBe("/login");
  });

  it("o pastor vê que a lista de pessoas diminuiu, e o log guarda o fato sem identificar ninguém", async () => {
    await world.login(CLAUDIAO);
    expect((await visit(PeoplePage)).text).toContain("2 pessoas");
    const log = await world.sql<{ actor_id: string | null; entity_id: string | null }>("select actor_id, entity_id from public.audit_log where action = 'account_deleted'");
    expect(log).toEqual([{ actor_id: null, entity_id: null }]);
  });
});
