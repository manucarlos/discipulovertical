"use client";

import { useActionState } from "react";
import { passingScore, type QuizQuestion } from "@/lib/quiz";
import type { QuizState } from "@/app/(member)/licao/[slug]/quiz-state";

interface Props {
  questions: QuizQuestion[];
  action: (state: QuizState, formData: FormData) => Promise<QuizState>;
  /** A pessoa já foi aprovada antes (o botão de concluir já está liberado). */
  alreadyPassed: boolean;
}

const idle: QuizState = { status: "idle" };

/** RF-12: quiz formativo. Corrige no servidor, mostra a explicação de cada pergunta e deixa refazer sem limite. */
export function QuizForm({ questions, action, alreadyPassed }: Props) {
  const [state, formAction, pending] = useActionState(action, idle);
  const need = passingScore(questions.length);
  const result = state.status === "done" ? state.result : null;

  return (
    <section aria-labelledby="quiz-titulo" className="mt-10 rounded-2xl border border-line bg-card p-5">
      <h2 id="quiz-titulo" className="font-serif text-2xl">
        Para fixar
      </h2>
      <p className="mt-1 text-sm text-muted">
        Acerte pelo menos {need} de {questions.length} para concluir a lição. Você pode tentar de novo quantas vezes quiser.
        {alreadyPassed && " Você já foi aprovado neste quiz."}
      </p>

      {state.status === "error" && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.message}
        </p>
      )}
      {result && (
        <p
          role="status"
          className={`mt-4 rounded-xl px-4 py-3 text-sm ${result.passed ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}
        >
          {result.passed
            ? `Muito bem! Você acertou ${result.correctCount} de ${result.total}. Já pode concluir a lição.`
            : `Você acertou ${result.correctCount} de ${result.total}. Releia com calma e tente de novo — precisa de ${need}.`}
        </p>
      )}

      <form action={formAction} className="mt-5 space-y-6">
        {questions.map((q) => {
          const feedback = result?.results.find((r) => r.position === q.position);
          return (
            <fieldset key={q.position} className="space-y-2">
              <legend className="font-medium">
                {q.position}. {q.prompt}
              </legend>
              {Object.entries(q.options).map(([key, label]) => (
                <label key={key} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5">
                  <input type="radio" name={`q${q.position}`} value={key} className="mt-1 size-5 shrink-0 accent-[var(--brand)]" />
                  <span>
                    <span className="font-medium">{key})</span> {label}
                  </span>
                </label>
              ))}
              {feedback && (
                <p className={`text-sm ${feedback.correct ? "text-emerald-800" : "text-amber-900"}`}>
                  <strong>{feedback.correct ? "Certo." : "Ainda não."}</strong> {feedback.explanation}
                </p>
              )}
            </fieldset>
          );
        })}
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-brand px-5 py-3 font-medium text-on-brand hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Corrigindo…" : result ? "Tentar de novo" : "Conferir respostas"}
        </button>
      </form>
    </section>
  );
}
