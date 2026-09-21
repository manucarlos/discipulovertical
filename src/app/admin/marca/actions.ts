"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";
import { describeEditorError } from "@/lib/admin/errors";
import { derivePalette } from "@/lib/brand-derive";
import { ImageError, MAX_UPLOAD_BYTES, processLogo } from "@/lib/brand-images";
import { ASSET_KEYS, clearIdentityCache } from "@/lib/brand-store";
import { requireAdmin } from "@/lib/auth";

export type BrandState = { error: string } | { ok: string } | null;

const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

/** Depois de qualquer mudança: esquece o cache do servidor e manda as páginas se refazerem com a marca nova. */
function afterChange() {
  clearIdentityCache();
  revalidatePath("/", "layout");
}

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/**
 * Salva as 3 cores. A paleta completa é (re)calculada AQUI, no servidor, com a garantia de contraste; o que o
 * navegador mostrou na prévia não é confiado. O banco confere de novo o formato de cada cor.
 */
export async function saveBrandColors(_previous: BrandState, formData: FormData): Promise<BrandState> {
  const { supabase } = await requireAdmin();
  const result = derivePalette({ brand: text(formData, "brand"), foreground: text(formData, "foreground"), background: text(formData, "background") });
  if (!result.ok) return { error: result.errors.join(" ") };

  const { error } = await supabase.rpc("save_church_brand", { p_inputs: result.inputs, p_palette: result.light, p_reading_dark: result.readingDark });
  if (error) return { error: describeEditorError(error).message };
  afterChange();
  return {
    ok: result.adjustedBrand
      ? `Cores salvas. A cor da igreja foi escurecida para ${result.adjustedBrand} para ficar legível.`
      : "Cores salvas. Já valem para todo o site.",
  };
}

/** Envia o logotipo (e, opcionalmente, um símbolo para o ícone da aba) e gera todas as imagens da marca. */
export async function uploadBrandImages(_previous: BrandState, formData: FormData): Promise<BrandState> {
  const { supabase } = await requireAdmin();
  const logo = formData.get("logo");
  if (!(logo instanceof File) || logo.size === 0) return { error: "Escolha o arquivo do logotipo." };
  const symbolFile = formData.get("symbol");
  const symbol = symbolFile instanceof File && symbolFile.size > 0 ? Buffer.from(await symbolFile.arrayBuffer()) : undefined;

  let images;
  try {
    images = await processLogo(Buffer.from(await logo.arrayBuffer()), { symbol });
  } catch (error) {
    if (error instanceof ImageError) return { error: error.message };
    throw error;
  }
  const { error } = await supabase.rpc("save_church_assets", { p_assets: images });
  if (error) return { error: describeEditorError(error).message };
  afterChange();
  return { ok: "Logotipo salvo. Os ícones do site, do app e do certificado foram gerados a partir dele." };
}

/** Volta ao padrão do projeto: apaga as cores e as imagens personalizadas. */
export async function resetBrand(): Promise<void> {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("reset_church_brand");
  if (error) redirect(`/admin/marca?${new URLSearchParams({ erro: describeEditorError(error).message })}`);
  afterChange();
  redirect(`/admin/marca?${new URLSearchParams({ ok: "Voltou ao padrão do projeto." })}`);
}

/**
 * Importa um arquivo de identidade gerado por "Exportar" (em outra instalação, ou de backup). As cores são
 * recalculadas a partir das 3 escolhidas, e cada imagem é decodificada e recodificada: nada do arquivo é confiado.
 */
export async function importBrand(_previous: BrandState, formData: FormData): Promise<BrandState> {
  const { supabase } = await requireAdmin();
  const file = formData.get("arquivo");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha o arquivo de identidade (.json)." };
  if (file.size > MAX_IMPORT_BYTES) return { error: "O arquivo é grande demais." };

  let parsed: { formato?: unknown; inputs?: unknown; images?: unknown };
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return { error: "O arquivo não é um arquivo de identidade válido." };
  }
  if (!parsed || typeof parsed !== "object" || parsed.formato !== "identidade-v1") return { error: "O arquivo não é um arquivo de identidade válido." };

  const changed: string[] = [];
  if (parsed.inputs && typeof parsed.inputs === "object") {
    const i = parsed.inputs as Record<string, unknown>;
    const derived = derivePalette({ brand: String(i.brand ?? ""), foreground: String(i.foreground ?? ""), background: String(i.background ?? "") });
    if (!derived.ok) return { error: `As cores do arquivo não servem: ${derived.errors.join(" ")}` };
    const { error } = await supabase.rpc("save_church_brand", { p_inputs: derived.inputs, p_palette: derived.light, p_reading_dark: derived.readingDark });
    if (error) return { error: describeEditorError(error).message };
    changed.push("cores");
  }

  if (Array.isArray(parsed.images) && parsed.images.length > 0) {
    const clean = [];
    for (const item of parsed.images as Record<string, unknown>[]) {
      const key = String(item?.key ?? "");
      const contentType = item?.content_type;
      if (!(ASSET_KEYS as readonly string[]).includes(key)) return { error: `Imagem desconhecida no arquivo: ${key.slice(0, 30)}.` };
      if (contentType !== "image/png" && contentType !== "image/jpeg") return { error: "O arquivo traz uma imagem que não é PNG nem JPG." };
      const bytes = Buffer.from(String(item.data ?? ""), "base64");
      if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) return { error: `A imagem "${key}" do arquivo é inválida.` };
      try {
        const image = sharp(bytes, { limitInputPixels: 24_000_000 });
        const meta = await image.metadata();
        if ((meta.format === "png") !== (contentType === "image/png") || (meta.pages ?? 1) > 1) return { error: `A imagem "${key}" não é do tipo que o arquivo diz.` };
        const out = await (contentType === "image/png" ? image.png() : image.jpeg({ quality: 90 })).toBuffer({ resolveWithObject: true });
        clean.push({ key, content_type: contentType, data: out.data.toString("base64"), width: out.info.width, height: out.info.height });
      } catch {
        return { error: `Não foi possível ler a imagem "${key}" do arquivo.` };
      }
    }
    const { error } = await supabase.rpc("save_church_assets", { p_assets: clean });
    if (error) return { error: describeEditorError(error).message };
    changed.push("imagens");
  }

  if (changed.length === 0) return { error: "O arquivo não traz cores nem imagens." };
  afterChange();
  return { ok: `Importado: ${changed.join(" e ")}.` };
}
