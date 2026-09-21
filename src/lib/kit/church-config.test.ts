import { describe, expect, it } from "vitest";
import { buildEnvExample, buildRoteiro, buildSeedSql, validateChurchConfig, type KitFiles } from "./church-config";

const valid = {
  slug: "igreja-exemplo",
  name: "Igreja Exemplo",
  contactEmail: "contato@igrejaexemplo.org",
  initialAdminEmail: "Pastor@IgrejaExemplo.org",
  siteUrl: "https://discipulado.igrejaexemplo.org/",
  brand: { brand: "#1d4ed8", foreground: "#111111", background: "#fafafa" },
  content: { cycles: [3, 1, 2, 2], library: true },
};

const ok = (raw: unknown) => {
  const r = validateChurchConfig(raw);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r;
};
const errors = (raw: unknown) => {
  const r = validateChurchConfig(raw);
  return r.ok ? [] : r.errors;
};

describe("validateChurchConfig", () => {
  it("aceita uma configuração completa e normaliza (e-mail em minúsculas, sem barra no fim, ciclos em ordem e sem repetir)", () => {
    const { config, palette } = ok(valid);
    expect(config).toMatchObject({
      slug: "igreja-exemplo",
      name: "Igreja Exemplo",
      initialAdminEmail: "pastor@igrejaexemplo.org",
      siteUrl: "https://discipulado.igrejaexemplo.org",
      content: { cycles: [1, 2, 3], library: true },
    });
    expect(palette?.ok).toBe(true);
  });

  it("o mínimo é o nome, o identificador e o e-mail do administrador; o resto tem padrão", () => {
    const { config, palette } = ok({ slug: "ab", name: "Ig", initialAdminEmail: "a@b.co" });
    expect(config).toMatchObject({ contactEmail: "", siteUrl: null, brand: null, content: { cycles: [1, 2, 3], library: false } });
    expect(palette).toBeNull();
  });

  it("diz o que está errado, em português, sem aceitar nada pela metade", () => {
    expect(errors(null)).toHaveLength(1);
    expect(errors([])).toHaveLength(1);
    expect(errors({}).join(" ")).toContain('"slug"');
    expect(errors({ ...valid, slug: "Igreja Exemplo" }).join(" ")).toContain("slug");
    expect(errors({ ...valid, name: "x" }).join(" ")).toContain('"name"');
    expect(errors({ ...valid, name: "AB" }).join(" ")).toContain('"name"');
    expect(errors({ ...valid, initialAdminEmail: "sem-arroba" }).join(" ")).toContain("initialAdminEmail");
    expect(errors({ ...valid, initialAdminEmail: "a'b@c.com" }).join(" ")).toContain("initialAdminEmail");
    expect(errors({ ...valid, contactEmail: "x" }).join(" ")).toContain("contactEmail");
    expect(errors({ ...valid, siteUrl: "http://inseguro.org" }).join(" ")).toContain("siteUrl");
    expect(errors({ ...valid, siteUrl: "https://a.org/caminho" }).join(" ")).toContain("siteUrl");
    expect(errors({ ...valid, content: { cycles: [4] } }).join(" ")).toContain("content.cycles");
    expect(errors({ ...valid, content: { cycles: [] } }).join(" ")).toContain("content.cycles");
    expect(errors({ ...valid, content: { library: "sim" } }).join(" ")).toContain("content.library");
  });

  it("aponta campo desconhecido (erro de digitação) em vez de ignorar", () => {
    expect(errors({ ...valid, nome: "x" }).join(" ")).toContain('"nome"');
    expect(errors({ ...valid, brand: { ...valid.brand, cor: "#fff" } }).join(" ")).toContain('"cor"');
    expect(errors({ ...valid, content: { ciclos: [1] } }).join(" ")).toContain('"ciclos"');
  });

  it("recusa cores da marca que não dão uma paleta legível", () => {
    expect(errors({ ...valid, brand: { brand: "azul", foreground: "#111111", background: "#ffffff" } }).join(" ")).toContain("Cores da marca");
    expect(errors({ ...valid, brand: { brand: "#1d4ed8", foreground: "#111111", background: "#111111" } }).join(" ")).toContain("Cores da marca");
  });
});

