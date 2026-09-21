/**
 * Envio de e-mail atrás de uma interface mínima, para trocar de fornecedor sem mexer no resto.
 * A implementação real usa a API HTTP do Resend (sem biblioteca extra); os testes usam FakeEmailProvider.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

export type SendResult = { ok: true } | { ok: false; error: string };

export interface EmailProvider {
  send(message: EmailMessage): Promise<SendResult>;
}

export function createResendProvider(options: {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
}): EmailProvider {
  const doFetch = options.fetchImpl ?? fetch;
  return {
    async send(message) {
      try {
        const response = await doFetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: options.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
            headers: message.headers,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (response.ok) return { ok: true };
        // Só o código: a resposta do serviço pode citar o endereço da pessoa.
        return { ok: false, error: `Resend respondeu ${response.status}` };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? `Falha de rede: ${error.name}` : "Falha de rede" };
      }
    },
  };
}

/** Provedor configurado por variáveis de ambiente (RESEND_API_KEY e EMAIL_FROM), ou null se faltar alguma. */
export function providerFromEnv(env: Record<string, string | undefined> = process.env): EmailProvider | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  return apiKey && from ? createResendProvider({ apiKey, from }) : null;
}
