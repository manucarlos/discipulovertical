/**
 * Kit de instalação para uma igreja nova (docs/EXPANSAO.md).
 *
 * Uso:
 *   npm run kit -- exemplo                 -> lê churches/exemplo.json
 *   npm run kit -- caminho/da/igreja.json  -> lê o arquivo indicado
 *
 * Gera, em content/generated/kit-<slug>/:
 *   1-banco.sql         as migrações (o banco completo)
 *   2-identidade.sql    nome, contato, primeiro administrador e cores da igreja
 *   3-conteudo.sql      as lições dos Ciclos escolhidos, com o nome da igreja nos textos
 *   4-biblioteca.sql    a biblioteca do Grupo de Discipulado (se pedida)
 *   variaveis.env       as variáveis do site (Vercel)
 *   roteiro.md          o passo a passo personalizado
 *
 * Não usa nenhuma chave nem conta: só gera arquivos. Quem cola os SQLs e cria os projetos é a pessoa.
 * Os arquivos churches/*.json (dados de igrejas de verdade) não vão para o GitHub; só o exemplo.json.
 */
import fs from "node:fs";
import path from "node:path";
import { buildDbBundle } from "../src/lib/db-bundle";
import { HandoffParseError, parseHandoff } from "../src/lib/content/parse-handoff";
import { buildImportSql } from "../src/lib/content/to-sql";
import { buildEnvExample, buildRoteiro, buildSeedSql, validateChurchConfig, type KitFiles } from "../src/lib/kit/church-config";
import { LIBRARY_LESSONS, LIBRARY_TRACKS } from "../src/lib/library";
import { buildLibrarySql } from "../src/lib/library/to-sql";

const root = path.resolve(__dirname, "..");

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Informe a igreja. Exemplo: npm run kit -- exemplo   (lê churches/exemplo.json)");
    process.exit(1);
  }
  const file = arg.endsWith(".json") ? path.resolve(arg) : path.join(root, "churches", `${arg}.json`);
  if (!fs.existsSync(file)) {
    console.error(`Arquivo não encontrado: ${file}\nCopie churches/exemplo.json, preencha com os dados da igreja e rode de novo.`);
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`O arquivo não é um JSON válido: ${(error as Error).message}`);
    process.exit(1);
  }
  const result = validateChurchConfig(raw);
  if (!result.ok) {
    console.error(`\nO arquivo de configuração tem problemas:\n${result.errors.map((e) => `  - ${e}`).join("\n")}\n`);
    process.exit(1);
  }
  const { config, palette } = result;

  const migrationsDir = path.join(root, "supabase", "migrations");
  const migrations = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  let cycles;
  try {
    const all = parseHandoff(fs.readFileSync(path.join(root, "docs", "HANDOFF.md"), "utf8"));
    cycles = all.filter((c) => config.content.cycles.includes(c.number));
  } catch (error) {
    if (error instanceof HandoffParseError) {
      console.error(`\nErro no handoff: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const names: KitFiles = {
    banco: "1-banco.sql",
    identidade: "2-identidade.sql",
    conteudo: "3-conteudo.sql",
    biblioteca: config.content.library ? "4-biblioteca.sql" : null,
    variaveis: "variaveis.env",
  };

  const outDir = path.join(root, "content", "generated", `kit-${config.slug}`);
  fs.mkdirSync(outDir, { recursive: true });
  const write = (name: string, text: string) => fs.writeFileSync(path.join(outDir, name), text, "utf8");

  write(names.banco, buildDbBundle(migrations.map((name) => ({ name, sql: fs.readFileSync(path.join(migrationsDir, name), "utf8") }))));
  write(names.identidade, buildSeedSql(config, palette));
  write(names.conteudo, buildImportSql(cycles, { churchName: config.name }));
  if (names.biblioteca) write(names.biblioteca, buildLibrarySql(LIBRARY_LESSONS, LIBRARY_TRACKS, { churchName: config.name }));
  write(names.variaveis, buildEnvExample(config));
  write("roteiro.md", buildRoteiro(config, names));

  console.log(`\nKit de ${config.name} (${config.slug}) gerado em ${path.relative(root, outDir)}:`);
  for (const f of fs.readdirSync(outDir).sort()) console.log(`  ${f}  (${Math.round(fs.statSync(path.join(outDir, f)).size / 1024)} KB)`);
  if (palette?.adjustedBrand) console.log(`\nAtenção: a cor da igreja era clara demais para servir de botão e de link; o kit usa ${palette.adjustedBrand}.`);
  console.log("\nPróximo passo: abra roteiro.md e siga na ordem.");
}

main();
