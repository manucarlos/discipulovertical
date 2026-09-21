import type { QuizResult } from "@/lib/quiz";

/** Estado devolvido pela ação do quiz ao formulário (fica fora do arquivo "use server", que só exporta ações). */
export type QuizState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; result: QuizResult };
