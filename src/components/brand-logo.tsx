/* eslint-disable @next/next/no-img-element -- imagem local pequena e fixa; não precisa do otimizador do Next */

/**
 * Proporção do logotipo padrão (public/brand/logo.png). Só orienta o navegador a reservar o espaço; a altura é
 * fixa e a largura segue a imagem de verdade (que pode ser de outra proporção, se a igreja enviar o seu logotipo).
 */
const RATIO = 560 / 342;

/**
 * Logotipo da igreja: o enviado no painel (Administração > Marca) ou, se não houver, o padrão. Servido por
 * /marca/logo.png. Costuma ser escuro sobre fundo transparente: no modo escuro ele ganha uma base branca
 * arredondada, senão sumiria.
 */
export function BrandLogo({ height, name = "Logotipo da igreja", className = "" }: { height: number; name?: string; className?: string }) {
  return (
    <img
      src="/marca/logo.png"
      alt={name}
      width={Math.round(height * RATIO)}
      height={height}
      className={`block w-auto max-w-full dark:rounded-lg dark:bg-white dark:px-2 dark:py-1 ${className}`}
      style={{ height }}
    />
  );
}
