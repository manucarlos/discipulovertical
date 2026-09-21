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

describe("resultado da auditoria", () => {
  it("nenhuma tela tem falha estrutural de acessibilidade", () => {
    expect(audited).toBeGreaterThan(35);
    expect(problems).toEqual([]);
  });
});
