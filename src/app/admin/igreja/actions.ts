"use server";

import { redirect } from "next/navigation";
import { describeEditorError } from "@/lib/admin/errors";
import { validateChurchPage } from "@/lib/admin/church";
import { requireAdmin } from "@/lib/auth";

const back = (params: Record<string, string>, hash = ""): never =>
  redirect(`/admin/igreja?${new URLSearchParams(params).toString()}${hash}`);

/** Salva uma página de "Nossa Igreja". Só o Admin (a RLS do banco impõe o mesmo). */
export async function saveChurchPage(slug: string, formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const parsed = validateChurchPage({
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
  });
  if (!parsed.ok) back({ erro: parsed.error }, `#p-${slug}`);
  else {
    const { data, error } = await supabase
      .from("church_pages")
      .update({ title: parsed.title, body: parsed.body })
      .eq("slug", slug)
      .select("slug");
    if (error) back({ erro: describeEditorError(error).message }, `#p-${slug}`);
    if (!data || data.length === 0) back({ erro: "Essa página não foi encontrada." });
    back({ ok: "Página salva. Os membros já veem o novo texto." }, `#p-${slug}`);
  }
}
