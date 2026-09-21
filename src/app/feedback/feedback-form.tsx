"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  ALONE,
  DEVICES,
  EASE_HIGH_LABEL,
  EASE_LOW_LABEL,
  EASE_MAX,
  EASE_MIN,
  ENTERED,
  FEEDBACK_LIMITS,
  LESSON_DONE,
  type Choice,
} from "@/lib/feedback";
import { submitFeedback, type FeedbackState } from "./actions";

const fieldClass =
  "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base text-foreground focus:border-brand";

function RadioGroup({ name, legend, choices }: { name: string; legend: string; choices: Choice[] }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-1 space-y-1">
        {choices.map((c) => (
          <label key={c.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 text-base">
            <input type="radio" name={name} value={c.value} required className="size-5 shrink-0 accent-[var(--brand)]" />
            {c.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FeedbackForm() {
  const [state, action, pending] = useActionState<FeedbackState, FormData>(submitFeedback, null);

  if (state && "done" in state) {
    return (
      <section role="status" aria-labelledby="obrigado" className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950">
        <h2 id="obrigado" className="font-serif text-2xl">
          Obrigado!
        </h2>
        <p className="mt-2">Recebemos a sua resposta. Ela nos ajuda a cuidar melhor de quem está começando a caminhada.</p>
        <Link href="/" className="mt-4 inline-block underline">
          Voltar para a plataforma
        </Link>
      </section>
    );
  }

  return (
    <form action={action} className="mt-6 space-y-7">
      <RadioGroup name="device" legend="1. Qual aparelho você usou?" choices={DEVICES} />
      <RadioGroup name="entered" legend="2. Você conseguiu entrar com o Google?" choices={ENTERED} />
      <RadioGroup name="lessonDone" legend="3. Você conseguiu ler e concluir a primeira lição?" choices={LESSON_DONE} />

      <fieldset>
        <legend className="text-sm font-medium">
          4. De {EASE_MIN} a {EASE_MAX}, o quanto foi fácil usar?
        </legend>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {Array.from({ length: EASE_MAX - EASE_MIN + 1 }, (_, i) => EASE_MIN + i).map((n) => (
            <label
              key={n}
              className="flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-line bg-white px-2 py-2 text-base"
            >
              <input type="radio" name="ease" value={n} required className="size-5 accent-[var(--brand)]" />
              {n}
            </label>
          ))}
        </div>
        <p className="mt-1 flex justify-between text-xs text-muted">
          <span>{EASE_MIN} = {EASE_LOW_LABEL}</span>
          <span>{EASE_MAX} = {EASE_HIGH_LABEL}</span>
        </p>
      </fieldset>

      <RadioGroup name="alone" legend="5. Uma pessoa que acabou de conhecer a Jesus usaria isto sozinha?" choices={ALONE} />

      <label className="block text-sm font-medium">
        6. O que você mais gostou? <span className="font-normal text-muted">(opcional)</span>
        <textarea name="liked" rows={3} maxLength={FEEDBACK_LIMITS.text} className={fieldClass} />
      </label>

      <label className="block text-sm font-medium">
        7. O que confundiu, deu erro ou não funcionou? <span className="font-normal text-muted">(opcional)</span>
        <textarea name="confusing" rows={4} maxLength={FEEDBACK_LIMITS.text} className={fieldClass} />
      </label>

      <label className="block text-sm font-medium">
        8. O que você gostaria que existisse? <span className="font-normal text-muted">(opcional)</span>
        <textarea name="suggestion" rows={3} maxLength={FEEDBACK_LIMITS.text} className={fieldClass} />
      </label>

      <fieldset className="space-y-3 rounded-xl bg-tint p-4">
        <legend className="px-1 text-sm font-medium">Quer que a gente fale com você? (opcional)</legend>
        <label className="block text-sm font-medium">
          Seu nome
          <input name="contactName" maxLength={FEEDBACK_LIMITS.contactName} autoComplete="name" className={fieldClass} />
        </label>
        <label className="block text-sm font-medium">
          WhatsApp ou e-mail
          <input name="contact" maxLength={FEEDBACK_LIMITS.contact} className={fieldClass} />
        </label>
        <p className="text-xs leading-relaxed text-muted">
          Não escreva dados sensíveis (saúde, família, situação financeira). Nome e contato servem só para falarmos sobre este
          teste. As respostas ficam guardadas na plataforma e só a administração as lê; veja a{" "}
          <Link href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline">
            Política de Privacidade
          </Link>
          .
        </p>
      </fieldset>

      {/* Campo-isca: escondido das pessoas. Se um robô o preencher, a resposta é descartada. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Não preencha este campo
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {state && "error" in state && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand px-4 py-3 font-medium text-on-brand transition hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Enviar minha resposta"}
      </button>
    </form>
  );
}
