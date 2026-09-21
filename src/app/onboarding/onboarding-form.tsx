"use client";

import Link from "next/link";
import { useActionState } from "react";
import { consentText } from "@/lib/legal";
import { completeOnboarding, type OnboardingState } from "./actions";

interface Props {
  defaultName: string;
  versions: { code: string; name: string }[];
  defaultVersion: string;
  churchName: string;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base focus:border-brand";

export function OnboardingForm({ defaultName, versions, defaultVersion, churchName }: Props) {
  const CONSENT_TEXT = consentText(churchName);
  const [state, action, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, null);

  return (
    <form action={action} className="mt-6 space-y-5">
      <label className="block text-sm font-medium">
        Como você quer ser chamado(a)?
        <input
          name="displayName"
          defaultValue={defaultName}
          required
          autoComplete="name"
          maxLength={80}
          className={inputClass}
        />
      </label>

      <label className="block text-sm font-medium">
        WhatsApp <span className="font-normal text-muted">(opcional)</span>
        <input
          name="whatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 91234-5678"
          className={inputClass}
        />
      </label>

      <label className="block text-sm font-medium">
        Versão da Bíblia
        <select name="bibleVersion" defaultValue={defaultVersion} className={inputClass}>
          {versions.map((v) => (
            <option key={v.code} value={v.code}>
              {v.code} · {v.name}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs font-normal text-muted">
          A NTLH tem linguagem mais simples. Você pode trocar depois no seu perfil.
        </span>
      </label>

      <fieldset className="space-y-3 rounded-xl bg-tint p-4">
        <legend className="sr-only">Consentimentos</legend>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="consentData" required className="mt-1 size-4 accent-brand" />
          <span>
            {CONSENT_TEXT.data_processing}{" "}
            <Link href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline">
              Política de Privacidade
            </Link>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="consentEmail" className="mt-1 size-4 accent-brand" />
          <span>{CONSENT_TEXT.email_reminders}</span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="consentWhatsapp" className="mt-1 size-4 accent-brand" />
          <span>{CONSENT_TEXT.whatsapp_reminders}</span>
        </label>
      </fieldset>

      {state?.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-brand px-4 py-3 font-medium text-on-brand transition hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Começar minha trilha"}
      </button>
    </form>
  );
}
