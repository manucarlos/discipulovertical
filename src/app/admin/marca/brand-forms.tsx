"use client";

import { useActionState, useMemo, useState } from "react";
import { cssVariables, type Palette } from "@/lib/brand";
import { derivePalette } from "@/lib/brand-derive";
import { normalizeHex } from "@/lib/color";
import { importBrand, saveBrandColors, uploadBrandImages, type BrandState } from "./actions";

const inputClass = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-foreground focus:border-brand";

function Notice({ state }: { state: BrandState }) {
  if (!state) return null;
  return "error" in state ? (
    <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
      {state.error}
    </p>
  ) : (
    <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      {state.ok}
    </p>
  );
}

/** Amostra de como as cores ficam nas telas: usa a paleta calculada, só dentro deste quadro. */
function Sample({ palette, title }: { palette: Palette; title: string }) {
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <div style={cssVariables(palette) as React.CSSProperties} className="mt-1 rounded-2xl border border-line bg-background p-4 text-foreground">
        <p className="text-xs font-medium uppercase tracking-widest text-brand">Sua próxima lição</p>
        <p className="mt-1 font-serif text-xl">Bem-vindo à família</p>
        <p className="text-sm text-muted">Fundamentos · cerca de 5 min</p>
        <div className="mt-3 rounded-lg bg-tint p-3 text-sm">
          Uma faixa suave, com texto e <span className="text-brand underline">um link</span>.
        </div>
        <div className="mt-3 h-2 rounded-full bg-tint">
          <div className="h-2 w-1/3 rounded-full bg-brand" />
        </div>
        <span className="mt-3 inline-block rounded-xl bg-brand px-4 py-2 font-medium text-on-brand">Começar lição</span>
      </div>
    </div>
  );
}

interface ColorFieldProps {
  name: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorField({ name, label, hint, value, onChange }: ColorFieldProps) {
  const valid = normalizeHex(value);
  return (
    <div>
      <label className="block text-sm font-medium">
        {label}
        <span className="mt-0.5 block text-xs font-normal text-muted">{hint}</span>
        <span className="mt-1 flex items-center gap-2">
          <input
            type="color"
            aria-label={`${label}: escolher a cor`}
            value={valid ?? "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="size-11 shrink-0 cursor-pointer rounded-lg border border-line bg-white p-1"
          />
          <input name={name} value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} spellCheck={false} autoComplete="off" className={`${inputClass} mt-0 font-mono`} />
        </span>
      </label>
    </div>
  );
}

export function ColorsForm({ initial }: { initial: { brand: string; foreground: string; background: string } }) {
  const [state, action, pending] = useActionState<BrandState, FormData>(saveBrandColors, null);
  const [values, setValues] = useState(initial);
  const result = useMemo(() => derivePalette(values), [values]);
  const set = (key: keyof typeof values) => (v: string) => setValues((old) => ({ ...old, [key]: v }));

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <ColorField name="brand" label="Cor da igreja" hint="Botões, links e destaques" value={values.brand} onChange={set("brand")} />
        <ColorField name="foreground" label="Cor do texto" hint="Escura, para o texto principal" value={values.foreground} onChange={set("foreground")} />
        <ColorField name="background" label="Cor do fundo" hint="Clara, o fundo das telas" value={values.background} onChange={set("background")} />
      </div>

      {result.ok ? (
        <>
          {result.adjustedBrand && (
            <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              A cor da igreja é clara demais para servir de botão e de link. Vamos usar uma versão um pouco mais escura,{" "}
              <strong className="font-mono">{result.adjustedBrand}</strong>, para o texto ficar legível.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Sample palette={result.light} title="Como fica (tema normal)" />
            <Sample palette={result.readingDark} title="Como fica (leitura no modo escuro)" />
          </div>
          <p className="text-sm text-emerald-900">
            <span aria-hidden="true">✓ </span>
            {result.checks.length} combinações de cores conferidas: todas legíveis (padrão de acessibilidade WCAG AA).
          </p>
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer py-2 text-muted underline">Ver as combinações conferidas</summary>
            <ul className="mt-2 space-y-1">
              {result.checks.map((c) => (
                <li key={c.name} className="flex justify-between gap-3">
                  <span>{c.name}</span>
                  <span className="tabular-nums text-muted">
                    {c.ratio.toFixed(1).replace(".", ",")} (mínimo {String(c.min).replace(".", ",")})
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <ul role="alert" className="list-disc rounded-xl bg-red-50 py-3 pl-8 pr-4 text-sm text-red-800">
          {result.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <Notice state={state} />
      <button
        type="submit"
        disabled={pending || !result.ok}
        className="rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Salvando…" : "Salvar cores"}
      </button>
    </form>
  );
}

export function ImagesForm({ logoUrl }: { logoUrl: string }) {
  const [state, action, pending] = useActionState<BrandState, FormData>(uploadBrandImages, null);
  return (
    <form action={action} className="space-y-4">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagem da marca servida por /marca */}
        <img src={logoUrl} alt="Logotipo atual" className="h-20 w-auto rounded-lg border border-line bg-white p-2" />
        <p className="text-sm text-muted">O logotipo que o site usa hoje.</p>
      </div>
      <label className="block text-sm font-medium">
        Novo logotipo
        <span className="mt-0.5 block text-xs font-normal text-muted">
          PNG ou JPG, até 2 MB, com pelo menos 128 pixels. De preferência com fundo branco ou transparente e o desenho centralizado.
        </span>
        <input name="logo" type="file" accept="image/png,image/jpeg" required className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        Símbolo para o ícone da aba do navegador <span className="font-normal text-muted">(opcional)</span>
        <span className="mt-0.5 block text-xs font-normal text-muted">
          Um desenho simples (uma cruz, um monograma). O nome inteiro não se lê num ícone tão pequeno. Sem ele, a aba usa o logotipo.
        </span>
        <input name="symbol" type="file" accept="image/png,image/jpeg" className={inputClass} />
      </label>
      <Notice state={state} />
      <button type="submit" disabled={pending} className="rounded-xl bg-brand px-5 py-2.5 font-medium text-on-brand hover:bg-brand-strong disabled:opacity-60">
        {pending ? "Enviando…" : "Enviar logotipo"}
      </button>
    </form>
  );
}

export function ImportForm() {
  const [state, action, pending] = useActionState<BrandState, FormData>(importBrand, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-medium">
        Importar um arquivo de identidade
        <input name="arquivo" type="file" accept="application/json,.json" required className={inputClass} />
      </label>
      <Notice state={state} />
      <button type="submit" disabled={pending} className="rounded-xl border border-line px-5 py-2.5 font-medium hover:bg-tint disabled:opacity-60">
        {pending ? "Importando…" : "Importar"}
      </button>
    </form>
  );
}
