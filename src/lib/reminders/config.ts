import { timingSafeEqual } from "node:crypto";

/** Endereço público do site, sem barra no fim, para montar os links dos e-mails. */
export function siteUrlFromEnv(env: Record<string, string | undefined> = process.env): string | null {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

/** Compara dois textos em tempo constante (não vaza, pelo tempo de resposta, quantas letras acertou). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** O cabeçalho Authorization traz exatamente "Bearer <CRON_SECRET>"? */
export function isAuthorizedCron(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  return safeEqual(header ?? "", `Bearer ${secret}`);
}
