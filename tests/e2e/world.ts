import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { parseHandoff } from "@/lib/content/parse-handoff";
import { buildImportSql } from "@/lib/content/to-sql";
import { createDb, createUser } from "../db/harness";
import { session } from "./session";
import { PgSupabase } from "./supabase-pg";

export const CYCLES = parseHandoff(fs.readFileSync(path.resolve(__dirname, "../../docs/HANDOFF.md"), "utf8"));

export interface Persona {
  name: string;
  email: string;
  id: string | null;
}

/** As três pessoas do roteiro de usabilidade. */
export const CLAUDIAO: Persona = { name: "Claudião", email: "claudiao@example.com", id: null };
export const CLAUDINHO: Persona = { name: "Claudinho", email: "claudinho@example.com", id: null };
export const CLAUDIO: Persona = { name: "Claudio", email: "claudio@example.com", id: null };

/**
 * Um "mundo" completo em memória: o banco com as migrações reais, e o que a igreja faria antes de abrir
 * (definir o primeiro administrador). Cada pessoa entra como o Google a faria: uma linha em auth.users,
 * que dispara a criação do perfil.
 */
export class World {
  private constructor(readonly db: PGlite) {}

  static async create(initialAdminEmail = CLAUDIAO.email): Promise<World> {
    const world = new World(await createDb());
    const church = (await world.sql<{ id: string }>("select id from public.churches where slug = 'vertical-church'"))[0].id;
    await world.sql("insert into public.church_admins_pending (email, church_id) values ($1, $2)", [initialAdminEmail, church]);
    return world;
  }

  close() {
    return this.db.close();
  }

  /** Como dono do banco (SQL Editor do Supabase). */
  async sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
    return (await this.db.query<T>(query, params)).rows;
  }

  /** Entra como a pessoa: cria o usuário na primeira vez (como o login do Google) e passa a agir por ela. */
  async login(persona: Persona): Promise<string> {
    if (!persona.id) {
      persona.id = await createUser(this.db, persona.email, { name: persona.name });
    }
    session.client = new PgSupabase(this.db, persona.id, persona.email);
    return persona.id;
  }

  /** Visitante sem login. */
  visitor() {
    session.client = new PgSupabase(this.db, null);
  }

  /** O que a pessoa da igreja faz antes: cola no SQL Editor o SQL gerado pelo importador. */
  async importContent(options: { publish?: boolean; cycles?: number[] } = {}) {
    const chosen = options.cycles ? CYCLES.filter((c) => options.cycles!.includes(c.number)) : CYCLES;
    await this.db.exec(buildImportSql(chosen, { publish: options.publish, churchSlug: "vertical-church" }));
  }

  /**
   * Faz "passar o tempo": empurra para o passado todos os carimbos de data do progresso, do jeito que
   * a realidade os deixaria daqui a N dias. O relógio do teste fica no presente, o que mantém o TypeScript e
   * o now() do banco de acordo.
   */
  async passDays(days: number) {
    const shift = `${days} days`;
    await this.sql(
      `update public.lesson_progress set
         released_at = released_at - $1::interval,
         started_at = started_at - $1::interval,
         completed_at = completed_at - $1::interval,
         updated_at = updated_at - $1::interval`,
      [shift],
    );
    await this.sql(
      `update public.cycle_progress set started_at = started_at - $1::interval, completed_at = completed_at - $1::interval`,
      [shift],
    );
    await this.sql(`update public.profiles set created_at = created_at - $1::interval, onboarded_at = onboarded_at - $1::interval`, [shift]);
  }
}

// ---------------------------------------------------------------------------------------------
// Visitar uma tela: chama a página (um Server Component) como o Next faria e devolve o que a pessoa vê.
// ---------------------------------------------------------------------------------------------

export interface Visit {
  /** Para onde a página mandou a pessoa, se redirecionou. */
  redirect: string | null;
  notFound: boolean;
  /** HTML renderizado. */
  html: string;
  /** Só o texto visível (sem marcação), com espaços normalizados. */
  text: string;
}

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

export function visibleText(html: string): string {
  return decode(html.replace(/<(script|style)[\s\S]*?<\/\1>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function digestOf(error: unknown): string | null {
  const d = (error as { digest?: unknown })?.digest;
  return typeof d === "string" ? d : null;
}

/** Executa algo que pode redirecionar (`redirect()`) ou dar 404, e diz o que aconteceu. */
export async function outcome<T>(fn: () => Promise<T>): Promise<{ redirect: string | null; notFound: boolean; value?: T }> {
  try {
    return { redirect: null, notFound: false, value: await fn() };
  } catch (error) {
    const digest = digestOf(error);
    if (digest?.startsWith("NEXT_REDIRECT")) return { redirect: digest.split(";")[2], notFound: false };
    if (digest?.startsWith("NEXT_HTTP_ERROR_FALLBACK;404") || digest === "NEXT_NOT_FOUND") return { redirect: null, notFound: true };
    throw error;
  }
}

type PageFn = (props: never) => Promise<ReactElement> | ReactElement;

/** Abre uma página com os parâmetros de rota e de busca dados. */
export async function visit(
  page: PageFn,
  args: { params?: Record<string, string>; search?: Record<string, string> } = {},
): Promise<Visit> {
  const props = {
    params: Promise.resolve(args.params ?? {}),
    searchParams: Promise.resolve(args.search ?? {}),
  };
  const result = await outcome(async () => renderToStaticMarkup(await (page as (p: unknown) => Promise<ReactElement>)(props)));
  const html = result.value ?? "";
  return { redirect: result.redirect, notFound: result.notFound, html, text: visibleText(html) };
}

/** Preenche um FormData como o navegador faria. */
export function form(fields: Record<string, string | boolean>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === true) data.set(key, "on");
    else if (value !== false) data.set(key, String(value));
  }
  return data;
}
