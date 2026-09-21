import { requireMember } from "@/lib/auth";
import { buildCertificatePdf } from "@/lib/certificates/pdf";
import { CODE_FORMAT, normalizeCode } from "@/lib/closures";
import { loadSettings } from "@/lib/features";
import { siteUrlFromEnv } from "@/lib/reminders/config";

/**
 * Baixa o certificado em PDF. Só o dono (ou o Admin) chega: a leitura passa pela RLS de `certificates`,
 * então o código de outra pessoa dá "não encontrado" em vez de entregar o arquivo.
 */
export async function GET(request: Request, ctx: { params: Promise<{ code: string }> }) {
  const { supabase } = await requireMember();
  const code = normalizeCode((await ctx.params).code);
  if (!CODE_FORMAT.test(code)) return new Response("Certificado não encontrado.", { status: 404 });

  const { data: cert, error } = await supabase
    .from("certificates")
    .select("holder_name, code, issued_at, cycle_id, event_id")
    .eq("code", code)
    .maybeSingle();
  if (error) return new Response("Não foi possível gerar o certificado agora.", { status: 500 });
  if (!cert) return new Response("Certificado não encontrado.", { status: 404 });

  const [{ data: cycle }, { data: event }, settings] = await Promise.all([
    supabase.from("cycles").select("title").eq("id", cert.cycle_id).maybeSingle(),
    cert.event_id ? supabase.from("closure_events").select("starts_at").eq("id", cert.event_id).maybeSingle() : Promise.resolve({ data: null }),
    loadSettings(supabase),
  ]);

  const site = siteUrlFromEnv() ?? new URL(request.url).origin;
  const pdf = buildCertificatePdf({
    holderName: cert.holder_name as string,
    cycleTitle: (cycle?.title as string | undefined) ?? "Ciclo",
    churchName: settings.church.name,
    code: cert.code as string,
    issuedAt: new Date(cert.issued_at as string),
    eventDate: event?.starts_at ? new Date(event.starts_at as string) : null,
    verifyUrl: `${site}/verificar?codigo=${cert.code}`,
  });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="certificado-${cert.code}.pdf"`,
      // Dados pessoais: nunca guardar em cache do navegador ou de intermediários.
      "Cache-Control": "no-store",
    },
  });
}
