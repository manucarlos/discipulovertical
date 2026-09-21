import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cobertura de autorização: toda ação do servidor, rota de dados e tela sensível precisa conferir quem é a
 * pessoa. É uma checagem sobre o código-fonte, feita para falhar quando alguém criar uma ação nova e esquecer
 * a verificação. (A proteção de verdade também está no banco, pela RLS; isto é o segundo cinto.)
 */
const APP = path.resolve(__dirname, "../../src/app");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}
const files = walk(APP);
const rel = (f: string) => path.relative(path.resolve(__dirname, "../.."), f).replaceAll("\\", "/");
const read = (f: string) => fs.readFileSync(f, "utf8");

/** Corpos das funções exportadas (async function nome(...) { ... }) de um arquivo. */
function exportedFunctions(source: string): { name: string; body: string }[] {
  const parts = source.split(/\nexport async function /).slice(1);
  return parts.map((part) => ({ name: part.slice(0, part.indexOf("(")), body: part }));
}

const GUARD = /requireMember\(|requireStaff\(|requireAdmin\(|requireCaregiver\(|accessibleLesson\(/;

describe("ações do servidor ('use server')", () => {
  const actionFiles = files.filter((f) => /\.(ts|tsx)$/.test(f) && /^\s*["']use server["']/.test(read(f)));

  it("existem ações (o teste está olhando para os arquivos certos)", () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(8);
  });

  for (const file of actionFiles) {
    for (const { name, body } of exportedFunctions(read(file))) {
      it(`${rel(file)} → ${name}() confere a identidade antes de agir`, () => {
        const isDev = rel(file).startsWith("src/app/dev/");
        if (isDev) {
          expect(body, "ação de mentirinha do /dev precisa recusar em produção").toMatch(/NODE_ENV === "production"/);
          return;
        }
        // Exceções conscientes e documentadas:
        //  - signOut: encerrar a própria sessão não exige papel algum.
        //  - completeOnboarding: confere a sessão direto com auth.getUser() e manda ao login se não houver.
        const explicitGetUser = /supabase\.auth\.getUser\(\)/.test(body) && /redirect\("\/login"\)/.test(body);
        const isSignOut = name === "signOut" && /supabase\.auth\.signOut\(\)/.test(body);
        expect(GUARD.test(body) || explicitGetUser || isSignOut, `${name} não chama requireMember/requireStaff/requireAdmin`).toBe(true);
      });
    }
  }

  it("as ações do painel exigem equipe, e as de dados de outras pessoas exigem administrador", () => {
    const admin = ["src/app/admin/pessoas/actions.ts", "src/app/admin/igreja/actions.ts", "src/app/admin/configuracoes/actions.ts", "src/app/admin/cuidado/actions.ts", "src/app/admin/lembretes/actions.ts"];
    for (const f of admin) {
      const source = read(path.resolve(__dirname, "../..", f));
      for (const { name, body } of exportedFunctions(source)) {
        expect(body, `${f} → ${name}`).toMatch(/requireAdmin\(/);
      }
    }
    for (const f of ["src/app/admin/actions.ts", "src/app/admin/licao/[slug]/actions.ts"]) {
      const source = read(path.resolve(__dirname, "../..", f));
      for (const { name, body } of exportedFunctions(source)) {
        expect(body, `${f} → ${name}`).toMatch(/requireStaff\(/);
      }
    }
  });
});

describe("telas do painel (/admin)", () => {
  const pages = files.filter((f) => rel(f).startsWith("src/app/admin/") && /page\.tsx$/.test(f));
  it("existem telas", () => expect(pages.length).toBeGreaterThanOrEqual(7));
  for (const page of pages) {
    it(`${rel(page)} confere a equipe na própria tela (além do layout)`, () => {
      expect(read(page)).toMatch(/requireStaff\(|requireAdmin\(/);
    });
  }
  it("as telas com dados pessoais de outras pessoas exigem administrador", () => {
    for (const p of pages.filter((f) => /admin\/(pessoas|igreja|configuracoes|cuidado|lembretes)\//.test(rel(f)))) {
      expect(read(p), rel(p)).toMatch(/requireAdmin\(/);
    }
    expect(read(files.find((f) => rel(f).endsWith("admin/painel/page.tsx"))!)).toMatch(/role === "admin"/); // o editor recebe só métricas de conteúdo
  });
  it("o layout do painel exige equipe", () => {
    expect(read(files.find((f) => rel(f) === "src/app/admin/layout.tsx")!)).toMatch(/requireStaff\(/);
  });
});

describe("telas do membro e rotas de dados", () => {
  it("toda tela da área do membro exige login", () => {
    const pages = files.filter((f) => rel(f).startsWith("src/app/(member)/") && /page\.tsx$/.test(f));
    expect(pages.length).toBeGreaterThanOrEqual(5);
    for (const p of pages) expect(read(p), rel(p)).toMatch(/requireMember\(|requireCaregiver\(/);
  });

  it("as telas e ações do cuidador exigem o perfil de cuidador (e não só estar logado)", () => {
    const care = files.filter((f) => rel(f).startsWith("src/app/(member)/cuidado/"));
    expect(care.length).toBeGreaterThanOrEqual(3);
    for (const f of care) expect(read(f), rel(f)).toMatch(/requireCaregiver\(/);
  });

  it("as rotas de dados (route.ts) exigem login, exceto o retorno do Google, que valida o destino", () => {
    const routes = files.filter((f) => /route\.ts$/.test(f));
    expect(routes.length).toBeGreaterThanOrEqual(2);
    for (const r of routes) {
      const source = read(r);
      if (rel(r) === "src/app/auth/callback/route.ts") {
        expect(source, "o parâmetro next precisa ser validado (redirecionamento aberto)").toMatch(/startsWith\("\/"\)\s*&&\s*!value\.startsWith\("\/\/"\)/);
      } else if (rel(r) === "src/app/api/cron/lembretes/route.ts") {
        expect(source, "o agendador precisa provar que tem o CRON_SECRET").toMatch(/isAuthorizedCron\(/);
        expect(source, "sem CRON_SECRET configurado a rota recusa").toMatch(/if \(!secret\)/);
      } else if (rel(r) === "src/app/api/descadastro/route.ts") {
        expect(source, "o código do e-mail precisa ser validado").toMatch(/UUID\.test\(token\)/);
        expect(source, "abrir o link (GET) nunca descadastra").not.toMatch(/export async function GET/);
      } else {
        expect(source, rel(r)).toMatch(/requireMember\(/);
      }
    }
  });

  it("dados pessoais nunca ficam em cache", () => {
    expect(read(files.find((f) => rel(f).endsWith("perfil/exportar/route.ts"))!)).toMatch(/"Cache-Control":\s*"no-store"/);
  });
});

describe("pré-visualizações /dev", () => {
  it("toda página /dev some em produção", () => {
    const pages = files.filter((f) => rel(f).startsWith("src/app/dev/") && /page\.tsx$/.test(f));
    expect(pages.length).toBeGreaterThanOrEqual(8);
    for (const p of pages) expect(read(p), rel(p)).toMatch(/NODE_ENV === "production"\)\s*notFound\(\)/);
  });
});

describe("chaves e segredos", () => {
  it("o código do aplicativo nunca usa a chave secreta do Supabase", () => {
    const code = files.concat(walk(path.resolve(__dirname, "../../src/lib")));
    for (const f of code.filter((x) => /\.(ts|tsx)$/.test(x) && !/\.test\./.test(x))) {
      expect(read(f), rel(f)).not.toMatch(/service_role|SERVICE_ROLE|SUPABASE_SECRET/);
    }
  });
});
