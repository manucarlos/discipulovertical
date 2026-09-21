import { describe, expect, it } from "vitest";
import { buildExport, isDeleteConfirmed, planReminderChanges, validateProfile, type ExportSource } from "./profile";

const versions = ["NTLH", "NVI"];

describe("validateProfile", () => {
  const base = { displayName: "  Maria   Silva ", whatsapp: "", bibleVersion: "NVI" };
  it("normaliza nome e WhatsApp", () => {
    expect(validateProfile({ ...base, whatsapp: "(11) 91234-5678" }, versions)).toEqual({
      ok: true,
      displayName: "Maria Silva",
      whatsapp: "5511912345678",
      bibleVersion: "NVI",
    });
  });
  it("WhatsApp vazio remove o número", () => {
    expect(validateProfile(base, versions)).toMatchObject({ ok: true, whatsapp: null });
  });
  it("explica cada erro", () => {
    expect(validateProfile({ ...base, displayName: "M" }, versions)).toMatchObject({ ok: false, error: expect.stringMatching(/nome/) });
    expect(validateProfile({ ...base, bibleVersion: "ARC" }, versions)).toMatchObject({ ok: false, error: expect.stringMatching(/Bíblia/) });
    expect(validateProfile({ ...base, whatsapp: "12" }, versions)).toMatchObject({ ok: false, error: expect.stringMatching(/WhatsApp/) });
  });
});

describe("planReminderChanges", () => {
  it("liga o que estava desligado e desliga o que estava ligado", () => {
    expect(planReminderChanges(new Set(["email_reminders"]), { email: false, whatsapp: true }, true)).toEqual({
      grant: ["whatsapp_reminders"],
      revoke: ["email_reminders"],
    });
  });
  it("sem mudança não grava nada", () => {
    expect(planReminderChanges(new Set(["email_reminders"]), { email: true, whatsapp: false }, false)).toEqual({ grant: [], revoke: [] });
  });
  it("não deixa ligar o WhatsApp sem número", () => {
    const plan = planReminderChanges(new Set(), { email: false, whatsapp: true }, false);
    expect(plan.error).toMatch(/número/);
    expect(plan.grant).toEqual([]);
  });
  it("ignora o consentimento de dados: ele não é um lembrete", () => {
    expect(planReminderChanges(new Set(["data_processing"]), { email: false, whatsapp: false }, false)).toEqual({ grant: [], revoke: [] });
  });
});

describe("isDeleteConfirmed", () => {
  it("aceita a palavra em qualquer caixa, com espaços", () => {
    expect(isDeleteConfirmed("EXCLUIR")).toBe(true);
    expect(isDeleteConfirmed("  excluir ")).toBe(true);
  });
  it("recusa qualquer outra coisa", () => {
    expect(isDeleteConfirmed("")).toBe(false);
    expect(isDeleteConfirmed("excluir conta")).toBe(false);
    expect(isDeleteConfirmed("sim")).toBe(false);
  });
});

describe("buildExport", () => {
  const source: ExportSource = {
    profile: {
      id: "u1",
      display_name: "Maria",
      email: "maria@example.com",
      photo_url: null,
      whatsapp: "5511912345678",
      bible_version: "NTLH",
      role: "member",
      created_at: "2026-09-01T12:00:00Z",
      onboarded_at: "2026-09-01T12:05:00Z",
    },
    consents: [{ purpose: "data_processing", term_version: "v1", accepted_at: "2026-09-01T12:05:00Z", revoked_at: null }],
    lessonProgress: [
      { status: "completed", released_at: "2026-09-02T10:00:00Z", started_at: "2026-09-02T10:00:00Z", completed_at: "2026-09-02T10:10:00Z", last_position: 1, practice_done: false, lessons: { slug: "c1-l01", title: "Bem-vindo" } },
      { status: "in_progress", released_at: "2026-09-05T10:00:00Z", started_at: "2026-09-05T10:00:00Z", completed_at: null, last_position: 0.4, practice_done: false, lessons: null },
    ],
    cycleProgress: [{ status: "in_progress", started_at: "2026-09-02T10:00:00Z", completed_at: null, cycles: { slug: "c1", title: "Fundamentos" } }],
  };
  const out = buildExport(source, new Date("2026-09-20T15:00:00Z"));

  it("traz tudo o que se sabe da pessoa, em português", () => {
    expect(out.perfil).toMatchObject({ nome: "Maria", email: "maria@example.com", whatsapp: "5511912345678", versao_da_biblia: "NTLH" });
    expect(out.consentimentos).toEqual([
      { finalidade: "Tratamento dos dados pessoais", versao_do_termo: "v1", aceito_em: "2026-09-01T12:05:00Z", revogado_em: null },
    ]);
    expect(out.progresso_das_licoes[0]).toMatchObject({ licao: "c1-l01", titulo: "Bem-vindo", situacao: "Concluída" });
    expect(out.progresso_dos_ciclos[0]).toMatchObject({ ciclo: "c1", titulo: "Fundamentos", situacao: "Em andamento" });
    expect(out.exportado_em).toBe("2026-09-20T15:00:00.000Z");
  });

  it("uma lição que já não está visível não quebra a exportação", () => {
    expect(out.progresso_das_licoes[1]).toMatchObject({ licao: null, titulo: null, situacao: "Em andamento", ultima_posicao_de_leitura: 0.4 });
  });

  it("não vaza nada que não seja da própria pessoa (só o que foi passado entra)", () => {
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/quiz_questions|correct_option|gabarito|nota para revisão|audit/i);
  });
});
