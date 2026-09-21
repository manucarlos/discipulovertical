export interface MigrationFile {
  name: string;
  sql: string;
}

/**
 * Junta migrações num único script, em ordem de nome, dentro de uma transação. Falhou em qualquer ponto,
 * nada é gravado. Cada migração vem com um cabeçalho, para achar o ponto de um eventual erro.
 */
export function buildDbBundle(files: MigrationFile[]): string {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const parts = [
    "-- Banco completo da plataforma de discipulado (gerado por scripts/build-db-bundle.ts). Não edite à mão.",
    `-- ${sorted.length} migrações em ordem, numa única transação: se algo falhar, nada é gravado.`,
    "-- Só para um banco NOVO e vazio. Para rodar de novo depois de uma falha, basta colar de novo.",
    "begin;",
    "",
  ];
  for (const f of sorted) {
    parts.push(`-- ===== ${f.name} =====`, f.sql.trimEnd(), "");
  }
  parts.push("commit;", "", "-- Conferência: deve listar as tabelas criadas (todas com rls = true).", "select c.relname as tabela, c.relrowsecurity as rls", "from pg_class c join pg_namespace n on n.oid = c.relnamespace", "where n.nspname = 'public' and c.relkind = 'r' order by 1;", "");
  return parts.join("\n");
}
