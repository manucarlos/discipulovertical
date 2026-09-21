/**
 * Auditoria de acessibilidade e usabilidade de TODAS as telas, do ponto de vista de cada perfil:
 * o membro novo (Claudinho), o discípulo (Claudio), o administrador (Claudião) e o editor.
 * Cada tela é aberta de verdade (o código real da página, sobre o banco em memória) e o HTML resultante
 * é conferido por auditHtml (tests/e2e/a11y.ts).
 */
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
import LoginPage from "@/app/login/page";
import TermosPage from "@/app/termos/page";
import PrivacidadePage from "@/app/privacidade/page";
import HomePage from "@/app/(member)/page";
import CyclePage from "@/app/(member)/ciclo/[slug]/page";
import LessonPage from "@/app/(member)/licao/[slug]/page";
import ChurchPage from "@/app/(member)/igreja/page";
import ProfilePage from "@/app/(member)/perfil/page";
import { completeLesson, openLesson } from "@/app/(member)/licao/[slug]/actions";
import AdminTrailPage from "@/app/admin/trilha/page";
import EditLessonPage from "@/app/admin/licao/[slug]/page";
import PreviewPage from "@/app/admin/licao/[slug]/previa/page";
import PeoplePage from "@/app/admin/pessoas/page";
import PersonPage from "@/app/admin/pessoas/[id]/page";
import DashboardPage from "@/app/admin/painel/page";
import EditChurchPage from "@/app/admin/igreja/page";
import SettingsPage from "@/app/admin/configuracoes/page";
import RemindersPage from "@/app/admin/lembretes/page";
import UnsubscribePage from "@/app/desinscrever/page";
import ClosuresPage from "@/app/admin/encerramentos/page";
import CertificatesPage from "@/app/(member)/certificados/page";
import VerifyPage from "@/app/verificar/page";
import BrandPage from "@/app/admin/marca/page";
import { importBrand, resetBrand, saveBrandColors, uploadBrandImages } from "@/app/admin/marca/actions";
import { GET as exportBrand } from "@/app/admin/marca/exportar/route";
import { GET as brandImage } from "@/app/marca/[arquivo]/route";
import { loadIdentity } from "@/lib/brand-store";
import sharp from "sharp";
import FeedbackPage from "@/app/feedback/page";
import { submitFeedback } from "@/app/feedback/actions";
import FeedbackAdminPage from "@/app/admin/feedback/page";
import { deleteFeedback } from "@/app/admin/feedback/actions";
import MyGroupsPage from "@/app/(member)/grupo/page";
import JoinGroupPage from "@/app/(member)/grupo/entrar/page";
import GroupHomePage from "@/app/(member)/grupo/[id]/page";
import GroupLessonPage from "@/app/(member)/grupo/[id]/licao/[dia]/page";
import GroupHelpFormPage from "@/app/(member)/grupo/[id]/ajuda/page";
import DisciplerHomePage from "@/app/(member)/discipulador/page";
import NewGroupPage from "@/app/(member)/discipulador/novo/page";
import GroupPanelPage from "@/app/(member)/discipulador/[id]/page";
import MeetingGuidePage from "@/app/(member)/discipulador/[id]/encontro/page";
import DiscipleFichaPage from "@/app/(member)/discipulador/[id]/discipulo/[userId]/page";
import DisciplerHelpPage from "@/app/(member)/discipulador/pedidos/page";
import AdminGroupsPage from "@/app/admin/grupos/page";
import PastoralHelpPage from "@/app/admin/pedidos-de-ajuda/page";
import CarePage from "@/app/(member)/cuidado/page";
import CareMemberPage from "@/app/(member)/cuidado/[id]/page";
import CareAdminPage from "@/app/admin/cuidado/page";
import { changeRole } from "@/app/admin/pessoas/actions";
import { MemberHeader } from "@/components/member-header";
import { AdminHeader } from "@/components/admin/admin-header";
import { renderToStaticMarkup } from "react-dom/server";
import { auditHtml } from "./a11y";
import { CLAUDIAO, CLAUDINHO, CLAUDIO, form, outcome, visit, World, type Visit } from "./world";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test";

let world: World;
const problems: string[] = [];
let audited = 0;

/** Abre a tela, confere que ela abriu de verdade (sem redirecionar) e audita o HTML. */
async function audit(name: string, page: Parameters<typeof visit>[0], args: Parameters<typeof visit>[1] = {}): Promise<Visit> {
  const result = await visit(page, args);
  expect(result.redirect, `${name} não deveria redirecionar`).toBeNull();
  expect(result.notFound, `${name} não deveria dar 404`).toBe(false);
  expect(result.html.length, `${name} veio vazia`).toBeGreaterThan(200);
  problems.push(...auditHtml(result.html, name));
  audited++;
  return result;
}

