import { describe, expect, it } from "vitest";
import { passingScore, readAnswers, validateReflection, REFLECTION_MAX, type QuizQuestion } from "./quiz";

describe("passingScore (RN-02)", () => {
  it("2 de 3; todas nos quizzes de 1 ou 2 perguntas", () => {
    expect([1, 2, 3, 4, 5, 6].map(passingScore)).toEqual([1, 2, 2, 3, 4, 4]);
  });
});

describe("readAnswers", () => {
  const questions: QuizQuestion[] = [
    { position: 1, prompt: "a", options: { A: "x", B: "y" } },
    { position: 2, prompt: "b", options: { A: "x", B: "y", C: "z" } },
  ];
  const fd = (f: Record<string, string>) => {
    const d = new FormData();
    for (const [k, v] of Object.entries(f)) d.set(k, v);
    return d;
  };
  it("lê uma alternativa por pergunta e ignora o que não existe", () => {
    expect(readAnswers(fd({ q1: "B", q2: "Z", q3: "A" }), questions)).toEqual({ "1": "B" });
    expect(readAnswers(fd({}), questions)).toEqual({});
  });
});

describe("validateReflection", () => {
  it("apara e normaliza o fim de linha", () => {
    expect(validateReflection("  oi\r\nmundo  ")).toEqual({ ok: true, body: "oi\nmundo" });
    expect(validateReflection("   ")).toEqual({ ok: true, body: "" });
  });
  it("recusa texto grande demais", () => {
    expect(validateReflection("x".repeat(REFLECTION_MAX + 1)).ok).toBe(false);
    expect(validateReflection("x".repeat(REFLECTION_MAX)).ok).toBe(true);
  });
});
