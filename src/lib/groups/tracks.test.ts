import { describe, expect, it } from "vitest";
import { validateTrackForm } from "./tracks";

const fd = (fields: Record<string, string>) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.set(k, v);
  return d;
};

describe("validateTrackForm", () => {
  it("lê título, descrição e as lições na ordem, uma por linha (CRLF incluso, linhas vazias ignoradas)", () => {
    expect(validateTrackForm(fd({ title: " Caminhada ", description: " Três dias ", lessons: "lib-01-a\r\n\r\n lib-02-b \nlib-03-c\n" }))).toEqual({
      ok: true,
      title: "Caminhada",
      description: "Três dias",
      slugs: ["lib-01-a", "lib-02-b", "lib-03-c"],
    });
  });

  it("recusa título vazio, trilha sem lição, lição repetida, identificador estranho e trilha grande demais", () => {
    expect(validateTrackForm(fd({ title: " ", lessons: "lib-01" })).ok).toBe(false);
    expect(validateTrackForm(fd({ title: "T", lessons: "  \n " })).ok).toBe(false);
    expect(validateTrackForm(fd({ title: "T", lessons: "lib-01\nlib-01" }))).toMatchObject({ ok: false, error: expect.stringContaining("mais de uma vez") });
    expect(validateTrackForm(fd({ title: "T", lessons: "Lição 1" })).ok).toBe(false);
    expect(validateTrackForm(fd({ title: "T", lessons: "lib-01; drop table" })).ok).toBe(false);
    expect(validateTrackForm(fd({ title: "T", lessons: Array.from({ length: 121 }, (_, i) => `lib-${i}`).join("\n") })).ok).toBe(false);
    expect(validateTrackForm(fd({ title: "x".repeat(121), lessons: "lib-01" })).ok).toBe(false);
  });
});
