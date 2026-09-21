import { REFLECTION_MAX } from "@/lib/quiz";

interface Props {
  practiceDone: boolean;
  reflection: string;
  /** A pergunta de reflexão que a lição propõe, se houver. */
  question?: string | null;
  practiceAction: (formData: FormData) => Promise<void>;
  reflectionAction: (formData: FormData) => Promise<void>;
  saved?: "pratica" | "reflexao";
}

/** RF-13: marcar a prática como feita (autodeclarada, não bloqueia nada) e escrever uma reflexão privada. */
export function PracticeSection({ practiceDone, reflection, question = null, practiceAction, reflectionAction, saved }: Props) {
  return (
    <section aria-labelledby="reflexao-titulo" className="mt-6 rounded-2xl border border-line bg-card p-5">
      <h2 id="reflexao-titulo" className="font-serif text-2xl">
        Sua prática
      </h2>

      <form action={practiceAction} className="mt-3">
        <input type="hidden" name="done" value={practiceDone ? "0" : "1"} />
        <button
          type="submit"
          aria-pressed={practiceDone}
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 font-medium ${
            practiceDone ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-line hover:bg-lilac"
          }`}
        >
          {practiceDone ? "✓ Prática feita (toque para desmarcar)" : "Marcar prática como feita"}
        </button>
        {saved === "pratica" && (
          <span role="status" className="ml-3 text-sm text-muted">
            Salvo.
          </span>
        )}
      </form>

      <form action={reflectionAction} className="mt-6 space-y-2">
        <label htmlFor="reflexao" className="block font-medium">
          Reflexão (opcional)
        </label>
        {question && <p className="font-serif text-lg">{question}</p>}
        <p id="reflexao-ajuda" className="text-sm text-muted">
          O que Deus falou com você nesta lição? O texto é privado: só você e a liderança da igreja podem lê-lo.
        </p>
        <textarea
          id="reflexao"
          name="body"
          defaultValue={reflection}
          rows={5}
          maxLength={REFLECTION_MAX}
          aria-describedby="reflexao-ajuda"
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand"
        />
        <div className="flex items-center gap-3">
          <button type="submit" className="rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong">
            Salvar reflexão
          </button>
          {saved === "reflexao" && (
            <span role="status" className="text-sm text-muted">
              Reflexão salva.
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
