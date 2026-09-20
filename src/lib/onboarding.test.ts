import { describe, expect, it } from "vitest";
import { normalizeWhatsapp, validateOnboarding, type OnboardingInput } from "./onboarding";

const versions = ["NTLH", "NVI"];
const valid: OnboardingInput = {
  displayName: "  Maria   da Silva ",
  whatsapp: "",
  bibleVersion: "NTLH",
  consentData: true,
  consentEmail: false,
  consentWhatsapp: false,
};

describe("validateOnboarding", () => {
  it("aceita o mínimo e limpa o nome", () => {
    expect(validateOnboarding(valid, versions)).toEqual({
      ok: true,
      displayName: "Maria da Silva",
      whatsapp: null,
      bibleVersion: "NTLH",
      consents: ["data_processing"],
    });
  });

  it("exige o consentimento de dados", () => {
    const r = validateOnboarding({ ...valid, consentData: false }, versions);
    expect(r).toMatchObject({ ok: false });
  });

  it("registra um consentimento por finalidade marcada", () => {
    const r = validateOnboarding(
      { ...valid, whatsapp: "(11) 91234-5678", consentEmail: true, consentWhatsapp: true },
      versions,
    );
    expect(r).toMatchObject({
      ok: true,
      whatsapp: "5511912345678",
      consents: ["data_processing", "email_reminders", "whatsapp_reminders"],
    });
  });

  it("não aceita lembrete por WhatsApp sem número", () => {
    expect(validateOnboarding({ ...valid, consentWhatsapp: true }, versions)).toMatchObject({ ok: false });
  });

  it("recusa nome curto ou longo demais", () => {
    expect(validateOnboarding({ ...valid, displayName: "A" }, versions)).toMatchObject({ ok: false });
    expect(validateOnboarding({ ...valid, displayName: "x".repeat(81) }, versions)).toMatchObject({ ok: false });
  });

  it("recusa versão da Bíblia fora da lista", () => {
    expect(validateOnboarding({ ...valid, bibleVersion: "ARC" }, versions)).toMatchObject({ ok: false });
  });

  it("recusa WhatsApp incompleto", () => {
    expect(validateOnboarding({ ...valid, whatsapp: "1234" }, versions)).toMatchObject({ ok: false });
  });
});

describe("normalizeWhatsapp", () => {
  it("normaliza com e sem DDI e máscara", () => {
    expect(normalizeWhatsapp("(11) 91234-5678")).toBe("5511912345678");
    expect(normalizeWhatsapp("11 3123-4567")).toBe("551131234567");
    expect(normalizeWhatsapp("+55 11 91234-5678")).toBe("5511912345678");
  });
  it("recusa tamanhos inválidos", () => {
    expect(normalizeWhatsapp("123")).toBeNull();
    expect(normalizeWhatsapp("+1 415 505 5563")).toBeNull();
  });
});
