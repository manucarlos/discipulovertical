/* eslint-disable @next/next/no-img-element -- imagem local pequena e fixa; não precisa do otimizador do Next */

/** Proporção do arquivo public/brand/logo.png (gerado por scripts/make-brand-assets.mjs). */
const RATIO = 560 / 338;

/**
 * Logotipo da Vertical Church. O desenho é preto e laranja sobre fundo transparente: no modo escuro o preto
 * sumiria, por isso nele o logotipo ganha uma base branca arredondada.
 */
export function BrandLogo({ height, className = "" }: { height: number; className?: string }) {
  return (
    <img
      src="/brand/logo.png"
      alt="Vertical Church"
      width={Math.round(height * RATIO)}
      height={height}
      className={`block w-auto max-w-full dark:rounded-lg dark:bg-white dark:px-2 dark:py-1 ${className}`}
      style={{ height }}
    />
  );
}
