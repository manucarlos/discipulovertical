import { CAMINHADA_E_MORDOMIA } from "./lessons-caminhada";
import { FAMILIA } from "./lessons-familia";
import { MATURIDADE_E_FORMACAO } from "./lessons-maturidade";
import { FINANCAS_EMOCIONAL_CONJUGAL } from "./lessons-sensiveis";
import type { LibraryLesson, LibraryTrack } from "./types";

/**
 * As 24 lições da biblioteca de lançamento (seção 19), as 4 da formação do discipulador, e as 4 de "Família"
 * (29 a 32, escritas em 22/09/2026 a pedido do pastor: hombridade, papel da esposa, unidade e lealdade, e
 * criação dos filhos), na ordem.
 */
export const LIBRARY_LESSONS: LibraryLesson[] = [...CAMINHADA_E_MORDOMIA, ...FINANCAS_EMOCIONAL_CONJUGAL, ...MATURIDADE_E_FORMACAO, ...FAMILIA].sort((a, b) => a.n - b.n);

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** As 5 trilhas prontas da seção 19 (uma lição pode estar em mais de uma) e a formação opcional do discipulador. */
export const LIBRARY_TRACKS: LibraryTrack[] = [
  {
    title: "Caminhada e Coração",
    description: "Sete dias sobre a vida diária com Deus e o cuidado com o coração: rotina, caráter, arrependimento, ansiedade, tristeza e perdão.",
    themes: ["Caminhada cristã", "Emocional"],
    lessons: [1, 2, 3, 4, 12, 13, 14],
  },
  {
    title: "Mordomia e Finanças",
    description: "Sete dias sobre administrar com fidelidade o que Deus confia: tempo, dinheiro, contentamento, dívidas e o orçamento da família.",
    themes: ["Mordomia", "Finanças"],
    lessons: [5, 6, 7, 8, 9, 10, 11],
  },
  {
    title: "Maturidade em Comunidade",
    description: "Sete dias para crescer em lealdade, unidade, perseverança, honra, serviço, paciência e no chamado de fazer discípulos.",
    themes: ["Maturidade"],
    lessons: range(18, 24),
  },
  {
    title: "Casamento Firme",
    description: "Quatro dias sobre o casamento como aliança, a comunicação, o perdão e a hora de buscar ajuda pastoral.",
    themes: ["Conjugal"],
    lessons: [15, 16, 14, 17],
  },
  {
    title: "Jornada Completa",
    description: "As 24 lições da biblioteca, em ordem, ao longo de 24 dias de leitura.",
    themes: ["Caminhada cristã", "Mordomia", "Finanças", "Emocional", "Conjugal", "Maturidade"],
    lessons: range(1, 24),
  },
  {
    title: "Formação do discipulador",
    description: "Quatro dias opcionais para quem vai conduzir um grupo: o que é discipular, ouvir com cuidado, conduzir o encontro e proteger o grupo.",
    themes: ["Formação do discipulador"],
    lessons: range(25, 28),
  },
  {
    title: "Vida em Família",
    description: "Quatro dias sobre caráter e relações em casa: hombridade, o papel da esposa cristã, unidade e lealdade na família, e a criação dos filhos.",
    themes: ["Família"],
    lessons: range(29, 32),
  },
];

export type { LibraryLesson, LibraryTrack };
