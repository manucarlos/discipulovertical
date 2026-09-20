import type { BibleReference } from "./references";

export interface BibleVersionInfo {
  code: string;
  name: string;
  copyrightNotice: string | null;
  /** Modelo de URL do leitor externo; {query} vira a referência. */
  externalReaderUrl: string | null;
}

/**
 * Resultado de buscar uma passagem.
 *
 * - `external`: só um link para um leitor externo (situação atual, sem licença).
 * - `text`: texto licenciado, sempre acompanhado da nota de direitos autorais exigida.
 */
export type PassageResult =
  | { kind: "external"; label: string; url: string }
  | { kind: "text"; label: string; text: string; copyrightNotice: string }
  | { kind: "unavailable"; label: string };

/**
 * Interface do "provedor de texto bíblico". Trocar a fonte (licença direta com o titular,
 * serviço licenciado ou link externo) não exige mexer em nenhuma lição.
 */
export interface BibleProvider {
  getPassage(reference: BibleReference, versionCode: string): Promise<PassageResult>;
}

/**
 * Provedor provisório: não entrega texto, só um link para um leitor externo.
 * É o que roda enquanto a licença da NVI e da NTLH não sai.
 */
export function createExternalLinkProvider(versions: BibleVersionInfo[]): BibleProvider {
  const byCode = new Map(versions.map((v) => [v.code, v]));
  return {
    async getPassage(reference, versionCode) {
      const version = byCode.get(versionCode);
      if (!version?.externalReaderUrl) {
        return { kind: "unavailable", label: reference.label };
      }
      const url = version.externalReaderUrl.replace("{query}", encodeURIComponent(reference.label));
      return { kind: "external", label: reference.label, url };
    },
  };
}
