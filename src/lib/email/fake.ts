import type { EmailMessage, EmailProvider, SendResult } from "./provider";

/** Provedor de mentirinha: guarda o que "enviou" e pode ser instruído a falhar. Usado nos testes. */
export class FakeEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  failFor = new Set<string>();

  async send(message: EmailMessage): Promise<SendResult> {
    if (this.failFor.has(message.to)) return { ok: false, error: "falha simulada" };
    this.sent.push(message);
    return { ok: true };
  }
}