beforeAll(async () => {
  world = await World.create();
  await world.importContent({ publish: true }); // o Ciclo 3 fica em rascunho (tem [PREENCHER])
});
afterAll(async () => {
  await world.close();
});

describe("o auditor de acessibilidade pega o que deve pegar (prova de que o teste não é vazio)", () => {
  it("acusa cada tipo de falha em um HTML propositalmente ruim", () => {
    const bad = `
      <main>
        <h2>Sem h1</h2><h4>Pulou o nível</h4>
        <input name="nome"><select name="uf"></select>
        <button></button>
        <a href="/x"></a><a href="https://e.com" target="_blank">fora</a>
        <img src="/a.png">
        <a href="/logo-sem-alt"><img src="/b.png"></a>
        <div role="progressbar"></div><div role="img"></div>
        <table><tr><td>1</td></tr></table>
        <p id="a"></p><p id="a"></p><span aria-labelledby="fantasma"></span>
        <form><input type="checkbox" aria-label="ok"></form>
      </main>`;
    const found = auditHtml(bad, "ruim").join("\n");
    for (const expected of [
      "exatamente um <h1>",
      "pula do nível 2 para 4",
      'campo <input name="nome"> sem nome acessível',
      'campo <select name="uf"> sem nome acessível',
      "botão sem texto",
      "link sem texto para /x",
      "link sem texto para /logo-sem-alt", // imagem sem alt não dá nome ao link
      'rel="noopener"',
      "imagem /a.png sem alt",
      "barra de progresso sem nome",
      "barra de progresso sem aria-valuenow",
      'role="img" sem aria-label',
      "tabela sem células de cabeçalho",
      'id duplicado "a"',
      'aponta para "fantasma"',
      "formulário sem botão de envio",
    ]) {
      expect(found, expected).toContain(expected);
    }
  });

  it("não reclama de uma tela bem feita", () => {
    const good = `
      <main><h1>Título</h1><h2>Seção</h2>
        <form><label>Nome <input name="n"></label><label for="e">E-mail</label><input id="e" name="e">
          <select aria-label="Perfil"><option>A</option></select><button type="submit">Enviar</button></form>
        <a href="https://e.com" target="_blank" rel="noopener noreferrer">Fora</a>
        <a href="/"><img src="/brand/logo.png" alt="Vertical Church"></a>
        <div role="progressbar" aria-label="Progresso" aria-valuenow="10"></div>
        <table><caption>x</caption><tr><th scope="col">A</th></tr></table>
      </main>`;
    expect(auditHtml(good, "boa")).toEqual([]);
  });
});

describe("Claudinho, membro novo: cada tela que ele vê", () => {
  it("primeiro acesso, login e páginas legais", async () => {
    world.visitor();
    await audit("login", LoginPage);
    await audit("login (conta excluída)", LoginPage, { search: { conta: "excluida" } });
    await audit("login (erro)", LoginPage, { search: { erro: "1" } });
    // Entrar com e-mail (RF-31): só aparece quando o Admin liga.
    expect((await visit(LoginPage)).text).not.toContain("Enviar link de acesso");
    await world.sql("update public.app_settings set value = 'true'::jsonb where key = 'feature.email_login'");
    const withEmail = await audit("login com e-mail", LoginPage);
    expect(withEmail.text).toContain("Entrar com Google");
    expect(withEmail.text).toContain("Enviar link de acesso");
    await world.sql("update public.app_settings set value = 'false'::jsonb where key = 'feature.email_login'");
    await audit("termos", TermosPage);
    await audit("privacidade", PrivacidadePage);
    await audit("desinscrever (link válido)", UnsubscribePage, { search: { t: "00000000-0000-4000-8000-000000000000" } });
    await audit("desinscrever (concluído)", UnsubscribePage, { search: { feito: "1" } });
    await audit("desinscrever (link inválido)", UnsubscribePage);

    await world.login(CLAUDINHO);
    await audit("primeiro acesso", OnboardingPage);
    await outcome(() => completeOnboarding(null, form({ displayName: "Claudinho", bibleVersion: "NTLH", consentData: true, consentEmail: true })));
  });

  it("trilha, ciclo, lição, Nossa Igreja e perfil", async () => {
    await audit("minha trilha (recém-chegado)", HomePage);
    await audit("ciclo (recém-chegado)", CyclePage, { params: { slug: "c1" } });
    await audit("ciclo (aviso de lição bloqueada)", CyclePage, { params: { slug: "c1" }, search: { bloqueada: "1" } });
    await audit("lição 1", LessonPage, { params: { slug: "c1-l01" } });
    await world.sql("update public.app_settings set value = 'true'::jsonb where key in ('feature.quiz', 'feature.reflections')");
    const withExtras = await audit("lição 1 (quiz e reflexão ligados)", LessonPage, { params: { slug: "c1-l01" } });
    expect(withExtras.text).toContain("Para fixar");
    expect(withExtras.text).toContain("Sua prática");
    await world.sql("update public.app_settings set value = 'false'::jsonb where key in ('feature.quiz', 'feature.reflections')");
    await openLesson("c1-l01");
    await audit("minha trilha (lição em andamento)", HomePage);
    await outcome(() => completeLesson("c1-l01"));
    await audit("minha trilha (lição concluída, próxima aguardando)", HomePage);
    await audit("ciclo (com aviso de lição concluída)", CyclePage, { params: { slug: "c1" }, search: { concluida: "c1-l01" } });
    await audit("lição já concluída", LessonPage, { params: { slug: "c1-l01" } });
    await audit("Nossa Igreja", ChurchPage);
    await audit("meu perfil", ProfilePage);
  });

  it("os cabeçalhos de navegação", () => {
    for (const [name, html] of [
      ["cabeçalho do membro", renderToStaticMarkup(MemberHeader({ isStaff: false }))],
      ["cabeçalho do membro (equipe)", renderToStaticMarkup(MemberHeader({ isStaff: true }))],
      ["cabeçalho do administrador", renderToStaticMarkup(AdminHeader({ role: "admin" }))],
      ["cabeçalho do editor", renderToStaticMarkup(AdminHeader({ role: "editor" }))],
    ] as const) {
      // Cabeçalhos são só navegação (o título da tela vem da página); auditamos o que se aplica a eles.
      const found = auditHtml(html, name).filter((p) => !p.includes("<h1>"));
      problems.push(...found);
    }
  });
});

