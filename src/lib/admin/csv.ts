/**
 * CSV para o Excel e o Google Planilhas (RF-26): UTF-8 com marca de ordem de bytes, separador ";" (o que o
 * Excel em português espera), fim de linha CRLF e aspas nas células que precisam.
 *
 * Segurança: células que começam com = + - @ (ou tabulação/CR) seriam lidas como FÓRMULA pela planilha, e um
 * nome cadastrado por qualquer pessoa poderia executar algo ao ser aberto. Elas ganham um apóstrofo na frente.
 */
const SEPARATOR = ";";

export function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = neutralizeFormula(typeof value === "boolean" ? (value ? "sim" : "não") : String(value));
  return /[";\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(SEPARATOR));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** Data em Brasília, dd/mm/aaaa hh:mm, ou vazio (montada peça por peça: o separador do Intl varia entre versões). */
export function csvDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}
