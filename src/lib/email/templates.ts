/** Tipos de e-mail que a plataforma envia, com as variáveis que cada texto pode usar (seção 10 do handoff). */
export const EMAIL_KINDS = [
  { kind: "welcome", label: "Boas-vindas", when: "Depois do primeiro acesso, uma vez.", variables: ["nome", "igreja", "licao", "link"] },
  { kind: "new_lesson", label: "Nova lição liberada", when: "Quando uma lição é liberada depois de uma espera. No máximo 2 lembretes por semana.", variables: ["nome", "igreja", "licao", "ciclo", "link"] },
  { kind: "nudge_3d", label: "3 dias sem acessar", when: "Lembrete gentil, uma vez por ausência.", variables: ["nome", "igreja", "licao", "ciclo", "link"] },
  { kind: "nudge_7d", label: "7 dias sem acessar", when: "Convite carinhoso para voltar, uma vez por ausência.", variables: ["nome", "igreja", "licao", "ciclo", "link"] },
  { kind: "stalled_alert", label: "Aviso de membro parado (ao cuidador ou administrador)", when: "Quando um membro passa de 14 dias sem ler.", variables: ["nome", "igreja", "membro", "link"] },
  { kind: "cycle_completed", label: "Ciclo concluído", when: "Quando o membro conclui um ciclo, uma vez.", variables: ["nome", "igreja", "ciclo", "link"] },
  { kind: "weekly_summary", label: "Resumo semanal (ao cuidador)", when: "Toda segunda-feira.", variables: ["nome", "igreja", "resumo", "link"] },
] as const;

export type EmailKind = (typeof EMAIL_KINDS)[number]["kind"];

export const isEmailKind = (value: string): value is EmailKind => EMAIL_KINDS.some((k) => k.kind === value);

export const TEMPLATE_LIMITS = { subject: 150, body: 5000 } as const;

const VARIABLE = /\{\{\s*([a-z_]+)\s*\}\}/g;

export type TemplateCheck = { ok: true; subject: string; body: string } | { ok: false; error: string };

/** Valida o texto de um e-mail editado pelo Admin: tamanho e só variáveis conhecidas (erro de digitação aparece já ao salvar). */
export function validateTemplate(kind: EmailKind, input: { subject: string; body: string }): TemplateCheck {
  const subject = input.subject.replace(/\s+/g, " ").trim();
  const body = input.body.replace(/\r\n/g, "\n").trim();
  if (subject === "") return { ok: false, error: "Escreva o assunto do e-mail." };
  if (subject.length > TEMPLATE_LIMITS.subject) return { ok: false, error: `O assunto pode ter no máximo ${TEMPLATE_LIMITS.subject} caracteres.` };
  if (body === "") return { ok: false, error: "Escreva o texto do e-mail." };
  if (body.length > TEMPLATE_LIMITS.body) return { ok: false, error: `O texto pode ter no máximo ${TEMPLATE_LIMITS.body} caracteres.` };

  const allowed = new Set<string>(EMAIL_KINDS.find((k) => k.kind === kind)!.variables);
  const unknown = new Set<string>();
  for (const text of [subject, body]) for (const m of text.matchAll(VARIABLE)) if (!allowed.has(m[1])) unknown.add(`{{${m[1]}}}`);
  if (unknown.size > 0) {
    return { ok: false, error: `Variável desconhecida neste e-mail: ${[...unknown].join(", ")}. Use só: ${[...allowed].map((v) => `{{${v}}}`).join(", ")}.` };
  }
  // Chaves soltas costumam ser variável mal digitada ({{nome} ou {nome}}).
  const withoutVariables = `${subject}\n${body}`.replace(VARIABLE, "");
  if (/[{}]/.test(withoutVariables)) {
    return { ok: false, error: "Há uma variável com chaves incompletas. Use o formato {{nome}}." };
  }
  return { ok: true, subject, body };
}

export type Vars = Partial<Record<"nome" | "igreja" | "licao" | "ciclo" | "link" | "resumo" | "membro", string>>;

const fill = (text: string, vars: Vars): string =>
  text.replace(VARIABLE, (_match, name: string) => (vars as Record<string, string | undefined>)[name] ?? "");

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Transforma o texto em HTML simples: parágrafos por linha em branco e endereços https viram links. */
function toHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => {
      const safe = escapeHtml(paragraph).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
      return `<p style="margin:0 0 16px">${safe.replaceAll("\n", "<br>")}</p>`;
    })
    .join("\n");
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Monta o e-mail final: variáveis preenchidas e rodapé com o link para desligar os lembretes (sempre presente). */
export function renderEmail(
  template: { subject: string; body: string },
  vars: Vars,
  footer: { churchName: string; unsubscribeUrl: string },
): RenderedEmail {
  const subject = fill(template.subject, vars).replace(/\s+/g, " ").trim();
  const body = fill(template.body, vars).trim();
  const footerText = `${footer.churchName}\nPara não receber mais estes e-mails: ${footer.unsubscribeUrl}`;
  const text = `${body}\n\n—\n${footerText}\n`;
  const html =
    `<div style="font-family:Georgia,serif;font-size:16px;line-height:1.6;color:#1f1a24;max-width:560px">\n${toHtml(body)}\n` +
    `<hr style="border:0;border-top:1px solid #ddd;margin:24px 0">\n` +
    `<p style="margin:0;font-size:13px;color:#666">${escapeHtml(footer.churchName)}<br>` +
    `<a href="${escapeHtml(footer.unsubscribeUrl)}">Não quero mais receber estes e-mails</a></p>\n</div>`;
  return { subject, text, html };
}