describe("Claudio, discípulo: telas de quem já avançou", () => {
  it("a trilha concluída e o ciclo concluído", async () => {
    await world.login(CLAUDIO);
    await outcome(() => completeOnboarding(null, form({ displayName: "Claudio", bibleVersion: "NVI", consentData: true })));
    // Percorre o Ciclo 1 inteiro para ver as telas de ciclo concluído.
    for (const slug of ["c1-l01", "c1-l02", "c1-l03", "c1-l04", "c1-l05", "c1-l06", "c1-l07", "c1-l08"]) {
      await openLesson(slug);
      await outcome(() => completeLesson(slug));
      await world.passDays(4);
    }
    await audit("ciclo concluído (parabéns)", CyclePage, { params: { slug: "c1" }, search: { concluida: "c1-l08", ciclo: "1" } });
    await audit("minha trilha (Ciclo 1 concluído)", HomePage);
    await audit("lição de outro ciclo já liberada", LessonPage, { params: { slug: "c2-l01" } });
  });
});

describe("Claudião, administrador, e um editor: painel de conteúdo", () => {
  it("o administrador percorre o painel inteiro", async () => {
    await world.login(CLAUDIAO);
    await outcome(() => completeOnboarding(null, form({ displayName: "Claudião", bibleVersion: "NTLH", consentData: true })));

    await audit("painel de indicadores", DashboardPage);
    await audit("painel de indicadores (90 dias)", DashboardPage, { search: { dias: "90" } });
    await audit("trilha do painel", AdminTrailPage);
    await audit("trilha do painel (com aviso)", AdminTrailPage, { search: { ok: "Feito." } });
    await audit("trilha do painel (com erro)", AdminTrailPage, { search: { erro: "Algo deu errado." } });
    await audit("editor de lição (publicada)", EditLessonPage, { params: { slug: "c1-l01" } });
    await audit("editor de lição (rascunho com pendências)", EditLessonPage, { params: { slug: "c3-l01" } });
    await audit("prévia da lição", PreviewPage, { params: { slug: "c1-l02" } });
    await audit("lista de pessoas", PeoplePage);
    await audit("lista de pessoas (filtrada)", PeoplePage, { search: { situacao: "in_progress", papel: "member", q: "clau" } });
    await audit("lista de pessoas (sem resultado)", PeoplePage, { search: { q: "zzz" } });
    await audit("ficha de uma pessoa", PersonPage, { params: { id: CLAUDIO.id! } });
    await audit("ficha (com mensagem)", PersonPage, { params: { id: CLAUDIO.id! }, search: { ok: "Perfil atualizado." } });
    await audit("ficha (a própria)", PersonPage, { params: { id: CLAUDIAO.id! } });
    await audit("editor de Nossa Igreja", EditChurchPage);
    await audit("configurações", SettingsPage);
    await audit("lembretes por e-mail", RemindersPage);
    await audit("lembretes (com aviso)", RemindersPage, { search: { ok: "Texto salvo." } });
  });

  it("um editor vê o painel e a trilha sem dados de pessoas", async () => {
    await outcome(() => changeRole(CLAUDIO.id!, form({ role: "editor" })));
    await world.login(CLAUDIO);
    await audit("painel de conteúdo (editor)", DashboardPage);
    await audit("trilha (editor)", AdminTrailPage);
    await audit("editor de lição publicada (somente leitura)", EditLessonPage, { params: { slug: "c1-l03" } });
    await audit("editor de lição em rascunho", EditLessonPage, { params: { slug: "c3-l02" } });
  });
});

