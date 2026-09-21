import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { parseHandoff } from "@/lib/content/parse-handoff";
import { buildImportSql } from "@/lib/content/to-sql";
import { buildSeedSql, validateChurchConfig } from "@/lib/kit/church-config";
import { asUser, createDb, createUser } from "./harness";

/** O SQL do kit de instalação, aplicado de verdade num banco novo (as 25 migrações). */
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

describe("identidade (2-identidade.sql)", () => {
  it("o banco novo traz de exemplo a visão e a missão de outra igreja, e o kit as remove", async () => {
    const before = await q<{ slug: string; body: string }>("select slug, body from public.church_pages where slug in ('vision', 'mission', 'mission-fulfilment')");
    expect(before.every((p) => p.body.length > 20)).toBe(true);

    await db.exec(seedFor({ ...BASE, brand: BRAND }));
    const after = await q<{ slug: string; body: string }>("select slug, body from public.church_pages order by slug");
    expect(after.filter((p) => ["vision", "mission", "mission-fulfilment"].includes(p.slug)).every((p) => p.body === "")).toBe(true);
  });

  it("grava nome, contato, administrador inicial e a paleta da marca", async () => {
    const settings = Object.fromEntries((await q<{ key: string; value: string }>("select key, value from public.app_settings where key like 'church.%'")).map((r) => [r.key, r.value]));
    expect(settings).toEqual({ "church.name": "Igreja Exemplo", "church.contact_email": "contato@igrejaexemplo.org" });
    expect((await q<{ value: string }>("select value from public.app_config where key = 'initial_admin_email'"))[0].value).toBe("pastor@igrejaexemplo.org");

    await db.exec("set role anon");
    try {
      const identity = (await q<{ v: { name: string; palette: { brand: string }; version: number } }>("select public.public_identity() as v"))[0].v;
      expect(identity).toMatchObject({ name: "Igreja Exemplo", palette: { brand: "#1d4ed8" }, version: 1 });
    } finally {
      await db.exec("reset role");
    }
  });

  it("quem entra com o e-mail do administrador inicial vira Administrador (e mais ninguém)", async () => {
    const pastor = await createUser(db, "pastor@igrejaexemplo.org");
    const outra = await createUser(db, "outra@igrejaexemplo.org");
    const role = async (id: string) => (await q<{ role: string }>("select role from public.profiles where id = $1", [id]))[0].role;
    expect(await role(pastor)).toBe("admin");
    expect(await role(outra)).toBe("member");
    // E ele já enxerga a tela de Marca (a RLS confere que é Admin).
    expect(await asUser(db, pastor, () => q("select id from public.church_brand"))).toHaveLength(1);
  });

  it("é seguro repetir: a segunda vez atualiza e sobe a versão da marca", async () => {
    await db.exec(seedFor({ ...BASE, brand: { ...BRAND, brand: "#7c3aed" } }));
    await db.exec("set role anon");
    try {
      const v = (await q<{ v: { palette: { brand: string }; version: number } }>("select public.public_identity() as v"))[0].v;
      expect(v.palette.brand).toBe("#7c3aed");
      expect(v.version).toBe(2);
    } finally {
      await db.exec("reset role");
    }
  });

  it("um nome de igreja com aspas e comando SQL é gravado como texto, e nada é executado", async () => {
    const hostile = "Igreja d'Água'); drop table public.profiles; --";
    await db.exec(seedFor({ ...BASE, name: hostile }));
    expect((await q<{ value: string }>("select value from public.app_settings where key = 'church.name'"))[0].value).toBe(hostile);
    expect(await q("select 1 from public.profiles limit 1")).toBeDefined(); // a tabela continua ali
  });

  it("sem cores no arquivo, não cria nem altera a marca", async () => {
    const versionBefore = (await q<{ version: number }>("select version from public.church_brand"))[0].version;
    await db.exec(seedFor({ ...BASE }));
    expect((await q<{ version: number }>("select version from public.church_brand"))[0].version).toBe(versionBefore);
  });
});

describe("conteúdo (3-conteudo.sql)", () => {
  it("as lições trazem o nome da igreja no lugar do marcador, e nenhum marcador sobra", async () => {
    const cycles = parseHandoff(fs.readFileSync(path.resolve(__dirname, "../../docs/HANDOFF.md"), "utf8")).filter((c) => c.number === 3);
    const sql = buildImportSql(cycles, { churchName: "Igreja Modelo" });
    expect(sql).not.toContain("{{igreja}}");
    await db.exec(sql);
    const text = (await q<{ t: string }>("select string_agg(content::text, ' ') as t from public.lesson_versions"))[0].t;
    expect(text).toContain("Igreja Modelo");
    expect(text).not.toContain("{{igreja}}");
    expect(text).not.toContain("Vertical Church");
  });
});
