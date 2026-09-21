import { describe, expect, it } from "vitest";
import { FEEDBACK_LIMITS, labelOf, summarizeFeedback, validateFeedback, type FeedbackInput, type FeedbackRow } from "./feedback";

const valid: FeedbackInput = {
  device: "iphone",
  entered: "sim",
  lessonDone: "sim",
  ease: "4",
  alone: "com_ajuda",
  liked: "  A leitura é leve.  ",
  confusing: "",
  suggestion: "",
  contactName: "",
  contact: "",
};

describe("validateFeedback", () => {
  it("aceita uma resposta completa e limpa os textos", () => {
    const r = validateFeedback(valid);
    expect(r).toEqual({
      ok: true,
      value: {
        device: "iphone",
        entered: "sim",
        lessonDone: "sim",
        ease: 4,
        alone: "com_ajuda",
        liked: "A leitura é leve.",
        confusing: null,
        suggestion: null,
        contactName: null,
        contact: null,
      },
    });
  });

  it("os textos são opcionais, mas as cinco perguntas de múltipla escolha não", () => {
    for (const field of ["device", "entered", "lessonDone", "ease", "alone"] as const) {
      const r = validateFeedback({ ...valid, [field]: "" });
      expect(r.ok, field).toBe(false);
    }
  });

  it("recusa valores fora da lista (o formulário pode ser adulterado)", () => {
    expect(validateFeedback({ ...valid, device: "geladeira" }).ok).toBe(false);
    expect(validateFeedback({ ...valid, entered: "talvez" }).ok).toBe(false);
    expect(validateFeedback({ ...valid, lessonDone: "sim; drop table" }).ok).toBe(false);
    expect(validateFeedback({ ...valid, alone: "" }).ok).toBe(false);
  });

  it("a nota é um número inteiro de 1 a 5", () => {
    for (const bad of ["0", "6", "3.5", "abc", "-1"]) expect(validateFeedback({ ...valid, ease: bad }).ok, bad).toBe(false);
    for (const good of ["1", "2", "3", "4", "5"]) expect(validateFeedback({ ...valid, ease: good }).ok, good).toBe(true);
  });

  it("limita o tamanho dos textos e diz qual campo passou", () => {
    const long = "a".repeat(FEEDBACK_LIMITS.text + 1);
    const r = validateFeedback({ ...valid, confusing: long });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("confundiu");
    expect(validateFeedback({ ...valid, contactName: "n".repeat(FEEDBACK_LIMITS.contactName + 1) }).ok).toBe(false);
    expect(validateFeedback({ ...valid, contact: "c".repeat(FEEDBACK_LIMITS.contact + 1) }).ok).toBe(false);
    expect(validateFeedback({ ...valid, liked: "a".repeat(FEEDBACK_LIMITS.text) }).ok).toBe(true);
  });

  it("texto só de espaços vira vazio", () => {
    const r = validateFeedback({ ...valid, liked: "   \n  " });
    expect(r.ok && r.value.liked).toBeNull();
  });
});

describe("summarizeFeedback", () => {
  const row = (over: Partial<FeedbackRow>): FeedbackRow => ({
    id: "1",
    created_at: "2026-09-21T12:00:00Z",
    device: "android",
    entered: "sim",
    lesson_done: "sim",
    ease: 4,
    alone: "sim",
    liked: null,
    confusing: null,
    suggestion: null,
    contact_name: null,
    contact: null,
    ...over,
  });

  it("sem respostas, não inventa média", () => {
    expect(summarizeFeedback([])).toEqual({ total: 0, averageEase: null, device: {}, entered: {}, lessonDone: {}, alone: {} });
  });

  it("conta cada resposta e tira a média com uma casa decimal", () => {
    const s = summarizeFeedback([row({ ease: 5 }), row({ ease: 4, device: "iphone", entered: "nao" }), row({ ease: 4, alone: "nao" })]);
    expect(s.total).toBe(3);
    expect(s.averageEase).toBe(4.3);
    expect(s.device).toEqual({ android: 2, iphone: 1 });
    expect(s.entered).toEqual({ sim: 2, nao: 1 });
    expect(s.alone).toEqual({ sim: 2, nao: 1 });
  });
});

describe("labelOf", () => {
  it("devolve o rótulo, ou o próprio valor se for desconhecido", () => {
    expect(labelOf([{ value: "a", label: "Alfa" }], "a")).toBe("Alfa");
    expect(labelOf([{ value: "a", label: "Alfa" }], "z")).toBe("z");
  });
});