describe("Cuidado: telas do cuidador e do administrador", () => {
  it("lista, ficha com alerta e nota, painel de cuidado e ficha do administrador com cuidador", async () => {
    // Claudio (que virou editor acima) passa a cuidador do Claudinho; o Claudinho está parado há 30 dias.
    await world.sql("update public.app_settings set value = 'true'::jsonb where key in ('feature.caregivers', 'feature.reflections')");
    await world.sql("update public.profiles set role = 'caregiver' where id = $1", [CLAUDIO.id]);
    await world.sql("insert into public.care_assignments (member_id, caregiver_id) values ($1, $2)", [CLAUDINHO.id, CLAUDIO.id]);
    await world.sql("update public.lesson_progress set updated_at = updated_at - interval '30 days', started_at = started_at - interval '30 days' where user_id = $1", [CLAUDINHO.id]);
    await world.sql(
      "insert into public.care_notes (member_id, author_id, body) values ($1, $2, 'Liguei na terça; pediu para ligar de novo.')",
      [CLAUDINHO.id, CLAUDIO.id],
    );
    await world.sql(
      "insert into public.reflections (user_id, lesson_id, body) select $1, id, 'Uma reflexão.' from public.lessons where slug = 'c1-l01'",
      [CLAUDINHO.id],
    );

    await world.login(CLAUDIO);
    const list = await audit("cuidado: meus membros", CarePage);
    expect(list.text).toContain("Alerta: Aberto");
    const ficha = await audit("cuidado: ficha do membro", CareMemberPage, { params: { id: CLAUDINHO.id! } });
    expect(ficha.text).toContain("Liguei na terça");
    await audit("cuidado: ficha com mensagem", CareMemberPage, { params: { id: CLAUDINHO.id! }, search: { ok: "Nota salva." } });
    await audit("cuidado: ficha com erro", CareMemberPage, { params: { id: CLAUDINHO.id! }, search: { erro: "Algo deu errado." } });

    await world.sql("update public.profiles set role = 'admin' where id = $1", [CLAUDIAO.id]);
    await world.login(CLAUDIAO);
    const admin = await audit("cuidado: painel do administrador", CareAdminPage);
    expect(admin.text).toContain("Alertas de quem parou");
    const person = await audit("cuidado: ficha do administrador com cuidador e notas", PersonPage, { params: { id: CLAUDINHO.id! } });
    expect(person.text).toContain("Notas de cuidado");
    expect(person.text).toContain("Liguei na terça");
    await audit("cuidado: ficha do administrador (reflexões)", PersonPage, { params: { id: CLAUDINHO.id! }, search: { ok: "Cuidador atribuído." } });
    expect(person.text).toContain("Uma reflexão.");

    await world.sql("update public.app_settings set value = 'false'::jsonb where key in ('feature.caregivers', 'feature.reflections')");
  });
});

describe("Encerramento e certificado: telas do membro, do administrador e a verificação pública", () => {
  it("todas passam na auditoria de acessibilidade", async () => {
    await world.sql("update public.app_settings set value = 'true'::jsonb where key in ('feature.closures', 'feature.certificates')");
    const [cycle] = await world.sql<{ id: string }>("select id from public.cycles where slug = 'c1'");
    const [event] = await world.sql<{ id: string }>(
      "insert into public.closure_events (cycle_id, title, kind, starts_at, location) values ($1, 'Culto de boas-vindas', 'Culto', now() + interval '7 days', 'Templo') returning id",
      [cycle.id],
    );
    await world.sql("insert into public.closure_attendance (event_id, user_id, present) values ($1, $2, true)", [event.id, CLAUDIO.id]);
    await world.sql(
      "insert into public.certificates (user_id, cycle_id, event_id, holder_name, code) values ($1, $2, $3, 'Claudio', 'VC-1A2B-3C4D-5E6F')",
      [CLAUDIO.id, cycle.id, event.id],
    );

    await world.login(CLAUDIO);
    const cyclePage = await audit("ciclo com o encerramento e o certificado", CyclePage, { params: { slug: "c1" } });
    expect(cyclePage.text).toContain("Encerramento presencial");
    const list = await audit("meus certificados", CertificatesPage);
    expect(list.text).toContain("VC-1A2B-3C4D-5E6F");
    // Gamificação leve: só aparece com o recurso ligado, e só mostra o que existe.
    expect((await visit(HomePage)).text).not.toContain("Sua jornada");
    await world.sql("update public.app_settings set value = 'true'::jsonb where key = 'feature.gamification'");
    const journey = await audit("minha trilha com sequência e marcos", HomePage);
    expect(journey.text).toContain("Sua jornada");
    expect(journey.text).toContain("Primeiro ciclo concluído");
    await world.sql("update public.app_settings set value = 'false'::jsonb where key = 'feature.gamification'");

    await world.login(CLAUDINHO);
    await audit("meus certificados (vazio)", CertificatesPage);

    await world.login(CLAUDIAO);
    const admin = await audit("encerramentos (administrador)", ClosuresPage);
    expect(admin.text).toContain("Culto de boas-vindas");
    await audit("encerramentos (com erro)", ClosuresPage, { search: { erro: "Algo deu errado." } });

    world.visitor();
    await audit("verificação de certificado (formulário)", VerifyPage);
    const valid = await audit("verificação de certificado (válido)", VerifyPage, { search: { codigo: "VC-1A2B-3C4D-5E6F" } });
    expect(valid.text).toContain("Certificado válido");
    await audit("verificação de certificado (não encontrado)", VerifyPage, { search: { codigo: "VC-0000-0000-0000" } });

    await world.sql("update public.app_settings set value = 'false'::jsonb where key in ('feature.closures', 'feature.certificates')");
  });
});

