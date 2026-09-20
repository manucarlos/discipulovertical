"use client";

import { useActionState } from "react";
import { deleteAccount, updateProfile, updateReminders, type FormState } from "./actions";

const inputClass =
  "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base text-foreground focus:border-brand";
const primaryButton =
  "rounded-xl bg-brand px-5 py-3 font-medium text-on-brand transition hover:bg-brand-strong disabled:opacity-60";

function Feedback({ state }: { state: FormState }) {
  if (!state) return null;
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
        {state.error}
      </p>
    );
  }
  return (
    <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      {state.ok}
    </p>
  );
}

export function ProfileForm({
  defaults,
  versions,
}: {
  defaults: { displayName: string; whatsapp: string; bibleVersion: string };
  versions: { code: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateProfile, null);
  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-medium">
        Como você quer ser chamado(a)?
        <input name="displayName" defaultValue={defaults.displayName} required maxLength={80} autoComplete="name" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        WhatsApp <span className="font-normal text-muted">(opcional)</span>
        <input
          name="whatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          defaultValue={defaults.whatsapp}
          placeholder="(11) 91234-5678"
          className={inputClass}
        />
        <span className="mt-1 block text-xs font-normal text-muted">Apague o número para removê-lo.</span>
      </label>
      <label className="block text-sm font-medium">
        Versão da Bíblia
        <select name="bibleVersion" defaultValue={defaults.bibleVersion} className={inputClass}>
          {versions.map((v) => (
            <option key={v.code} value={v.code}>
              {v.code} · {v.name}
            </option>
          ))}
        </select>
      </label>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Salvando…" : "Salvar dados"}
      </button>
    </form>
  );
}

export function RemindersForm({ email, whatsapp, hasWhatsapp }: { email: boolean; whatsapp: boolean; hasWhatsapp: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateReminders, null);
  return (
    <form action={action} className="space-y-4">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="email" defaultChecked={email} className="mt-1 size-4 accent-brand" />
        <span>Quero receber lembretes e avisos por e-mail (no máximo 2 por semana).</span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="whatsapp" defaultChecked={whatsapp} className="mt-1 size-4 accent-brand" />
        <span>
          Quero receber lembretes por WhatsApp.
          {!hasWhatsapp && <span className="block text-xs text-muted">Informe o seu WhatsApp acima para ativar.</span>}
        </span>
      </label>
      <p className="text-xs text-muted">Você pode desligar quando quiser. Desligar não apaga o registro de que você aceitou antes.</p>
      <Feedback state={state} />
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Salvando…" : "Salvar preferências"}
      </button>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(deleteAccount, null);
  return (
    <details className="rounded-xl border border-red-200">
      <summary className="cursor-pointer px-4 py-3 font-medium text-red-800">Excluir minha conta</summary>
      <form action={action} className="space-y-4 border-t border-red-200 p-4">
        <p className="text-sm">
          Isto <strong>apaga a sua conta e todos os seus dados pessoais</strong>: perfil, consentimentos e o seu progresso na trilha.
          Não dá para desfazer. Se entrar de novo depois, você começa do zero.
        </p>
        <label className="block text-sm font-medium">
          Para confirmar, digite <strong>EXCLUIR</strong>
          <input name="confirm" autoComplete="off" className={inputClass} />
        </label>
        <Feedback state={state} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-red-700 px-5 py-3 font-medium text-white transition hover:bg-red-800 disabled:opacity-60"
        >
          {pending ? "Excluindo…" : "Excluir minha conta para sempre"}
        </button>
      </form>
    </details>
  );
}
