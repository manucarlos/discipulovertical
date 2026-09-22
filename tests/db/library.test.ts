import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { LIBRARY_LESSONS, LIBRARY_TRACKS } from "@/lib/library";
import { buildLibrarySql } from "@/lib/library/to-sql";
import { createDb } from "./harness";

let db: PGlite;
const q = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.query<T>(sql, params).then((r) => r.rows);

beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

describe("importação da biblioteca (rascunho)", () => {
  it("cria as 28 lições da biblioteca e as 6 trilhas, tudo como rascunho, sem ciclo", async () => {
    await db.exec(buildLibrarySql(LIBRARY_LESSONS, LIBRARY_TRACKS, { churchSlug: "vertical-church" }));
    const lessons = await q<{ slug: string; kind: string; status: string; cycle_id: string | null; sensitive: boolean; has_placeholders: boolean; position: number }>(
      "select slug, kind, status, cycle_id, sensitive, has_placeholders, position from public.lessons order by position",
    );
    expect(lessons).toHaveLength(28);
    expect(lessons.every((l) => l.kind === "library" && l.status === "draft" && l.cycle_id === null)).toBe(true);
    expect(lessons.filter((l) => l.sensitive).map((l) => l.position)).toEqual([9, 10, 12, 13, 14, 16, 17, 28]);
    expect(lessons.filter((l) => l.has_placeholders).map((l) => l.position)).toEqual([7, 9, 10, 12, 13, 14, 16, 17, 28]);

    const tracks = await q<{ title: string; status: string; dias: number }>(
      "select t.title, t.status, (select count(*)::int from public.track_days d where d.track_id = t.id) as dias from public.tracks t order by t.created_at",
    );
    expect(tracks).toEqual([
      { title: "Caminhada e Coração", status: "draft", dias: 7 },
      { title: "Mordomia e Finanças", status: "draft", dias: 7 },
      { title: "Maturidade em Comunidade", status: "draft", dias: 7 },
      { title: "Casamento Firme", status: "draft", dias: 4 },
      { title: "Jornada Completa", status: "draft", dias: 24 },
      { title: "Formação do discipulador", status: "draft", dias: 4 },
    ]);
  });

  it("a lição 14 está nas duas trilhas; a ordem dos dias segue a tabela", async () => {
    const days = await q<{ day_number: number; slug: string }>(
      "select d.day_number, l.slug from public.track_days d join public.lessons l on l.id = d.lesson_id join public.tracks t on t.id = d.track_id where t.title = 'Casamento Firme' order by d.day_number",
    );
    expect(days.map((d) => d.slug)).toEqual(["lib-15-casamento-como-alianca", "lib-16-comunicacao-e-conflitos", "lib-14-magoa-e-perdao", "lib-17-crises-no-casamento"]);
    expect((await q("select 1 from public.track_days d join public.lessons l on l.id = d.lesson_id where l.slug = 'lib-14-magoa-e-perdao'")).length).toBe(3); // Caminhada e Coração, Casamento Firme e Jornada Completa
  });

  it("cada lição tem uma versão com o conteúdo, o guia do encontro e a nota interna para a revisão", async () => {
    const [row] = await q<{ content: { blocks: unknown[]; practice: { title: string; items: string[] }; reflection: string; guide: string[] }; pastoral_review_note: string; draft_notice: string }>(
      `select v.content, n.pastoral_review_note, n.draft_notice
       from public.lessons l join public.lesson_versions v on v.id = l.current_version_id join public.lesson_internal_notes n on n.lesson_id = l.id
       where l.slug = 'lib-12-ansiedade'`,
    );
    expect(row.content.blocks.length).toBeGreaterThan(5);
    expect(row.content.practice.title).toBe("Desafio do dia");
    expect(row.content.guide.length).toBe(4);
    expect(row.pastoral_review_note).toMatch(/^SENSÍVEL\./);
    expect(row.draft_notice).toMatch(/Revisão pastoral obrigatória/);
  });

  it("é seguro repetir: nada é duplicado nem sobrescrito", async () => {
    await q("update public.lessons set title = 'Título editado pelo pastor' where slug = 'lib-01-andar-com-deus'");
    await db.exec(buildLibrarySql(LIBRARY_LESSONS, LIBRARY_TRACKS, { churchSlug: "vertical-church" }));
    expect((await q("select 1 from public.lessons")).length).toBe(28);
    expect((await q("select 1 from public.tracks")).length).toBe(6);
    expect((await q<{ title: string }>("select title from public.lessons where slug = 'lib-01-andar-com-deus'"))[0].title).toBe("Título editado pelo pastor");
  });

  it("nenhuma lição com [PREENCHER] pode ser publicada (o banco recusa), e as demais podem", async () => {
    await expect(q("update public.lessons set status = 'published' where slug = 'lib-12-ansiedade'")).rejects.toThrow(/lessons_no_publish_with_placeholders|PREENCHER/);
    await q("update public.lessons set status = 'published' where slug = 'lib-01-andar-com-deus'");
  });

  it("uma trilha só publica quando todas as lições estão publicadas", async () => {
    await expect(q("update public.tracks set status = 'published' where title = 'Jornada Completa'")).rejects.toThrow(/lições da trilha precisam estar publicadas/);
  });
});

describe("importação com --publish (homologação)", () => {
  it("publica só o que não tem [PREENCHER]; trilhas com lição bloqueada continuam rascunho", async () => {
    const other = await createDb();
    try {
      await other.exec(buildLibrarySql(LIBRARY_LESSONS, LIBRARY_TRACKS, { publish: true, churchSlug: "vertical-church" }));
      const published = await other.query<{ position: number }>("select position from public.lessons where status = 'published' order by position");
      expect(published.rows).toHaveLength(28 - 9);
      const tracks = await other.query<{ title: string; status: string }>("select title, status from public.tracks order by created_at");
      // Todas as trilhas incluem pelo menos uma lição com [PREENCHER] (7, 9, 10, 12, 13, 14, 16, 17 ou 28), exceto Maturidade.
      expect(tracks.rows.find((t) => t.title === "Maturidade em Comunidade")!.status).toBe("published");
      expect(tracks.rows.filter((t) => t.status === "published").map((t) => t.title)).toEqual(["Maturidade em Comunidade"]);
    } finally {
      await other.close();
    }
  });
});