describe("Grupo de Discipulado: todas as telas passam na auditoria de acessibilidade", () => {
  it("discípulo, discipulador e Admin", async () => {
    await world.sql("update public.app_settings set value = 'true'::jsonb where key = 'feature.groups'");
    await world.sql("update public.profiles set is_discipler = true where id = $1", [CLAUDIO.id]);
    const mk = async (slug: string, title: string, position: number, sensitive: boolean) => {
      const [l] = await world.sql<{ id: string }>(
        "insert into public.lessons (kind, cycle_id, slug, title, objective, position, status, sensitive, themes) values ('library', null, $1, $2, 'Objetivo', $3, 'draft', $4, '{Tema}') returning id",
        [slug, title, position, sensitive],
      );
      const content = { blocks: [{ type: "paragraph", text: `Texto de ${title}.` }], practice: { title: "Desafio", items: ["Ore hoje."] }, reflection: "O que Deus falou?", guide: ["Pergunta do encontro?"] };
      const [v] = await world.sql<{ id: string }>("insert into public.lesson_versions (lesson_id, content) values ($1, $2::jsonb) returning id", [l.id, JSON.stringify(content)]);
      await world.sql("update public.lessons set current_version_id = $2, status = 'published' where id = $1", [l.id, v.id]);
      return l.id;
    };
    const l1 = await mk("lib-a", "Lição A", 1, true);
    const l2 = await mk("lib-b", "Lição B", 2, false);
    const [track] = await world.sql<{ id: string }>("insert into public.tracks (title) values ('Trilha A') returning id");
    await world.sql("insert into public.track_days (track_id, day_number, lesson_id) values ($1, 1, $2), ($1, 2, $3)", [track.id, l1, l2]);
    await world.sql("update public.tracks set status = 'published' where id = $1", [track.id]);
    const [group] = await world.sql<{ id: string; invite_code: string }>(
      "insert into public.discipleship_groups (name, discipler_id, track_id, start_date, active_weekdays, release_hour, meeting_weekday, invite_code) values ('Grupo A', $1, $2, current_date - 3, '{1,2,3,4,5,6,7}', 0, 6, 'G-AAAAAAAA') returning id, invite_code",
      [CLAUDIO.id, track.id],
    );
    await world.sql("insert into public.group_members (group_id, user_id, consent_version, joined_at) values ($1, $2, 'v1', now() - interval '3 days')", [group.id, CLAUDINHO.id]);
    await world.sql("insert into public.group_progress (user_id, group_id, lesson_id, completed_at) values ($1, $2, $3, now())", [CLAUDINHO.id, group.id, l1]);
    await world.sql("insert into public.group_reflections (user_id, group_id, lesson_id, body, shared) values ($1, $2, $3, 'Uma reflexão.', true)", [CLAUDINHO.id, group.id, l1]);
    await world.sql("insert into public.group_meetings (group_id, meeting_date, notes, attendees) values ($1, current_date, 'Notas.', $2)", [group.id, [CLAUDINHO.id]]);
    await world.sql("insert into public.group_pauses (group_id, from_date, until_date) values ($1, current_date + 5, current_date + 6)", [group.id]);
    await world.sql(
      "insert into public.help_requests (user_id, group_id, topic, message, destination) values ($1, $2, 'Tema', 'Preciso de ajuda.', 'discipler'), ($1, $2, 'Direto', 'Assunto delicado.', 'pastoral')",
      [CLAUDINHO.id, group.id],
    );
    await world.sql("update public.help_requests set escalated_at = now() where destination = 'discipler'");

    await world.login(CLAUDINHO);
    const mine = await audit("meu grupo", MyGroupsPage);
    expect(mine.text).toContain("Grupo A");
    await audit("meu grupo (com aviso)", MyGroupsPage, { search: { ok: "Você saiu do grupo." } });
    await audit("entrar em um grupo (convite)", JoinGroupPage, { search: { codigo: "G-AAAAAAAA" } });
    await audit("entrar em um grupo (código inválido)", JoinGroupPage, { search: { codigo: "G-00000000", erro: "Algo deu errado." } });
    const home = await audit("grupo do discípulo", GroupHomePage, { params: { id: group.id } });
    expect(home.text).toContain("Pausas do grupo");
    const sensitive = await audit("lição do dia (sensível)", GroupLessonPage, { params: { id: group.id, dia: "1" } });
    expect(sensitive.text).toContain("Pedir ajuda pastoral");
    await audit("lição do dia (comum)", GroupLessonPage, { params: { id: group.id, dia: "2" }, search: { salvo: "reflexao" } });
    await audit("pedir ajuda pastoral", GroupHelpFormPage, { params: { id: group.id }, search: { erro: "Escreva o que você precisa." } });

    await world.login(CLAUDIO);
    await audit("meus grupos (discipulador)", DisciplerHomePage);
    await audit("criar grupo", NewGroupPage, { search: { erro: "Dê um nome ao grupo." } });
    const panel = await audit("painel do grupo", GroupPanelPage, { params: { id: group.id } });
    expect(panel.text).toContain("Claudinho");
    await audit("guia do encontro", MeetingGuidePage, { params: { id: group.id } });
    await audit("ficha do discípulo", DiscipleFichaPage, { params: { id: group.id, userId: CLAUDINHO.id! } });
    await audit("pedidos de ajuda do grupo", DisciplerHelpPage);

    await world.login(CLAUDIAO);
    const admin = await audit("grupos (administrador)", AdminGroupsPage);
    expect(admin.text).toContain("Grupo A");
    const libraryEditor = await audit("editor de lição da biblioteca", EditLessonPage, { params: { slug: "lib-a" } });
    expect(libraryEditor.text).toContain("Guia do encontro");
    await audit("prévia de lição da biblioteca", PreviewPage, { params: { slug: "lib-a" } });
    const queue = await audit("pedidos de ajuda pastoral", PastoralHelpPage);
    expect(queue.text).toContain("Prioridade: direto à equipe");

    await world.sql("update public.app_settings set value = 'false'::jsonb where key = 'feature.groups'");
  });
});