describe("buildSeedSql", () => {
  it("traz o administrador, o nome, o contato, a limpeza da Nossa Igreja e a marca", () => {
    const { config, palette } = ok(valid);
    const sql = buildSeedSql(config, palette);
    expect(sql).toContain("'initial_admin_email', 'pastor@igrejaexemplo.org'");
    expect(sql).toContain("to_jsonb('Igreja Exemplo'::text) where key = 'church.name'");
    expect(sql).toContain("update public.church_pages set body = ''");
    expect(sql).toContain("insert into public.church_brand");
    expect(sql.startsWith("--")).toBe(true);
    expect(sql).toContain("begin;");
    expect(sql).toContain("commit;");
  });

  it("sem cores, não mexe na marca", () => {
    const { config, palette } = ok({ slug: "ab", name: "Ig", initialAdminEmail: "a@b.co" });
    expect(buildSeedSql(config, palette)).not.toContain("church_brand");
  });

  it("aspas no nome viram texto (duplicadas), nunca código", () => {
    const { config, palette } = ok({ slug: "ab", name: "Igreja d'Água'); drop table x; --", initialAdminEmail: "a@b.co" });
    const sql = buildSeedSql(config, palette);
    expect(sql).toContain("to_jsonb('Igreja d''Água''); drop table x; --'::text)");
    expect(sql.split("\n")[0]).not.toContain("\n");
  });
});

describe("buildEnvExample e buildRoteiro", () => {
  const files: KitFiles = { banco: "1-banco.sql", identidade: "2-identidade.sql", conteudo: "3-conteudo.sql", biblioteca: "4-biblioteca.sql", variaveis: "variaveis.env" };

  it("as variáveis trazem o nome e o endereço da igreja e avisam da chave secreta", () => {
    const env = buildEnvExample(ok(valid).config);
    expect(env).toContain("NEXT_PUBLIC_CHURCH_NAME=Igreja Exemplo");
    expect(env).toContain("NEXT_PUBLIC_SITE_URL=https://discipulado.igrejaexemplo.org");
    expect(env).toContain("NUNCA use a chave 'secret'");
  });

  it("o roteiro é personalizado, na ordem certa, e não deixa marcador sem resolver", () => {
    const roteiro = buildRoteiro(ok(valid).config, files);
    expect(roteiro).toContain("# Instalação: Igreja Exemplo");
    expect(roteiro).toContain("pastor@igrejaexemplo.org");
    expect(roteiro).toContain("https://discipulado.igrejaexemplo.org/auth/callback");
    expect(roteiro.indexOf("1-banco.sql")).toBeLessThan(roteiro.indexOf("2-identidade.sql"));
    expect(roteiro.indexOf("2-identidade.sql")).toBeLessThan(roteiro.indexOf("3-conteudo.sql"));
    expect(roteiro).toContain("4-biblioteca.sql");
    expect(roteiro).toContain("as cores já foram aplicadas");
    expect(roteiro).not.toContain("{{igreja}}");
    expect(roteiro).toContain("Nunca cole senhas");
  });

  it("sem endereço nem cores, o roteiro pede para preencher depois e não cita a biblioteca", () => {
    const { config } = ok({ slug: "ab", name: "Ig", initialAdminEmail: "a@b.co" });
    const roteiro = buildRoteiro(config, { ...files, biblioteca: null });
    expect(roteiro).toContain("escolha as **cores**");
    expect(roteiro).toContain("https://SEU-SITE");
    expect(roteiro).not.toContain("4-biblioteca.sql");
  });
});
