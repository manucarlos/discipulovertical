import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { PALETTE, READING_DARK } from "@/lib/brand";
import { asUser, createDb, createUser } from "./harness";

/** Identidade da igreja (RF-33): cores e imagens editáveis pelo Admin, legíveis por qualquer visitante. */
let db: PGlite;
let admin: string;
let member: string;

const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);

async function asAnon<T>(fn: () => Promise<T>): Promise<T> {
  await db.exec("set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

const INPUTS = { brand: "#c14602", foreground: "#171717", background: "#fbf9f7" };
const save = (inputs: unknown = INPUTS, light: unknown = PALETTE, dark: unknown = READING_DARK) =>
  q("select public.save_church_brand($1::jsonb, $2::jsonb, $3::jsonb)", [JSON.stringify(inputs), JSON.stringify(light), JSON.stringify(dark)]);

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const asset = (over: Partial<Record<string, unknown>> = {}) => ({ key: "logo", content_type: "image/png", data: PNG_B64, width: 1, height: 1, ...over });
const saveAssets = (list: unknown[]) => q("select public.save_church_assets($1::jsonb)", [JSON.stringify(list)]);
const identity = () => asAnon(async () => (await q<{ v: Record<string, unknown> }>("select public.public_identity() as v"))[0].v);

beforeAll(async () => {
  db = await createDb();
  await q("insert into public.church_admins_pending (email, church_id) values ('pastor@example.com', (select id from public.churches where slug = 'vertical-church'))");
  admin = await createUser(db, "pastor@example.com");
  member = await createUser(db, "membro@example.com");
});
afterAll(async () => {
  await db.close();
});

describe("sem personalização", () => {
  it("o visitante vê o nome da igreja e nenhuma paleta nem imagem própria (o site usa o padrão do código)", async () => {
    expect(await identity()).toEqual({ name: "Vertical Church", palette: null, reading_dark: null, version: 0, assets: [] });
    expect(await asAnon(async () => (await q<{ v: unknown }>("select public.public_brand_asset('logo') as v"))[0].v)).toBeNull();
  });

  it("as tabelas não são acessíveis direto por visitante nem por membro", async () => {
    for (const table of ["church_brand", "church_assets"]) {
      await expect(asAnon(() => q(`select * from public.${table}`))).rejects.toThrow(/permission denied/);
      expect(await asUser(db, member, () => q(`select * from public.${table}`))).toHaveLength(0);
      await expect(asUser(db, member, () => q(`delete from public.${table} where true`))).rejects.toThrow();
    }
  });
});

describe("cores", () => {
  it("só o Admin salva; visitante e membro são recusados", async () => {
    await expect(asAnon(() => save())).rejects.toThrow(/permission denied/);
    await expect(asUser(db, member, () => save())).rejects.toThrow(/não autorizado/);
  });

  it("o Admin salva, o visitante passa a ler a paleta, e a mudança fica no registro", async () => {
    await asUser(db, admin, () => save());
    const v = await identity();
    expect(v.palette).toEqual(PALETTE);
    expect(v.reading_dark).toEqual(READING_DARK);
    expect(v.version).toBe(1);
    const log = await q<{ actor_id: string; entity_id: string }>("select actor_id, entity_id from public.audit_log where action = 'brand_changed'");
    expect(log).toEqual([{ actor_id: admin, entity_id: "colors" }]);
  });

  it("uma segunda gravação troca a paleta e sobe a versão (usada no endereço das imagens)", async () => {
    await asUser(db, admin, () => save(INPUTS, { ...PALETTE, brand: "#1d4ed8" }));
    const v = await identity();
    expect((v.palette as { brand: string }).brand).toBe("#1d4ed8");
    expect(v.version).toBe(2);
  });

  it("recusa paleta inválida: cor mal formada, código no lugar da cor, papel faltando ou sobrando", async () => {
    const attempts: [string, unknown][] = [
      ["cor sem #", { ...PALETTE, brand: "c14602" }],
      ["maiúsculas", { ...PALETTE, brand: "#C14602" }],
      ["código CSS no lugar da cor", { ...PALETTE, brand: "#c14602;background:url(https://x.example)" }],
      ["nome de cor", { ...PALETTE, brand: "red" }],
      ["papel faltando", Object.fromEntries(Object.entries(PALETTE).filter(([k]) => k !== "line"))],
      ["papel sobrando", { ...PALETTE, extra: "#000000" }],
      ["não é um objeto", ["#000000"]],
    ];
    for (const [name, palette] of attempts) {
      await expect(asUser(db, admin, () => save(INPUTS, palette)), name).rejects.toThrow(/paleta de cores é inválida/);
    }
    await expect(asUser(db, admin, () => save({ brand: "#c14602" }))).rejects.toThrow(/cores escolhidas são inválidas/);
    await expect(asUser(db, admin, () => save({ ...INPUTS, brand: "x" }))).rejects.toThrow(/cores escolhidas são inválidas/);
    await expect(asUser(db, admin, () => save(null))).rejects.toThrow(/cores escolhidas são inválidas/);
    expect(((await identity()).palette as { brand: string }).brand).toBe("#1d4ed8"); // nada foi alterado
  });
});

describe("imagens", () => {
  it("só o Admin grava imagens", async () => {
    await expect(asAnon(() => saveAssets([asset()]))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, member, () => saveAssets([asset()]))).rejects.toThrow(/não autorizado/);
  });

  it("o Admin grava, o visitante lê a imagem e a lista de imagens próprias, e a versão sobe", async () => {
    const before = (await identity()).version as number;
    await asUser(db, admin, () => saveAssets([asset(), asset({ key: "icon-192" })]));
    const v = await identity();
    expect(v.assets).toEqual(["icon-192", "logo"]);
    expect(v.version).toBe(before + 1);
    const got = await asAnon(async () => (await q<{ v: { content_type: string; data: string; version: number } }>("select public.public_brand_asset('logo') as v"))[0].v);
    expect(got).toMatchObject({ content_type: "image/png", data: PNG_B64, version: before + 1 });
  });

  it("gravar só imagem não apaga as cores já escolhidas", async () => {
    expect(((await identity()).palette as { brand: string }).brand).toBe("#1d4ed8");
  });

  it("recusa chave desconhecida, tipo que não é imagem, base64 inválido, tamanho absurdo e lista vazia", async () => {
    const bad: [string, unknown[]][] = [
      ["chave desconhecida", [asset({ key: "../../etc" })]],
      ["tipo perigoso (SVG)", [asset({ content_type: "image/svg+xml" })]],
      ["tipo de texto", [asset({ content_type: "text/html" })]],
      ["base64 com lixo", [asset({ data: "<script>alert(1)</script>" })]],
      ["largura absurda", [asset({ width: 100000 })]],
      ["dados grandes demais", [asset({ data: "A".repeat(700001) })]],
      ["lista vazia", []],
    ];
    for (const [name, list] of bad) await expect(asUser(db, admin, () => saveAssets(list)), name).rejects.toThrow();
    expect((await identity()).assets).toEqual(["icon-192", "logo"]);
  });

  it("uma imagem inválida no meio do lote desfaz o lote inteiro", async () => {
    await expect(asUser(db, admin, () => saveAssets([asset({ key: "icon-512" }), asset({ key: "icon-tab", width: 0 })]))).rejects.toThrow();
    expect((await identity()).assets).toEqual(["icon-192", "logo"]);
  });
});

describe("restaurar o padrão", () => {
  it("só o Admin; apaga cores e imagens e deixa registro", async () => {
    await expect(asUser(db, member, () => q("select public.reset_church_brand()"))).rejects.toThrow(/não autorizado/);
    await asUser(db, admin, () => q("select public.reset_church_brand()"));
    expect(await identity()).toEqual({ name: "Vertical Church", palette: null, reading_dark: null, version: 0, assets: [] });
    const log = await q<{ action: string }>("select action from public.audit_log where action = 'brand_reset'");
    expect(log).toHaveLength(1);
  });
});
