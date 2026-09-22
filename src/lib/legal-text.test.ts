import { describe, expect, it } from "vitest";
import { PLACEHOLDER_PREFIX, PRIVACY, TERMS, type LegalDocument } from "./legal-text";

const flat = (doc: LegalDocument) => [doc.intro, ...doc.sections.flatMap((s) => [s.title, ...s.paragraphs, ...(s.bullets ?? [])])].join("\n");

describe("minutas dos termos e da política", () => {
  it("todas as seções têm título e conteúdo, e os textos estão em português", () => {
    for (const doc of [TERMS, PRIVACY]) {
      expect(doc.sections.length).toBeGreaterThanOrEqual(10);
      for (const s of doc.sections) {
        expect(s.title.trim().length).toBeGreaterThan(3);
        expect(s.paragraphs.length + (s.bullets?.length ?? 0), s.title).toBeGreaterThan(0);
      }
    }
  });

  it("nada da igreja é inventado: razão social, CNPJ, contato e foro ficam como [A PREENCHER PELA IGREJA: ...]", () => {
    // O encarregado (DPO) é a única informação real preenchida até aqui — confirmada pelo pastor
    // (Manoel Carlos Gomes, e-mail pessoal por enquanto), não inventada. O resto (razão social, CNPJ,
    // endereço, canal de contato dos Termos, transferência internacional, prazos legais, foro) continua
    // como placeholder até o advogado revisar.
    const KNOWN_EMAIL = "manoelcarlosgomes@gmail.com";
    for (const doc of [TERMS, PRIVACY]) {
      const text = flat(doc);
      expect(text.split(PLACEHOLDER_PREFIX).length - 1, doc.title).toBeGreaterThanOrEqual(3);
      // Nenhum e-mail ou endereço inventado: o único que pode aparecer é o do encarregado, já confirmado.
      const found = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+|https?:\/\/[^\s]*|www\.[^\s]*/g) ?? [];
      const invented = found.filter((f) => !f.includes(KNOWN_EMAIL));
      expect(invented, doc.title).toEqual([]);
      const numbers = [...text.matchAll(/\b\d{3,}\b/g)].map((m) => m[0]).filter((n) => !["188", "192", "190", "180", "13", "709", "2018"].includes(n));
      expect(numbers, `${doc.title}: números que parecem telefone ou CNPJ`).toEqual([]);
    }
    expect(flat(PRIVACY)).toMatch(/encarregado[^.]*Manoel Carlos Gomes \(manoelcarlosgomes@gmail\.com\)/);
    expect(flat(PRIVACY)).toMatch(/transferência internacional/);
    expect(flat(TERMS)).toMatch(/foro/);
    // Todo marcador que abre também fecha.
    for (const doc of [TERMS, PRIVACY]) for (const m of flat(doc).matchAll(/\[A PREENCHER PELA IGREJA:[^\]]*\]/g)) expect(m[0].length).toBeGreaterThan(30);
  });

  it("a política cobre o que a LGPD pede: dados, dados sensíveis, bases, compartilhamento, retenção, direitos, segurança, cookies e menores", () => {
    const text = flat(PRIVACY);
    for (const topic of [/Lei Geral de Proteção de Dados/, /convicção religiosa/, /dado pessoal sensível/, /consentimento/, /Supabase/, /Vercel/, /Resend/, /Google/, /ANPD/, /excluir/, /corrigir/, /retirar o consentimento/, /cookies/i, /18 anos/, /Meu perfil/]) {
      expect(text, String(topic)).toMatch(topic);
    }
  });

  it("a política descreve os acessos como o sistema realmente funciona (RG-07, RG-08, RG-10, RN-03)", () => {
    const text = flat(PRIVACY);
    expect(text).toMatch(/apenas as reflexões que você compartilhar/);
    expect(text).toMatch(/Ao sair do grupo, ele perde esse acesso/);
    expect(text).toMatch(/não é visto pelo seu discipulador/);
    expect(text).toMatch(/Editores de conteúdo\*\* não veem dados pessoais/);
    expect(text).toMatch(/cada consulta a dados de outra pessoa fica registrada/);
    expect(text).toMatch(/não usamos cookies de publicidade/i);
  });

  it("os termos dizem que as lições não substituem profissionais, citam os telefones de emergência e que o texto bíblico não é reproduzido", () => {
    const text = flat(TERMS);
    expect(text).toMatch(/não substituem/);
    for (const phone of ["192", "188", "190", "180"]) expect(text).toContain(phone);
    expect(text).toMatch(/não reproduz o texto das versões bíblicas/);
    expect(text).toMatch(/18 anos/);
  });
});
