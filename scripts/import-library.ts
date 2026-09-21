/**
 * Gera o SQL de importação da biblioteca do Grupo de Discipulado (24 lições + 4 da formação do discipulador)
 * e das trilhas prontas, tudo como rascunho.
 *
 * Uso:
 *   npm run import:library -- --igreja "Nome da igreja"              -> content/generated/biblioteca.sql
 *   npm run import:library -- --igreja "Nome da igreja" --publish     -> publica o que não tem [PREENCHER] (SÓ para homologação)
 *
 * --igreja é obrigatório: o nome entra no lugar do marcador {{igreja}} dos textos das lições.
 *
 * Cole o conteúdo do arquivo no SQL Editor do Supabase e clique em Run. Não usa nenhuma chave.
 */
import fs from "node:fs";
import path from "node:path";
import { LIBRARY_LESSONS, LIBRARY_TRACKS } from "../src/lib/library";
import { buildLibrarySql, libraryContent } from "../src/lib/library/to-sql";

const publish = process.argv.includes("--publish");
const nameIndex = process.argv.indexOf("--igreja");
const churchName = nameIndex >= 0 ? process.argv[nameIndex + 1]?.trim() : undefined;
if (!churchName) {
  console.error('Informe o nome da igreja, que entra nos textos das lições. Exemplo: npm run import:library -- --igreja "Nome da igreja"');
  process.exit(1);
}
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "content", "generated");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `biblioteca${publish ? "-publicada" : ""}.sql`);
fs.writeFileSync(outFile, buildLibrarySql(LIBRARY_LESSONS, LIBRARY_TRACKS, { publish, churchName }), "utf8");

console.log("");
for (const lesson of LIBRARY_LESSONS) {
  const blocked = JSON.stringify(libraryContent(lesson)).includes("[PREENCHER");
  const status = blocked ? "BLOQUEADA para publicação ([PREENCHER])" : publish ? "publicada" : "rascunho";
  console.log(`  ${String(lesson.n).padStart(2, "0")}  ${lesson.title}  ·  ${lesson.sensitive ? "SENSÍVEL · " : ""}${status}`);
}
console.log("");
for (const track of LIBRARY_TRACKS) console.log(`  Trilha: ${track.title} (${track.lessons.length} dias)`);
console.log("");
console.log(`Arquivo gerado: ${path.relative(root, outFile)}`);
console.log("Próximo passo: cole o conteúdo no SQL Editor do Supabase e clique em Run (veja docs/CONTAS.md).");
