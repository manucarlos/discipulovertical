import { providerFromEnv } from "@/lib/email/provider";
import { isAuthorizedCron, siteUrlFromEnv } from "@/lib/reminders/config";
import { runReminders } from "@/lib/reminders/run";
import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Chamada pelo agendador (Vercel Cron ou outro serviço) com "Authorization: Bearer <CRON_SECRET>".
 * Roda uma rodada de lembretes por e-mail (RF-16). A resposta traz só contagens, nunca nomes ou e-mails.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ erro: "CRON_SECRET não está configurado no site." }, 503);
  if (!isAuthorizedCron(request.headers.get("authorization"), secret)) return json({ erro: "Não autorizado." }, 401);

  const provider = providerFromEnv();
  if (!provider) return json({ erro: "Serviço de e-mail não configurado (RESEND_API_KEY e EMAIL_FROM)." }, 503);
  const siteUrl = siteUrlFromEnv();
  if (!siteUrl) return json({ erro: "NEXT_PUBLIC_SITE_URL não está configurado no site." }, 503);
  const supabase = createAnonClient();
  if (!supabase) return json({ erro: "Supabase não configurado." }, 503);

  try {
    return json(await runReminders({ supabase, secret, provider, siteUrl }));
  } catch (error) {
    // A mensagem pode citar a função do banco, mas nunca dados de pessoas.
    return json({ erro: error instanceof Error ? error.message : "Falha desconhecida." }, 500);
  }
}
