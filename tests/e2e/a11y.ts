import { parse, type HTMLElement } from "node-html-parser";

/**
 * Auditoria estrutural de acessibilidade de uma tela já renderizada. Não substitui um teste com leitor de
 * tela, mas pega as falhas que mais atrapalham quem o usa ou navega só pelo teclado (WCAG 2.1 A e AA, no que
 * dá para ver no HTML). Devolve a lista de problemas; vazia = nada encontrado.
 */
const text = (el: HTMLElement) => el.text.replace(/\s+/g, " ").trim();

function accessibleName(el: HTMLElement, root: HTMLElement): string {
  const label = el.getAttribute("aria-label")?.trim();
  if (label) return label;

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const named = labelledBy
      .split(/\s+/)
      .map((id) => root.querySelector(`#${CSS_ESCAPE(id)}`))
      .filter((n): n is HTMLElement => n !== null)
      .map(text)
      .join(" ");
    if (named) return named;
  }

  // <label> que envolve o campo, ou <label for="id">.
  const wrapping = el.closest("label");
  if (wrapping && text(wrapping)) return text(wrapping);
  const id = el.getAttribute("id");
  if (id) {
    const forLabel = root.querySelectorAll("label").find((l) => l.getAttribute("for") === id);
    if (forLabel && text(forLabel)) return text(forLabel);
  }

  if (["button", "a"].includes(el.tagName.toLowerCase())) {
    const own = text(el);
    if (own) return own;
    // Um link só com imagem (o logotipo) tem como nome o `alt` da imagem, como os leitores de tela leem.
    const imageAlt = el
      .querySelectorAll("img")
      .map((img) => img.getAttribute("alt")?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    if (imageAlt) return imageAlt;
  }
  return el.getAttribute("title")?.trim() ?? "";
}

const CSS_ESCAPE = (id: string) => id.replace(/([^a-zA-Z0-9_-])/g, "\\$1");

export function auditHtml(html: string, where: string): string[] {
  const root = parse(html);
  const problems: string[] = [];
  const problem = (message: string) => problems.push(`${where}: ${message}`);

  // 1. Um título principal por tela.
  const h1s = root.querySelectorAll("h1");
  if (h1s.length !== 1) problem(`deveria ter exatamente um <h1> e tem ${h1s.length}`);

  // 2. Os níveis de título não pulam (h1 -> h3 confunde quem navega por títulos).
  let previous = 0;
  for (const h of root.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
    const level = Number(h.tagName.slice(1));
    if (previous !== 0 && level > previous + 1) problem(`o título "${text(h).slice(0, 40)}" pula do nível ${previous} para ${level}`);
    if (text(h) === "") problem(`há um título <h${level}> vazio`);
    previous = level;
  }

  // 3. Todo campo de formulário tem nome acessível.
  for (const field of root.querySelectorAll("input, select, textarea")) {
    const type = (field.getAttribute("type") ?? "text").toLowerCase();
    if (["hidden", "submit", "button"].includes(type)) continue;
    if (!accessibleName(field, root)) problem(`campo <${field.tagName.toLowerCase()} name="${field.getAttribute("name") ?? ""}"> sem nome acessível`);
  }

  // 4. Botões e links têm nome, e links que abrem outra aba são seguros.
  for (const button of root.querySelectorAll("button")) {
    if (!accessibleName(button, root)) problem("há um botão sem texto nem aria-label");
  }
  for (const link of root.querySelectorAll("a")) {
    if (!link.getAttribute("href")) continue;
    if (!accessibleName(link, root)) problem(`link sem texto para ${link.getAttribute("href")}`);
    if (link.getAttribute("target") === "_blank" && !/noopener/.test(link.getAttribute("rel") ?? "")) {
      problem(`link para ${link.getAttribute("href")} abre em outra aba sem rel="noopener"`);
    }
  }

  // 5. Imagens com texto alternativo; barras de progresso com nome e valor.
  for (const img of root.querySelectorAll("img")) {
    if (img.getAttribute("alt") === undefined) problem(`imagem ${img.getAttribute("src") ?? ""} sem alt`);
  }
  for (const bar of root.querySelectorAll('[role="progressbar"]')) {
    if (!bar.getAttribute("aria-label")) problem("barra de progresso sem nome");
    if (bar.getAttribute("aria-valuenow") === undefined) problem("barra de progresso sem aria-valuenow");
  }
  for (const graphic of root.querySelectorAll('[role="img"]')) {
    if (!graphic.getAttribute("aria-label")) problem('elemento role="img" sem aria-label');
  }

  // 6. Tabelas de dados têm cabeçalhos.
  for (const table of root.querySelectorAll("table")) {
    if (table.querySelectorAll("th").length === 0) problem("tabela sem células de cabeçalho (<th>)");
  }

  // 7. IDs únicos, e referências que apontam para algo que existe.
  const ids = new Map<string, number>();
  for (const el of root.querySelectorAll("[id]")) ids.set(el.getAttribute("id")!, (ids.get(el.getAttribute("id")!) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) problem(`id duplicado "${id}" (${n} vezes)`);
  for (const el of root.querySelectorAll("[aria-labelledby]")) {
    for (const ref of el.getAttribute("aria-labelledby")!.split(/\s+/)) {
      if (!ids.has(ref)) problem(`aria-labelledby aponta para "${ref}", que não existe`);
    }
  }

  // 8. Todo formulário tem um jeito de enviar.
  for (const form of root.querySelectorAll("form")) {
    const hasSubmit = form.querySelectorAll("button, input[type=submit]").some((b) => (b.getAttribute("type") ?? "submit") === "submit");
    if (!hasSubmit) problem("há um formulário sem botão de envio");
  }

  return problems;
}
