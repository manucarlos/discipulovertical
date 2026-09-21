"use server";

import { redirect } from "next/navigation";
import { describeEditorError } from "@/lib/admin/errors";
import { requireAdmin } from "@/lib/auth";
import { providerFromEnv } from "@/lib/email/provider";
import { isEmailKind, renderEmail, validateTemplate } from "@/lib/email/templates";
import { loadSettings } from "@/lib/features";
import { siteUrlFromEnv } from "@/lib/reminders/config";

const back = (params: Record<string, string>, hash = ""): never =>
  redirect(`/admin/lembretes?${new URLSearchParams(params).toString()}${hash}`);

/** Salva o texto de um e-mail. Só o Admin (a RLS do banco impõe o mesmo). */
export async function saveEmailTemplate(kind: string, formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  if (!isEmailKind(kind)) back({ erro: "Tipo de e-mail desconhecido." });
  else {
    const parsed = validateTemplate(kind, {
      subject: String(formData.get("subject") ?? ""),
      body: String(formData.get("body") ?? ""),
    });
    if (!parsed.ok) back({ erro: parsed.error }, `#t-${kind}`);
    else {
      const { data, error } = await supabase
        .from("email_templates")
        .update({ subject: parsed.subject, body: parsed.body })
        .eq("kind", kind)
        .select("kind");
      if (error) back({ erro: describeEditorError(error).message }, `#t-${kind}`);
      if (!data || data.length === 0) back({ erro: "Esse e-mail não foi encontrado." });
      back({ ok: "Texto salvo. Vale a partir do próximo envio." }, `#t-${kind}`);
    }
  }
}

/** Envia o e-mail de exemplo, com dados fictícios, para o próprio Admin. Serve para conferir o serviço de e-mail. */
export async function sendTestEmail(kind: string): Promise<void> {
  const { supabase, user } = await requireAdmin();
  if (!isEmailKind(kind)) back({ erro: "Tipo de e-mail desconhecido." });
  else {
    const provider = providerFromEnv();
    const site = siteUrlFromEnv();
    if (!provider || !site) back({ erro: "O serviço de e-mail ainda não está configurado no site (veja o quadro acima)." }, `#t-${kind}`);
    else {
      const [{ data: template }, { data: profile }, settings] = await Promise.all([
        supabase.from("email_templates").select("subject, body").eq("kind", kind).maybeSingle(),
        supabase.from("profiles").select("email, display_name").eq("id", user.id).single(),
        loadSettings(supabase),
      ]);
      if (!template || !profile) back({ erro: "Não foi possível montar o e-mail de teste." }, `#t-${kind}`);
      else {
        const rendered = renderEmail(
          template as { subject: string; body: string },
          {
            nome: (profile.display_name as string).split(/\s+/)[0] || "amigo(a)",
            igreja: settings.church.name,
            licao: "Bem-vindo(a) à família de Deus",
            ciclo: "Fundamentos",
            membro: "Maria Souza",
            resumo: "• 3 membros estão com você\n• 2 estiveram ativos esta semana\n• 1 parado há mais de 14 dias\n• 4 lições concluídas",
            link: site,
          },
          { churchName: settings.church.name, unsubscribeUrl: `${site}/desinscrever` },
        );
        const result = await provider.send({
          to: profile.email as string,
          subject: `[TESTE] ${rendered.subject}`,
          text: rendered.text,
          html: rendered.html,
        });
        if (!result.ok) back({ erro: `O envio de teste falhou: ${result.error}.` }, `#t-${kind}`);
        back({ ok: "E-mail de teste enviado para o seu endereço. Confira a caixa de entrada (e o spam)." }, `#t-${kind}`);
      }
    }
  }
}
