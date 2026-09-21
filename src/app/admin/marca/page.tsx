import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { PALETTE } from "@/lib/brand";
import { assetUrl, loadIdentity, ASSET_FILES } from "@/lib/brand-store";
import { resetBrand } from "./actions";
import { ColorsForm, ImagesForm, ImportForm } from "./brand-forms";

export const metadata = { title: "Marca · Conteúdo" };

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-line bg-card p-5">
      <h2 id={id} className="font-serif text-xl">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Marca da igreja (RF-33): as 3 cores, o logotipo, backup da identidade e volta ao padrão. */
export default async function BrandPage(props: PageProps<"/admin/marca">) {
  await connection();
  const search = await props.searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const erro = first(search.erro);
  const ok = first(search.ok);

  const { supabase } = await requireAdmin();
  const [{ data: row }, identity] = await Promise.all([
    supabase.from("church_brand").select("inputs, version, updated_at").maybeSingle(),
    loadIdentity(),
  ]);
  const saved = (row?.inputs ?? null) as { brand: string; foreground: string; background: string } | null;
  const initial = saved ?? { brand: PALETTE.brand, foreground: PALETTE.foreground, background: PALETTE.background };
  const custom = identity.customColors || identity.assets.length > 0;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="font-serif text-3xl leading-tight">Marca da igreja</h1>
      <p className="mt-2 text-muted">
        As cores e o logotipo do site, do app instalado no celular e do certificado. O nome da igreja se troca em{" "}
        <Link href="/admin/configuracoes" className="underline">
          Configurações
        </Link>
        . {custom ? "Este site usa a marca personalizada abaixo." : "Este site usa a marca padrão do projeto."}
      </p>

      {erro && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {erro}
        </p>
      )}
      {ok && (
        <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {ok}
        </p>
      )}

      <div className="mt-6 space-y-6">
        <Section id="cores-titulo" title="Cores">
          <p className="mb-4 text-sm text-muted">
            Escolha só 3 cores. O site calcula o resto (botão em foco, faixas suaves, texto secundário e o modo escuro da leitura) e só
            aceita uma combinação em que tudo fique legível.
          </p>
          <ColorsForm initial={initial} />
        </Section>

        <Section id="logo-titulo" title="Logotipo e ícones">
          <ImagesForm logoUrl={assetUrl(ASSET_FILES.logo, identity.version)} />
        </Section>

        <Section id="backup-titulo" title="Backup e outras instalações">
          <p className="text-sm text-muted">
            Baixe a identidade (as 3 cores e as imagens) num arquivo. Serve de backup e para levar a mesma marca a outra instalação.
          </p>
          {/* Download comum (não é uma tela do app). */}
          <a href="/admin/marca/exportar" download className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-line px-5 py-2.5 font-medium hover:bg-tint">
            Baixar a identidade
          </a>
          <div className="mt-5 border-t border-line pt-5">
            <ImportForm />
          </div>
        </Section>

        <Section id="padrao-titulo" title="Voltar ao padrão">
          <p className="text-sm text-muted">Apaga as cores e as imagens personalizadas e volta à marca padrão do projeto.</p>
          <form action={resetBrand}>
            <button type="submit" disabled={!custom} className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-red-300 px-5 py-2.5 font-medium text-red-800 hover:bg-red-50 disabled:opacity-50">
              Restaurar o padrão
            </button>
          </form>
        </Section>
      </div>
    </main>
  );
}