describe("Formulário de feedback do piloto: visitante sem login e administrador", () => {
  const answer = {
    device: "iphone",
    entered: "com_dificuldade",
    lessonDone: "sim",
    ease: "3",
    alone: "com_ajuda",
    liked: "Gostei da leitura curta.",
    confusing: "Não achei o botão de voltar.",
    suggestion: "",
    contactName: "",
    contact: "",
  };

  it("fechado por padrão: o visitante vê um aviso e não consegue enviar", async () => {
    world.visitor();
    const closed = await audit("feedback (fechado)", FeedbackPage);
    expect(closed.text).toContain("não está aberto");
    expect(closed.text).not.toContain("Enviar minha resposta");
    const sent = await outcome(() => submitFeedback(null, form(answer)));
    expect(sent.value).toEqual({ error: expect.stringContaining("fechado") });
  });

  it("aberto: o visitante vê o formulário, envia, e o Admin lê e apaga", async () => {
    await world.sql("update public.app_settings set value = 'true'::jsonb where key = 'feature.feedback'");

    world.visitor();
    const open = await audit("feedback (aberto)", FeedbackPage);
    expect(open.text).toContain("Enviar minha resposta");
    expect(open.text).toContain("Qual aparelho você usou?");

    // Falta uma resposta obrigatória: a mensagem diz qual.
    const incomplete = await outcome(() => submitFeedback(null, form({ ...answer, entered: "" })));
    expect(incomplete.value).toEqual({ error: expect.stringContaining("conseguiu entrar") });

    // Robô: o campo-isca preenchido finge sucesso e não grava nada.
    const bot = await outcome(() => submitFeedback(null, form({ ...answer, website: "http://spam.example" })));
    expect(bot.value).toEqual({ done: true });
    expect(await world.sql("select 1 from public.feedback_responses")).toHaveLength(0);

    const sent = await outcome(() => submitFeedback(null, form(answer)));
    expect(sent.value).toEqual({ done: true });
    expect(await world.sql("select 1 from public.feedback_responses")).toHaveLength(1);

    await world.login(CLAUDIAO);
    const list = await audit("feedback (administrador, com resposta)", FeedbackAdminPage);
    expect(list.text).toContain("1 resposta");
    expect(list.text).toContain("Não achei o botão de voltar.");
    expect(list.text).toContain("Sim, mas com dificuldade");
    expect(list.text).toContain("aberto");
    await audit("feedback (administrador, com aviso)", FeedbackAdminPage, { search: { ok: "Resposta apagada." } });

    const [row] = await world.sql<{ id: string }>("select id from public.feedback_responses");
    await outcome(() => deleteFeedback(form({ id: row.id })));
    expect(await world.sql("select 1 from public.feedback_responses")).toHaveLength(0);
    const empty = await audit("feedback (administrador, sem respostas)", FeedbackAdminPage);
    expect(empty.text).toContain("Ainda não há respostas");

    await world.sql("update public.app_settings set value = 'false'::jsonb where key = 'feature.feedback'");
    const closed = await audit("feedback (administrador, formulário fechado)", FeedbackAdminPage);
    expect(closed.text).toContain("fechado");
  });

  it("um membro comum não lê as respostas nem pela tela do painel", async () => {
    await world.login(CLAUDINHO);
    const result = await visit(FeedbackAdminPage);
    expect(result.redirect ?? (result.notFound ? "404" : null)).not.toBeNull();
  });
});

