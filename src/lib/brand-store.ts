import { PALETTE, READING_DARK, isPalette, type Palette } from "@/lib/brand";
import { DEFAULT_CHURCH_NAME } from "@/lib/church";
import { createAnonClient } from "@/lib/supabase/anon";

/**
 * O ÚNICO módulo que lê a identidade da igreja (nome, cores, imagens) do banco. Trocar de banco no futuro é trocar
 * este arquivo (e o de gravação, em src/app/admin/marca/actions.ts). Se o banco não responder ou a resposta vier
 * estranha, o site usa o padrão do código: a marca nunca derruba uma página.
 */
export interface Identity {
  name: string;
  palette: Palette;
  readingDark: Palette;
  /** Sobe a cada mudança de cores ou de imagens; entra no endereço das imagens. */
  version: number;
  /** Quais imagens são personalizadas (as outras usam a imagem padrão). */
  assets: string[];
  /** Há cores personalizadas gravadas? */
  customColors: boolean;
}

export const ASSET_KEYS = ["logo", "icon-192", "icon-512", "icon-maskable", "icon-apple", "icon-tab", "logo-jpeg"] as const;
export type AssetKey = (typeof ASSET_KEYS)[number];

export function defaultIdentity(): Identity {
  return { name: DEFAULT_CHURCH_NAME, palette: PALETTE, readingDark: READING_DARK, version: 0, assets: [], customColors: false };
}

/** Confere a resposta da função `public_identity`, campo a campo: o que vier inválido volta ao padrão. */
export function resolveIdentity(raw: unknown): Identity {
  const base = defaultIdentity();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const palette = isPalette(r.palette) ? r.palette : null;
  const readingDark = isPalette(r.reading_dark) ? r.reading_dark : null;
  return {
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : base.name,
    palette: palette ?? base.palette,
    readingDark: readingDark ?? base.readingDark,
    version: Number.isInteger(r.version) && (r.version as number) >= 0 ? (r.version as number) : 0,
    assets: Array.isArray(r.assets) ? r.assets.filter((k): k is string => typeof k === "string" && (ASSET_KEYS as readonly string[]).includes(k)) : [],
    customColors: palette !== null && readingDark !== null,
  };
}

// Cache na memória do servidor: a marca muda raramente e cada página a lê. Sem serviço externo de cache
// (funciona igual em qualquer hospedagem). Nos testes não guarda nada.
const TTL_MS = process.env.VITEST ? 0 : 60_000;
let memo: { at: number; value: Identity } | null = null;

export function clearIdentityCache() {
  memo = null;
}

/** A identidade atual da igreja. Nunca lança erro: no pior caso devolve o padrão (ou a última leitura boa). */
export async function loadIdentity(): Promise<Identity> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.value;
  const supabase = createAnonClient();
  if (!supabase) return defaultIdentity();
  try {
    const { data, error } = await supabase.rpc("public_identity");
    if (error) return memo?.value ?? defaultIdentity();
    const value = resolveIdentity(data);
    memo = { at: Date.now(), value };
    return value;
  } catch {
    return memo?.value ?? defaultIdentity();
  }
}

export interface StoredAsset {
  contentType: "image/png" | "image/jpeg";
  bytes: Buffer;
  width: number;
  height: number;
  version: number;
}

/** Uma imagem personalizada, ou nulo se a igreja não enviou (ou se o banco não respondeu). */
export async function loadAsset(key: AssetKey): Promise<StoredAsset | null> {
  const supabase = createAnonClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("public_brand_asset", { p_key: key });
    if (error || !data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;
    if (d.content_type !== "image/png" && d.content_type !== "image/jpeg") return null;
    if (typeof d.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(d.data)) return null;
    return {
      contentType: d.content_type,
      bytes: Buffer.from(d.data, "base64"),
      width: Number(d.width),
      height: Number(d.height),
      version: Number(d.version) || 0,
    };
  } catch {
    return null;
  }
}

/** Endereço público de uma imagem da marca (o arquivo padrão é servido no lugar, se não houver personalizada). */
export const ASSET_FILES = {
  logo: "logo.png",
  "icon-192": "icone-192.png",
  "icon-512": "icone-512.png",
  "icon-maskable": "icone-maskable.png",
  "icon-apple": "icone-apple.png",
  "icon-tab": "icone-aba.png",
} as const;

export function assetUrl(file: (typeof ASSET_FILES)[keyof typeof ASSET_FILES], version = 0): string {
  return version > 0 ? `/marca/${file}?v=${version}` : `/marca/${file}`;
}
