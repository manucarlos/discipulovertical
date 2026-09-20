export const CHURCH_LIMITS = { title: 100, body: 20_000 } as const;

export type ChurchPageResult =
  | { ok: true; title: string; body: string }
  | { ok: false; error: string };

/** Valida a edição de uma página de "Nossa Igreja". O texto é simples: uma linha em branco separa parágrafos. */
export function validateChurchPage(input: { title: string; body: string }): ChurchPageResult {
  const title = input.title.trim();
  if (title === "") return { ok: false, error: "Escreva o título da página." };
  if (title.length > CHURCH_LIMITS.title) {
    return { ok: false, error: `O título pode ter no máximo ${CHURCH_LIMITS.title} caracteres.` };
  }
  // Normaliza o fim de linha do Windows e apara espaços das pontas; o miolo do texto não é mexido.
  const body = input.body.replace(/\r\n/g, "\n").trim();
  if (body.length > CHURCH_LIMITS.body) {
    return { ok: false, error: `O texto pode ter no máximo ${CHURCH_LIMITS.body} caracteres.` };
  }
  return { ok: true, title, body };
}
