import type { PGlite } from "@electric-sql/pglite";

/**
 * Imita o subconjunto do cliente do Supabase que o aplicativo usa (from/select/insert/upsert/update/
 * delete/rpc e auth.getUser), executando SQL de verdade num banco em memória.
 *
 * Como o PostgREST, cada chamada roda em UMA transação, com o papel `authenticated` e a identidade da
 * pessoa (request.jwt.claim.sub). Assim as políticas de RLS, os privilégios por coluna e as funções do
 * banco valem exatamente como valeriam no Supabase. O que NÃO é coberto: a rede, o login do Google e o
 * PostgREST em si (nomes de operadores, cabeçalhos e limites), por isso isto é uma simulação fiel, não
 * um substituto da homologação.
 */
export interface PgError {
  code: string;
  message: string;
  details: string | null;
  hint: string | null;
}
type Result<T = unknown> = { data: T | null; error: PgError | null };

const IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`identificador inválido: ${name}`);
  return `"${name}"`;
}

/** Colunas com relação "para um" que o app pede embutidas: nome -> coluna de ligação. */
const EMBEDS: Record<string, string> = { cycles: "cycle_id", lessons: "lesson_id" };

// OIDs do Postgres que o PostgREST devolve de forma diferente do driver.
const OID = { int8: 20, numeric: 1700, timestamptz: 1184, timestamp: 1114, date: 1082 };

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function toPgError(err: unknown): PgError {
  const e = err as { code?: string; message?: string; detail?: string; hint?: string };
  return { code: e.code ?? "XX000", message: e.message ?? String(err), details: e.detail ?? null, hint: e.hint ?? null };
}

export class PgSupabase {
  private signedOut = false;

  constructor(
    private readonly db: PGlite,
    private readonly userId: string | null,
    private readonly email: string | null = null,
  ) {}

  readonly auth = {
    getUser: async () => {
      if (!this.userId || this.signedOut) return { data: { user: null }, error: null };
      return { data: { user: { id: this.userId, email: this.email } }, error: null };
    },
    getClaims: async () => ({ data: this.userId && !this.signedOut ? { claims: { sub: this.userId } } : null, error: null }),
    signOut: async () => {
      this.signedOut = true;
      return { error: null };
    },
  };

  from(table: string) {
    return new QueryBuilder(this, table);
  }

  async rpc(fn: string, args: Record<string, unknown> = {}): Promise<Result> {
    try {
      const meta = await this.db.query<{ names: string[] | null; types: string; retset: boolean }>(
        `select p.proargnames as names,
                array_to_string(array(select format_type(t::oid, null)
                                      from unnest(string_to_array(p.proargtypes::text, ' ')) with ordinality u(t, o)
                                      order by o), ',') as types,
                p.proretset as retset
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = $1`,
        [fn],
      );
      if (meta.rows.length === 0) {
        return { data: null, error: { code: "PGRST202", message: `função ${fn} não existe`, details: null, hint: null } };
      }
      const { names, types, retset } = meta.rows[0];
      const typeList = types === "" ? [] : types.split(",");

      const params: unknown[] = [];
      const assignments = Object.entries(args).map(([name, value]) => {
        const at = (names ?? []).indexOf(name);
        if (at < 0) throw new Error(`função ${fn} não tem o parâmetro ${name}`);
        params.push(value !== null && typeof value === "object" && !Array.isArray(value) ? JSON.stringify(value) : Array.isArray(value) ? JSON.stringify(value) : value);
        return `${ident(name)} := $${params.length}::${typeList[at]}`;
      });

      const call = `public.${ident(fn)}(${assignments.join(", ")})`;
      const sql = retset ? `select * from ${call}` : `select ${call} as v`;
      const { rows, fields } = await this.run(sql, params);
      const converted = rows.map((r) => convertRow(r, fields));
      return { data: retset ? converted : (converted[0]?.v ?? null), error: null };
    } catch (err) {
      return { data: null, error: toPgError(err) };
    }
  }

  /** Uma chamada = uma transação, com a identidade da pessoa. */
  async run(sql: string, params: unknown[] = []) {
    return this.db.transaction(async (tx) => {
      await tx.exec(`set local role ${this.userId && !this.signedOut ? "authenticated" : "anon"}`);
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [this.userId && !this.signedOut ? this.userId : ""]);
      const result = await tx.query<Record<string, unknown>>(sql, params);
      return { rows: result.rows, fields: result.fields as { name: string; dataTypeID: number }[] };
    });
  }
}

function convertRow(row: Record<string, unknown>, fields: { name: string; dataTypeID: number }[]) {
  const out: Record<string, unknown> = { ...row };
  for (const f of fields) {
    const v = out[f.name];
    if (v === null || v === undefined) continue;
    if (f.dataTypeID === OID.numeric) out[f.name] = Number(v);
    else if (f.dataTypeID === OID.int8) out[f.name] = Number(v);
    else if (f.dataTypeID === OID.timestamptz || f.dataTypeID === OID.timestamp) out[f.name] = (v as Date).toISOString();
    else if (f.dataTypeID === OID.date) out[f.name] = (v as Date).toISOString().slice(0, 10);
  }
  return out;
}

type Op = "select" | "insert" | "upsert" | "update" | "delete";
interface Filter {
  column: string;
  kind: "eq" | "neq" | "is" | "in";
  value: unknown;
}

class QueryBuilder implements PromiseLike<Result> {
  private op: Op = "select";
  private columns = "*";
  private returning = false;
  private payload: Record<string, unknown>[] = [];
  private conflictColumns: string[] = [];
  private ignoreDuplicates = false;
  private filters: Filter[] = [];
  private orders: { column: string; ascending: boolean }[] = [];
  private max: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";

