import { isUuid } from "./forms";

export const TRACK_LIMITS = { title: 120, description: 1000, days: 120 } as const;

export type TrackCheck =
  | { ok: true; title: string; description: string; slugs: string[] }
  | { ok: false; error: string };

/**
 * Formulário "Nova trilha": título, descrição e as lições na ordem, uma por linha (o identificador da lição, como
 * lib-01-andar-com-deus). Cada linha é um dia. Repetição não é aceita: uma lição aparece uma vez na trilha.
 */
export function validateTrackForm(form: { get(name: string): FormDataEntryValue | null }): TrackCheck {
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const slugs = String(form.get("lessons") ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (title === "") return { ok: false, error: "Dê um título à trilha." };
  if (title.length > TRACK_LIMITS.title) return { ok: false, error: `O título pode ter no máximo ${TRACK_LIMITS.title} caracteres.` };
  if (description.length > TRACK_LIMITS.description) return { ok: false, error: `A descrição pode ter no máximo ${TRACK_LIMITS.description} caracteres.` };
  if (slugs.length === 0) return { ok: false, error: "Informe pelo menos uma lição (uma por linha, na ordem dos dias)." };
  if (slugs.length > TRACK_LIMITS.days) return { ok: false, error: `Uma trilha pode ter no máximo ${TRACK_LIMITS.days} dias.` };
  const repeated = slugs.find((s, i) => slugs.indexOf(s) !== i);
  if (repeated) return { ok: false, error: `A lição “${repeated}” aparece mais de uma vez.` };
  const invalid = slugs.find((s) => !/^[a-z0-9][a-z0-9-]{0,80}$/.test(s));
  if (invalid) return { ok: false, error: `“${invalid}” não parece um identificador de lição (use letras minúsculas, números e hífens).` };
  return { ok: true, title, description, slugs };
}

export const isTrackStatus = (v: string): v is "draft" | "published" | "archived" => v === "draft" || v === "published" || v === "archived";
export { isUuid };
