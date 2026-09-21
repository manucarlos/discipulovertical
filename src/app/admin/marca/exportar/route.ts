import { requireAdmin } from "@/lib/auth";

/**
 * Baixa a identidade da igreja (as 3 cores e as imagens) num arquivo, para backup ou para levar a outra
 * instalação (Administração > Marca > Importar). Só o Admin. Nada de dado pessoal, mas sem cache mesmo assim.
 */
export async function GET() {
  const { supabase } = await requireAdmin();
  const [brand, assets] = await Promise.all([
    supabase.from("church_brand").select("inputs, version").maybeSingle(),
    supabase.from("church_assets").select("key, content_type, data, width, height").order("key"),
  ]);
  if (brand.error || assets.error) return new Response("Não foi possível reunir a identidade agora. Tente de novo.", { status: 500 });

  const body = {
    formato: "identidade-v1",
    exportado_em: new Date().toISOString(),
    inputs: brand.data?.inputs ?? null,
    images: assets.data ?? [],
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="identidade-da-igreja.json"',
      "Cache-Control": "no-store",
    },
  });
}
