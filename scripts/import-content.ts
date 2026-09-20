/**
 * Lê a Parte 2 do handoff e gera o SQL de importação das lições (como rascunho).
 *
 * Uso:
 *   npm run import:sql                 -> todos os ciclos
 *   npm run import:sql -- --cycle 1    -> só o Ciclo 1
 *   npm run import:sql -- --publish    -> publica as lições sem [PREENCHER] (SÓ para homologação)
 *
 * O arquivo sai em content/generated/. Cole o conteúdo no SQL Editor do Supabase e clique em Run.
 * Não usa nenhuma chave: o SQL Editor já roda com permissão de administrador do banco.
 */
import fs from "node:fs";
import path from "node:path";
import { parseHandoff, HandoffParseError } from "../src/lib/content/parse-handoff";
import { buildImportSql } from "../src/lib/content/to-sql";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const root = path.resolve(__dirname, "..");
const handoffPath = path.join(root, "docs", "HANDOFF.md");

try {
  const all = parseHandoff(fs.readFileSync(handoffPath, "utf8"));

  const only = value("cycle");
  const cycles = only ? all.filter((c) => String(c.number) === only) : all;
  if (cycles.length === 0) {
    console.error(`Nenhum ciclo encontrado para --cycle ${only}. Ciclos disponíveis: ${all.map((c) => c.number).join(", ")}.`);
    process.exit(1);
  }

  const publish = flag("publish");
  const sql = buildImportSql(cycles, { publish });

  const outDir = path.join(root, "content", "generated");
  fs.mkdirSync(outDir, { recursive: true });
  const name = only ? `ciclo-${only}` : "todos-os-ciclos";
  const outFile = path.join(outDir, `${name}${publish ? "-publicado" : ""}.sql`);
  fs.writeFileSync(outFile, sql, "utf8");

  console.log("");
  for (const cycle of cycles) {
    console.log(`Ciclo ${cycle.number}: ${cycle.title}`);
    for (const lesson of cycle.lessons) {
      const status = lesson.hasPlaceholders
        ? `BLOQUEADA para publicação (${lesson.placeholderCount} marcador(es) [PREENCHER])`
        : publish
          ? "publicada"
          : "rascunho";
      console.log(`  ${lesson.id}  ${lesson.title}  ·  ${status}`);
    }
  }
  const blocked = cycles.flatMap((c) => c.lessons).filter((l) => l.hasPlaceholders).length;
  console.log("");
  console.log(`Arquivo gerado: ${path.relative(root, outFile)}`);
  if (blocked > 0) {
    console.log(`Atenção: ${blocked} lição(ões) têm [PREENCHER] e só poderão ser publicadas depois de resolvidas no editor.`);
  }
  if (publish) {
    console.log("Atenção: --publish é só para testes em homologação. Em produção, o pastor revisa e publica no painel.");
  }
  console.log("Próximo passo: abra o arquivo, copie tudo, cole no SQL Editor do Supabase e clique em Run.");
} catch (error) {
  if (error instanceof HandoffParseError) {
    console.error(`\nErro no handoff: ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
