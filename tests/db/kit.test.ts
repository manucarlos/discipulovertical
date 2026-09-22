import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { parseHandoff } from "@/lib/content/parse-handoff";
import { buildImportSql } from "@/lib/content/to-sql";
import { buildSeedSql, validateChurchConfig } from "@/lib/kit/church-config";
import { asUser, createDb, createUser } from "./harness";

/** O SQL do kit de instalação (identidade e conteúdo), aplicado de verdade num banco já migrado. */
let db: PGlite;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);

function seedFor(raw: unknown) {
  const r = validateChurchConfig(raw);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return buildSeedSql(r.config, r.palette);
}

const BASE = { slug: "igreja-exemplo", name: "Igreja Exemplo", contactEmail: "contato@igrejaexemplo.org", initialAdminEmail: "pastor@igrejaexemplo.org" };
const BRAND = { brand: "#1d4ed8", foreground: "#111111", background: "#fafafa" };

beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

describe("identidade (1-identidade.sql)", () => {
  it("cria a igreja e as 6 páginas em branco de Nossa Igreja", async () => {
    await db.exec(seedFor({ ...BASE, brand: BRAND }));
    const church = (await q<{ id: string }>("select id from public.churches where slug = 'igreja-exemplo'"))[0];
    expect(church).toBeDefined();
    const pages = await q<{ slug: string; body: string }>("select slug, body from public.church_pages where church_id = $1 order by slug", [church.id]);
    expect(pages).toHaveLength(6);
    expect(pages.every((p) => p.body === "")).toBe(true);
  });

  it("grava nome, contato, administrador pendente e a paleta da marca", async () => {
    const church = (await q<{ name: string; contact_email: string }>("select name, contact_email from public.churches where slug = 'igreja-exemplo'"))[0];
    expect(church).toEqual({ name: "Igreja Exemplo", contact_email: "contato@igrejaexemplo.org" });
    expect(await q("select 1 from public.church_admins_pending where email = 'pastor@igrejaexemplo.org'")).toHaveLength(1);
    expect((await q<{ inputs: { brand: string } }>("select inputs from public.church_brand cb join public.churches c on c.id = cb.church_id where c.slug = 'igreja-exemplo'"))[0].inputs.brand).toBe("#1d4ed8");
  });

  it("quem entra com o e-mail do administrador pendente vira Administrador desta igreja (e mais ninguém)", async () => {
    const pastor = await createUser(db, "pastor@igrejaexemplo.org");
    const outra = await createUser(db, "outra@igrejaexemplo.org");
    const row = async (id: string) => (await q<{ role: string; church_id: string | null }>("select role, church_id from public.profiles where id = $1", [id]))[0];
    const church = (await q<{ id: string }>("select id from public.churches where slug = 'igreja-exemplo'"))[0];
    expect(await row(pastor)).toEqual({ role: "admin", church_id: church.id });
    expect((await row(outra)).role).toBe("member");
    // E ele já enxerga a marca da própria igreja (a RLS confere que é Admin dela).
    expect(await asUser(db, pastor, () => q("select church_id from public.church_brand"))).toEqual([{ church_id: church.id }]);
  });

  it("é seguro repetir: a segunda vez atualiza e sobe a versão da marca", async () => {
    await db.exec(seedFor({ ...BASE, brand: { ...BRAND, brand: "#7c3aed" } }));
    const row = (await q<{ inputs: { brand: string }; version: number }>(
      "select cb.inputs, cb.version from public.church_brand cb join public.churches c on c.id = cb.church_id where c.slug = 'igreja-exemplo'",
    ))[0];
    expect(row.inputs.brand).toBe("#7c3aed");
    expect(row.version).toBe(2);
  });

  it("um nome de igreja com aspas e comando SQL é gravado como texto, e nada é executado", async () => {
    const hostile = "Igreja d'Água'); drop table public.profiles; --";
    await db.exec(seedFor({ ...BASE, slug: "igreja-hostil", name: hostile }));
    expect((await q<{ name: string }>("select name from public.churches where slug = 'igreja-hostil'"))[0].name).toBe(hostile);
    expect(await q("select 1 from public.profiles limit 1")).toBeDefined(); // a tabela continua ali
  });

  it("sem cores no arquivo, não cria marca para a igreja", async () => {
    await db.exec(seedFor({ ...BASE, slug: "igreja-sem-cor" }));
    expect(await q("select 1 from public.church_brand cb join public.churches c on c.id = cb.church_id where c.slug = 'igreja-sem-cor'")).toHaveLength(0);
  });
});

describe("conteúdo (2-conteudo.sql)", () => {
  it("as lições trazem o nome da igreja no lugar do marcador, e nenhum marcador sobra", async () => {
    const cycles = parseHandoff(fs.readFileSync(path.resolve(__dirname, "../../docs/HANDOFF.md"), "utf8")).filter((c) => c.number === 3);
    const sql = buildImportSql(cycles, { churchName: "Igreja Modelo", churchSlug: "igreja-exemplo" });
    expect(sql).not.toContain("{{igreja}}");
    await db.exec(sql);
    const church = (await q<{ id: string }>("select id from public.churches where slug = 'igreja-exemplo'"))[0];
    const text = (await q<{ t: string }>("select string_agg(v.content::text, ' ') as t from public.lesson_versions v join public.lessons l on l.id = v.lesson_id where l.church_id = $1", [church.id]))[0].t;
    expect(text).toContain("Igreja Modelo");
    expect(text).not.toContain("{{igreja}}");
    expect(text).not.toContain("Vertical Church");
  });
});
