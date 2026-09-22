import { describe, expect, it } from "vitest";
import { buildRoteiro, buildSeedSql, validateChurchConfig, type KitFiles } from "./church-config";

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
  it("traz a igreja, o administrador pendente, as páginas em branco e a marca", () => {
    const { config, palette } = ok(valid);
    const sql = buildSeedSql(config, palette);
    expect(sql).toContain("insert into public.churches (slug, name, contact_email) values ('igreja-exemplo', 'Igreja Exemplo', 'contato@igrejaexemplo.org')");
    expect(sql).toContain("insert into public.church_admins_pending (email, church_id) values ('pastor@igrejaexemplo.org', v_church)");
    expect(sql).toContain("insert into public.church_pages (church_id, slug, title, body, position) values");
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
    expect(sql).toContain("'Igreja d''Água''); drop table x; --'");
    expect(sql.split("\n")[0]).not.toContain("\n");
  });
});

describe("buildRoteiro", () => {
  const files: KitFiles = { identidade: "1-identidade.sql", conteudo: "2-conteudo.sql", biblioteca: "3-biblioteca.sql" };

  it("o roteiro é personalizado, na ordem certa, e não deixa marcador sem resolver", () => {
    const roteiro = buildRoteiro(ok(valid).config, files);
    expect(roteiro).toContain("# Nova igreja: Igreja Exemplo");
    expect(roteiro).toContain("pastor@igrejaexemplo.org");
    expect(roteiro.indexOf("1-identidade.sql")).toBeLessThan(roteiro.indexOf("2-conteudo.sql"));
    expect(roteiro).toContain("3-biblioteca.sql");
    expect(roteiro).toContain("as cores já foram aplicadas");
    expect(roteiro).not.toContain("{{igreja}}");
    expect(roteiro).toContain("Nunca cole senhas");
  });

  it("sem cores, o roteiro pede para escolhê-las, e sem biblioteca não a cita", () => {
    const { config } = ok({ slug: "ab", name: "Ig", initialAdminEmail: "a@b.co" });
    const roteiro = buildRoteiro(config, { ...files, biblioteca: null });
    expect(roteiro).toContain("escolha as **cores**");
    expect(roteiro).not.toContain("3-biblioteca.sql");
  });
});
