"use server";

/** Ação de MENTIRINHA da pré-visualização /dev/pessoas: não grava nada. */
export async function devChangeRole(): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("indisponível");
}
