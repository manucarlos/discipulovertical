export interface DbErrorLike {
  code?: string;
  message?: string;
}

export interface FriendlyError {
  message: string;
  /** A lição mudou por baixo da pessoa: é preciso recarregar antes de salvar. */
  conflict: boolean;
}

/** Traduz erros do banco (funções de edição e restrições) em mensagens em português para o editor. */
export function describeEditorError(error: DbErrorLike): FriendlyError {
  const text = error.message ?? "";

  if (error.code === "40001" || text.includes("conflito de edição")) {
    return {
      conflict: true,
      message:
        "Outra pessoa salvou esta lição enquanto você editava. Recarregue a página para ver a versão mais recente (copie antes o que você escreveu, se precisar).",
    };
  }
  if (text.includes("[PREENCHER]") || text.includes("lessons_no_publish_with_placeholders")) {
    return {
      conflict: false,
      message: "Uma lição publicada não pode ter marcadores [PREENCHER]. Preencha ou remova todos antes de salvar.",
    };
  }
  if (text.includes("último administrador")) {
    return {
      conflict: false,
      message: "Não é possível remover o último administrador. Promova outra pessoa a administrador antes.",
    };
  }
  if (error.code === "P0002" && text.includes("perfil não encontrado")) {
    return { conflict: false, message: "Essa pessoa não foi encontrada." };
  }
  if (error.code === "42501" || text.includes("row-level security") || text.includes("sem permissão")) {
    return {
      conflict: false,
      message: text.includes("só o administrador")
        ? "Só o administrador pode reordenar lições publicadas ou arquivadas."
        : "Você não tem permissão para fazer isso. Lições publicadas só podem ser alteradas pelo administrador.",
    };
  }
  // Mensagens que as nossas próprias funções do banco escrevem para a pessoa (já em português).
  if (error.code === "P0001" && text && !text.includes("[")) return { conflict: false, message: text };
  if (error.code === "22023" && text) return { conflict: false, message: `${text.charAt(0).toUpperCase()}${text.slice(1)}.` };

  return { conflict: false, message: "Não foi possível concluir a ação. Tente de novo em instantes." };
}
