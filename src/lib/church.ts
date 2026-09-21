/**
 * O nome da igreja não fica escrito no código: vem da configuração (Administração > Configurações, chave
 * `church.name`). Os textos que precisam dele levam o marcador {{igreja}}, trocado aqui pelo nome de verdade.
 */
export const CHURCH_TOKEN = "{{igreja}}";

/**
 * Nome usado só se a configuração não puder ser lida (banco fora do ar) ou estiver em branco. Cada instalação pode
 * fixar o seu com a variável NEXT_PUBLIC_CHURCH_NAME; sem ela, um nome neutro.
 */
export const DEFAULT_CHURCH_NAME = process.env.NEXT_PUBLIC_CHURCH_NAME?.trim() || "Igreja";

/** Troca o marcador {{igreja}} de um texto pelo nome da igreja. */
export function withChurch(text: string, name: string): string {
  return text.replaceAll(CHURCH_TOKEN, name);
}

/** O mesmo, em todos os textos de uma estrutura (objetos, listas), sem alterar a original. */
export function withChurchDeep<T>(value: T, name: string): T {
  if (typeof value === "string") return withChurch(value, name) as T;
  if (Array.isArray(value)) return value.map((item) => withChurchDeep(item, name)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withChurchDeep(item, name)])) as T;
  }
  return value;
}