describe("Marca da igreja: administrador troca cores e logotipo", () => {
  const logoPng = () =>
    sharp({ create: { width: 500, height: 500, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
      .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><rect x="100" y="150" width="300" height="140" fill="#1d4ed8"/></svg>`) }])
      .png()
      .toBuffer();
  const fileForm = async (fields: Record<string, string | { name: string; type: string; bytes: Buffer }>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value === "string") data.set(key, value);
      else data.set(key, new File([new Uint8Array(value.bytes)], value.name, { type: value.type }));
    }
    return data;
  };
  const getImage = (file: string) => brandImage(new Request(`http://site.test/marca/${file}`), { params: Promise.resolve({ arquivo: file }) });

  it("a tela abre com a marca padrão e só o administrador entra", async () => {
    await world.login(CLAUDIAO);
    const page = await audit("marca (padrão)", BrandPage);
    expect(page.text).toContain("marca padrão do projeto");
    expect(page.text).toContain("Salvar cores");

    await world.login(CLAUDINHO);
    const blocked = await visit(BrandPage);
    expect(blocked.redirect ?? (blocked.notFound ? "404" : null)).not.toBeNull();
    await expect(outcome(() => saveBrandColors(null, new FormData()))).resolves.toMatchObject({ redirect: expect.any(String) });
  });

  it("salva as cores: a paleta é calculada no servidor e passa a valer para todo o site", async () => {
    await world.login(CLAUDIAO);
    const saved = await outcome(() => saveBrandColors(null, form({ brand: "#1d4ed8", foreground: "#111111", background: "#fafafa" })));
    expect(saved.value).toEqual({ ok: expect.stringContaining("Cores salvas") });
    const identity = await loadIdentity();
    expect(identity.customColors).toBe(true);
    expect(identity.palette.brand).toBe("#1d4ed8");
    expect(identity.readingDark.onBrand).toMatch(/^#[0-9a-f]{6}$/);
    const page = await audit("marca (com cores salvas)", BrandPage, { search: { ok: "Cores salvas." } });
    expect(page.text).toContain("marca personalizada");
    expect(page.html).toContain('value="#1d4ed8"');
  });

  it("avisa quando a cor escolhida é clara demais e usa uma versão mais escura", async () => {
    const saved = await outcome(() => saveBrandColors(null, form({ brand: "#ffd400", foreground: "#111111", background: "#ffffff" })));
    expect(saved.value).toEqual({ ok: expect.stringContaining("escurecida") });
    expect((await loadIdentity()).palette.brand).not.toBe("#ffd400");
  });

  it("recusa cores inválidas, fundo escuro e texto que não contrasta, sem gravar nada", async () => {
    const before = (await loadIdentity()).palette.brand;
    for (const bad of [
      { brand: "azul", foreground: "#111111", background: "#ffffff" },
      { brand: "#1d4ed8", foreground: "#111111", background: "#101010" },
      { brand: "#1d4ed8", foreground: "#dddddd", background: "#ffffff" },
      { brand: "#1d4ed8;background:url(https://x.example)", foreground: "#111111", background: "#ffffff" },
    ]) {
      const r = await outcome(() => saveBrandColors(null, form(bad)));
      expect(r.value, JSON.stringify(bad)).toEqual({ error: expect.any(String) });
    }
    expect((await loadIdentity()).palette.brand).toBe(before);
  });

  it("envia o logotipo, gera as imagens e as serve no endereço público", async () => {
    const sent = await outcome(async () => uploadBrandImages(null, await fileForm({ logo: { name: "logo.png", type: "image/png", bytes: await logoPng() } })));
    expect(sent.value).toEqual({ ok: expect.stringContaining("Logotipo salvo") });
    const identity = await loadIdentity();
    expect(identity.assets).toEqual(["icon-192", "icon-512", "icon-apple", "icon-maskable", "icon-tab", "logo", "logo-jpeg"]);

    world.visitor(); // qualquer visitante lê a imagem da marca
    for (const [file, size] of [["logo.png", null], ["icone-192.png", 192], ["icone-512.png", 512], ["icone-apple.png", 180], ["icone-aba.png", 64]] as const) {
      const response = await getImage(file);
      expect(response.status, file).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      if (size) expect((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width, file).toBe(size);
    }
    const etag = (await getImage("logo.png")).headers.get("etag")!;
    const again = await brandImage(new Request("http://site.test/marca/logo.png", { headers: { "if-none-match": etag } }), { params: Promise.resolve({ arquivo: "logo.png" }) });
    expect(again.status).toBe(304);
    expect((await getImage("../../etc/passwd")).status).toBe(404);
    expect((await getImage("logo-jpeg")).status).toBe(404); // só os arquivos da lista
  });

  it("recusa arquivo que não é imagem, SVG e imagem pequena, com mensagem clara", async () => {
    await world.login(CLAUDIAO);
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><script>alert(1)</script></svg>`);
    for (const [name, type, bytes, message] of [
      ["x.txt", "text/plain", Buffer.from("olá"), /PNG ou JPG/],
      ["x.svg", "image/svg+xml", svg, /PNG ou JPG/],
    ] as const) {
      const r = await outcome(async () => uploadBrandImages(null, await fileForm({ logo: { name, type, bytes } })));
      expect(r.value, name).toEqual({ error: expect.stringMatching(message) });
    }
    const none = await outcome(() => uploadBrandImages(null, new FormData()));
    expect(none.value).toEqual({ error: "Escolha o arquivo do logotipo." });
  });

  it("exporta a identidade, restaura o padrão e importa de volta", async () => {
    const exported = await exportBrand();
    expect(exported.headers.get("cache-control")).toBe("no-store");
    const body = await exported.text();
    const parsed = JSON.parse(body);
    expect(parsed.formato).toBe("identidade-v1");
    expect(parsed.inputs).toMatchObject({ foreground: "#111111" });
    expect(parsed.images).toHaveLength(7);

    const reset = await outcome(() => resetBrand());
    expect(reset.redirect).toContain("ok=");
    expect((await loadIdentity()).customColors).toBe(false);
    expect((await loadIdentity()).assets).toEqual([]);
    const page = await audit("marca (depois de restaurar)", BrandPage);
    expect(page.text).toContain("marca padrão do projeto");

    const imported = await outcome(async () => importBrand(null, await fileForm({ arquivo: { name: "identidade.json", type: "application/json", bytes: Buffer.from(body) } })));
    expect(imported.value).toEqual({ ok: "Importado: cores e imagens." });
    const restored = await loadIdentity();
    expect(restored.customColors).toBe(true);
    expect(restored.assets).toHaveLength(7);
  });

  it("recusa arquivo de importação adulterado: formato errado, imagem falsa e chave desconhecida", async () => {
    const send = async (content: unknown) =>
      (await outcome(async () => importBrand(null, await fileForm({ arquivo: { name: "x.json", type: "application/json", bytes: Buffer.from(typeof content === "string" ? content : JSON.stringify(content)) } })))).value;
    expect(await send("isto não é json")).toEqual({ error: expect.stringContaining("não é um arquivo de identidade") });
    expect(await send({ formato: "outro" })).toEqual({ error: expect.stringContaining("não é um arquivo de identidade") });
    expect(await send({ formato: "identidade-v1" })).toEqual({ error: expect.stringContaining("não traz cores nem imagens") });
    expect(await send({ formato: "identidade-v1", images: [{ key: "../x", content_type: "image/png", data: "AAAA" }] })).toEqual({ error: expect.stringContaining("desconhecida") });
    expect(await send({ formato: "identidade-v1", images: [{ key: "logo", content_type: "image/png", data: Buffer.from("<script>").toString("base64") }] })).toEqual({ error: expect.stringContaining("logo") });
    expect(await send({ formato: "identidade-v1", inputs: { brand: "x", foreground: "y", background: "z" } })).toEqual({ error: expect.stringContaining("cores do arquivo") });
  });

  it("volta ao padrão para não afetar as próximas telas", async () => {
    await outcome(() => resetBrand());
    expect((await loadIdentity()).customColors).toBe(false);
  });
});

describe("resultado da auditoria", () => {
  it("nenhuma tela tem falha estrutural de acessibilidade", () => {
    expect(audited).toBeGreaterThan(35);
    expect(problems).toEqual([]);
  });
});
