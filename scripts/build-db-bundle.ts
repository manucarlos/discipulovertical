/**
 * Junta as 23 migrações num arquivo só, para colar UMA vez no SQL Editor do Supabase.
 *
 * Uso: npm run db:bundle   ->  content/generated/banco-completo.sql
 *
 * O arquivo roda numa transação: se qualquer parte falhar, NADA é gravado e o banco fica como estava.
 * Só serve para um banco novo e vazio (é a instalação inicial). Para mudanças futuras, cada migração nova
 * é aplicada sozinha, em ordem.
 */
import fs from "node:fs";
import path from "node:path";
import { buildDbBundle } from "../src/lib/db-bundle";

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "supabase", "migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const bundle = buildDbBundle(files.map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), "utf8") })));

const outDir = path.join(root, "content", "generated");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "banco-completo.sql");
fs.writeFileSync(outFile, bundle, "utf8");

console.log("");
for (const f of files) console.log(`  ${f}`);
console.log("");
console.log(`${files.length} migrações juntas em ${path.relative(root, outFile)} (${Math.round(bundle.length / 1024)} KB).`);
console.log("Próximo passo: cole o conteúdo no SQL Editor do Supabase e clique em Run (veja docs/CONTAS.md).");
