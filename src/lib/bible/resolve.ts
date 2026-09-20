import type { BibleProvider } from "./provider";
import { findReferences } from "./references";

/**
 * Descobre todas as referências bíblicas nos textos e resolve cada uma pelo provedor.
 * Devolve um mapa "João 3.16" -> URL, só com o que o provedor consegue abrir.
 * (Hoje o provedor só dá links; quando houver texto licenciado, este é o ponto de troca.)
 */
export async function resolvePassageLinks(
  provider: BibleProvider,
  texts: string[],
  versionCode: string,
): Promise<Record<string, string>> {
  const unique = new Map<string, ReturnType<typeof findReferences>[number]["reference"]>();
  for (const text of texts) {
    for (const { reference } of findReferences(text)) unique.set(reference.label, reference);
  }

  const entries = await Promise.all(
    [...unique.values()].map(async (reference) => {
      const passage = await provider.getPassage(reference, versionCode);
      return passage.kind === "external" ? ([reference.label, passage.url] as const) : null;
    }),
  );
  return Object.fromEntries(entries.filter((e) => e !== null));
}
