/**
 * Gerador mínimo de PDF para o certificado (RF-19): uma página A4 na horizontal, texto em Helvetica (fonte
 * padrão de todo leitor de PDF, sem embutir arquivo de fonte) e uma moldura. Sem biblioteca externa: o
 * arquivo é montado à mão, com a tabela de referências cruzadas (xref) calculada, e um teste confere que
 * ele fecha (offsets certos, texto presente).
 *
 * Limitação: a codificação é WinAnsi (Latin-1 e pouco mais). Letras fora dela (por exemplo, de outros
 * alfabetos) aparecem como "?". Cobre o português e nomes latinos com acento.
 */

const PAGE_W = 842;
const PAGE_H = 595;

// Larguras da Helvetica (por 1000 unidades de fonte) para os caracteres 32..126. As letras acentuadas
// têm a mesma largura da letra-base.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833,
  556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const BASE_OF_ACCENTED: Record<string, string> = {};
for (const [base, letters] of Object.entries({
  A: "ÀÁÂÃÄÅ", a: "àáâãäå", C: "Ç", c: "ç", E: "ÈÉÊË", e: "èéêë", I: "ÌÍÎÏ", i: "ìíîï", N: "Ñ", n: "ñ",
  O: "ÒÓÔÕÖ", o: "òóôõö", U: "ÙÚÛÜ", u: "ùúûü", Y: "Ý", y: "ýÿ",
})) {
  for (const ch of letters) BASE_OF_ACCENTED[ch] = base;
}

/** Substitui o que a codificação WinAnsi não tem. */
function toWinAnsi(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    const code = ch.codePointAt(0)!;
    if (code === 0x2019 || code === 0x2018) out += "'";
    else if (code === 0x201c || code === 0x201d) out += '"';
    else if (code === 0x2013 || code === 0x2014) out += "-";
    else if (code >= 0x20 && code <= 0x7e) out += ch;
    else if (code >= 0xa0 && code <= 0xff) out += ch;
    else out += "?";
  }
  return out;
}

/** Largura do texto em pontos, para centralizar. */
export function textWidth(text: string, size: number): number {
  let units = 0;
  for (const ch of toWinAnsi(text)) {
    const plain = BASE_OF_ACCENTED[ch] ?? ch;
    const code = plain.charCodeAt(0);
    units += code >= 32 && code <= 126 ? HELVETICA[code - 32] : 556;
  }
  return (units * size) / 1000;
}

const escapePdf = (text: string) => toWinAnsi(text).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");

/** Uma linha de texto centralizada, encolhendo o corpo da letra se não couber em `maxWidth`. */
function centered(text: string, y: number, size: number, maxWidth = PAGE_W - 160): string {
  let fit = size;
  const width = textWidth(text, size);
  if (width > maxWidth) fit = Math.max(8, (size * maxWidth) / width);
  const x = (PAGE_W - textWidth(text, fit)) / 2;
  return `BT /F1 ${fit.toFixed(2)} Tf ${x.toFixed(2)} ${y} Td (${escapePdf(text)}) Tj ET`;
}

export interface CertificateData {
  holderName: string;
  cycleTitle: string;
  churchName: string;
  code: string;
  issuedAt: Date;
  /** Data do encerramento presencial, se conhecida. */
  eventDate?: Date | null;
  verifyUrl: string;
}

const longDate = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" }).format(d);

/** Monta o PDF do certificado. */
export function buildCertificatePdf(data: CertificateData): Uint8Array {
  const lines: string[] = [
    // Moldura dupla.
    "2 w 0.55 0.11 0.17 RG 30 30 782 535 re S",
    "0.5 w 42 42 758 511 re S",
    "0.12 0.10 0.14 rg",
    centered(data.churchName.toUpperCase(), 508, 14),
    centered("CERTIFICADO", 455, 42),
    centered("Certificamos que", 405, 16),
    centered(data.holderName, 355, 32),
    centered("concluiu o ciclo", 312, 16),
    centered(data.cycleTitle, 278, 26),
    centered(
      data.eventDate ? `e participou do encerramento presencial em ${longDate(data.eventDate)}.` : "na trilha de discipulado.",
      238,
      15,
    ),
    centered(`Emitido em ${longDate(data.issuedAt)}`, 165, 12),
    centered(`Código de verificação: ${data.code}`, 118, 14),
    centered(`Confira em ${data.verifyUrl}`, 96, 10),
  ];
  const stream = lines.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    `<< /Title (${escapePdf(`Certificado - ${data.holderName}`)}) /Producer (Vertical Church - Discipulado) >>`,
  ];

  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return Uint8Array.from(Buffer.from(pdf, "latin1"));
}