  constructor(
    private readonly client: PgSupabase,
    private readonly table: string,
  ) {}

  select(columns = "*") {
    this.columns = columns;
    if (this.op !== "select") this.returning = true;
    return this;
  }
  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.op = "insert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }
  upsert(payload: Record<string, unknown> | Record<string, unknown>[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    this.conflictColumns = (options.onConflict ?? "").split(",").map((c) => c.trim()).filter(Boolean);
    this.ignoreDuplicates = options.ignoreDuplicates ?? false;
    return this;
  }
  update(payload: Record<string, unknown>) {
    this.op = "update";
    this.payload = [payload];
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ column, kind: "eq", value });
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push({ column, kind: "neq", value });
    return this;
  }
  is(column: string, value: null | boolean) {
    this.filters.push({ column, kind: "is", value });
    return this;
  }
  in(column: string, value: unknown[]) {
    this.filters.push({ column, kind: "in", value });
    return this;
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending ?? true });
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single<T = Record<string, unknown>>() {
    this.mode = "single";
    return this as unknown as PromiseLike<Result<T>>;
  }
  maybeSingle<T = Record<string, unknown>>() {
    this.mode = "maybe";
    return this as unknown as PromiseLike<Result<T>>;
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.execute().then(onfulfilled, onrejected);
  }

  // ------------------------------------------------------------------ SQL

  private selectList(): string {
    if (this.columns.trim() === "*") return "t.*";
    return splitTopLevel(this.columns)
      .map((token) => {
        const embed = /^([a-z_]+)\((.+)\)$/.exec(token);
        if (embed) {
          const [, name, inner] = embed;
          const fk = EMBEDS[name];
          if (!fk) throw new Error(`relação embutida não suportada pelo adaptador: ${name}`);
          const inside = splitTopLevel(inner).map((c) => `e.${ident(c)}`).join(", ");
          return `(select to_jsonb(x) from (select ${inside} from public.${ident(name)} e where e.id = t.${ident(fk)}) x) as ${ident(name)}`;
        }
        return `t.${ident(token)}`;
      })
      .join(", ");
  }

  private where(params: unknown[]): string {
    if (this.filters.length === 0) return "";
    const parts = this.filters.map((f) => {
      const col = `t.${ident(f.column)}`;
      if (f.kind === "is") return `${col} is ${f.value === null ? "null" : f.value ? "true" : "false"}`;
      if (f.kind === "in") {
        params.push(f.value);
        return `${col} = any($${params.length})`;
      }
      params.push(f.value);
      return `${col} ${f.kind === "eq" ? "=" : "<>"} $${params.length}`;
    });
    return ` where ${parts.join(" and ")}`;
  }

  private build(): { sql: string; params: unknown[]; returns: boolean } {
    const params: unknown[] = [];
    const table = `public.${ident(this.table)}`;

    if (this.op === "select") {
      let sql = `select ${this.selectList()} from ${table} t${this.where(params)}`;
      if (this.orders.length) sql += ` order by ${this.orders.map((o) => `t.${ident(o.column)} ${o.ascending ? "asc" : "desc"}`).join(", ")}`;
      if (this.max !== null) sql += ` limit ${Number(this.max)}`;
      return { sql, params, returns: true };
    }

    const returning = this.returning ? ` returning ${this.selectList().replaceAll("t.", "")}` : "";

    if (this.op === "insert" || this.op === "upsert") {
      const keys = [...new Set(this.payload.flatMap((row) => Object.keys(row)))];
      const values = this.payload
        .map((row) => {
          const cells = keys.map((k) => {
            const v = row[k];
            params.push(v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v);
            return `$${params.length}`;
          });
          return `(${cells.join(", ")})`;
        })
        .join(", ");
      let sql = `insert into ${table} (${keys.map(ident).join(", ")}) values ${values}`;
      if (this.op === "upsert") {
        const target = this.conflictColumns.map(ident).join(", ");
        const updates = keys.filter((k) => !this.conflictColumns.includes(k)).map((k) => `${ident(k)} = excluded.${ident(k)}`);
        sql += this.ignoreDuplicates || updates.length === 0
          ? ` on conflict (${target}) do nothing`
          : ` on conflict (${target}) do update set ${updates.join(", ")}`;
      }
      return { sql: sql + returning, params, returns: this.returning };
    }

    if (this.op === "update") {
      const row = this.payload[0];
      const sets = Object.entries(row).map(([k, v]) => {
        params.push(v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v);
        return `${ident(k)} = $${params.length}`;
      });
      return { sql: `update ${table} t set ${sets.join(", ")}${this.where(params)}${returning}`, params, returns: this.returning };
    }

    return { sql: `delete from ${table} t${this.where(params)}${returning}`, params, returns: this.returning };
  }

  private async execute(): Promise<Result> {
    try {
      const { sql, params, returns } = this.build();
      const { rows, fields } = await this.client.run(sql, params);
      const converted = rows.map((r) => convertRow(r, fields));

      if (!returns) return { data: null, error: null };
      if (this.mode === "many") return { data: converted, error: null };
      if (converted.length === 1) return { data: converted[0], error: null };
      if (converted.length === 0 && this.mode === "maybe") return { data: null, error: null };
      return {
        data: null,
        error: {
          code: "PGRST116",
          message: "JSON object requested, multiple (or no) rows returned",
          details: `The result contains ${converted.length} rows`,
          hint: null,
        },
      };
    } catch (err) {
      return { data: null, error: toPgError(err) };
    }
  }
}
