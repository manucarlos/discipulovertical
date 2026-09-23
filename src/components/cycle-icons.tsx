/**
 * Ícones decorativos dos cards de ciclo/trilha. Traço simples (não fotografia gerada por IA): cada igreja
 * define seus próprios títulos de ciclo (multi-igreja, ver EXPANSAO.md), então o ícone é escolhido pela
 * posição, não pelo texto — continua fazendo sentido em qualquer igreja, em qualquer ordem de conteúdo.
 * Usa currentColor para herdar a cor da marca (var(--brand)), que também é configurável por igreja.
 */
const ICONS = [
  // caminho/passos
  <path key="path" d="M7 4c-1.5 2-1.5 4 0 5s1.5 3 0 5-1.5 4 0 5M17 4c1.5 2 1.5 4 0 5s-1.5 3 0 5 1.5 4 0 5" />,
  // broto/crescimento
  <path key="seedling" d="M12 20V11M12 11c0-4 3-6 7-6 0 4-2 7-7 7Zm0 0C12 8 9 6 5 6c0 4 2 7 7 7Z" />,
  // bússola
  <>
    <circle key="compass-circle" cx="12" cy="12" r="8" />
    <path key="compass-needle" d="m14.5 9.5-2 5-3-1 2-5 3 1Z" />
  </>,
  // chama
  <path key="flame" d="M12 3c1 3-3 4-3 7.5A3.5 3.5 0 0 0 12 14a3.5 3.5 0 0 0 3-5.3c1.3 1 2 2.6 2 4.3a5 5 0 0 1-10 0C7 9 9 7 12 3Z" />,
  // livro aberto
  <path key="book" d="M3 5.5c2.5-1 5-1 9 .5v13c-4-1.5-6.5-1.5-9-.5v-13ZM21 5.5c-2.5-1-5-1-9 .5v13c4-1.5 6.5-1.5 9-.5v-13Z" />,
  // mãos/comunidade
  <path key="hands" d="M4 13c0-3 2-6 4-7M20 13c0-3-2-6-4-7M8 6c1.3-1.3 2.7-2 4-2s2.7.7 4 2M4 13c0 4 3.5 7 8 7s8-3 8-7" />,
] as const;

export function CycleIcon({ position, className }: { position: number; className?: string }) {
  const icon = ICONS[(position - 1) % ICONS.length];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {icon}
    </svg>
  );
}
