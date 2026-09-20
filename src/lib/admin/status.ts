export type LessonStatus = "draft" | "in_review" | "published" | "archived";
export type StaffRole = "editor" | "admin";

export const STATUS_LABEL: Record<LessonStatus, string> = {
  draft: "Rascunho",
  in_review: "Em revisão",
  published: "Publicada",
  archived: "Arquivada",
};

export interface Transition {
  to: LessonStatus;
  label: string;
  /** Se preenchido, a ação existe mas está bloqueada, e este é o motivo. */
  blockedReason?: string;
  /** Aviso mostrado antes de confirmar. */
  warning?: string;
  /** Botão de destaque (a ação principal do momento). */
  primary?: boolean;
}

/**
 * Quais mudanças de status uma pessoa pode fazer. É a mesma regra que a RLS do banco impõe
 * (o editor só mexe em rascunho e em revisão; só o Admin publica, despublica e arquiva);
 * aqui serve para mostrar os botões certos e recusar cedo, com uma mensagem clara.
 */
export function allowedTransitions(role: StaffRole, from: LessonStatus, hasPlaceholders: boolean): Transition[] {
  const publishBlock = hasPlaceholders
    ? "Ainda há marcadores [PREENCHER]. Preencha ou remova todos e salve para poder publicar."
    : undefined;

  if (role === "editor") {
    if (from === "draft") return [{ to: "in_review", label: "Enviar para revisão", primary: true }];
    if (from === "in_review") return [{ to: "draft", label: "Voltar para rascunho" }];
    return [];
  }

  switch (from) {
    case "draft":
      return [
        { to: "published", label: "Publicar", blockedReason: publishBlock, primary: true },
        { to: "in_review", label: "Enviar para revisão" },
        { to: "archived", label: "Arquivar" },
      ];
    case "in_review":
      return [
        { to: "published", label: "Publicar", blockedReason: publishBlock, primary: true },
        { to: "draft", label: "Voltar para rascunho" },
        { to: "archived", label: "Arquivar" },
      ];
    case "published":
      return [
        {
          to: "archived",
          label: "Arquivar",
          warning: "Novos membros deixam de ver a lição. Quem já a iniciou continua a vê-la no histórico.",
        },
        {
          to: "draft",
          label: "Despublicar (voltar a rascunho)",
          warning: "A lição some para todos os membros, inclusive quem já a iniciou. Para tirá-la do ar sem esse efeito, prefira arquivar.",
        },
      ];
    case "archived":
      return [{ to: "draft", label: "Restaurar como rascunho" }];
  }
}

export function findTransition(
  role: StaffRole,
  from: LessonStatus,
  to: LessonStatus,
  hasPlaceholders: boolean,
): Transition | null {
  return allowedTransitions(role, from, hasPlaceholders).find((t) => t.to === to) ?? null;
}
