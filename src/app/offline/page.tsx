export const metadata = { title: "Sem internet" };

/** Mostrada pelo service worker quando não há conexão. Página estática e pública, sem nenhum dado de pessoa. */
export default function OfflinePage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-card p-8 text-center shadow-sm">
        <p className="text-sm font-medium uppercase tracking-widest text-brand">Vertical Church</p>
        <h1 className="mt-2 font-serif text-3xl leading-tight">Você está sem internet</h1>
        <p className="mt-3 text-muted">
          Não conseguimos abrir esta página agora. Confira sua conexão e tente de novo. Nada do que você já concluiu se
          perdeu.
        </p>
        {/* Link comum de propósito: precisa recarregar a página inteira (uma navegação interna não tentaria a rede). */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-3 font-medium text-on-brand hover:bg-brand-strong"
        >
          Tentar de novo
        </a>
      </div>
    </main>
  );
}
