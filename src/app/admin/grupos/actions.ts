"use server";

import { redirect } from "next/navigation";
import { describeEditorError } from "@/lib/admin/errors";
import { requireAdmin } from "@/lib/auth";
import { isTrackStatus, isUuid, validateTrackForm } from "@/lib/groups/tracks";

const back = (params: Record<string, string>, hash = ""): never =>
  redirect(`/admin/grupos?${new URLSearchParams(params).toString()}${hash}`);

/** Cria uma trilha de grupo (rascunho) com as lições da biblioteca na ordem dos dias. Só o Admin. */
export async function createTrack(formData: FormData): Promise<void> {
  const { supabase, user } = await requireAdmin();
  const parsed = validateTrackForm(formData);
  if (!parsed.ok) back({ erro: parsed.error }, "#nova-trilha");
  else {
    const { data: lessons, error: lessonsError } = await supabase.from("lessons").select("id, slug").eq("kind", "library").in("slug", parsed.slugs);
    if (lessonsError) back({ erro: describeEditorError(lessonsError).message }, "#nova-trilha");
    const bySlug = new Map(((lessons ?? []) as { id: string; slug: string }[]).map((l) => [l.slug, l.id]));
    const missing = parsed.slugs.filter((s) => !bySlug.has(s));
    if (missing.length > 0) back({ erro: `Lição da biblioteca não encontrada: ${missing.join(", ")}.` }, "#nova-trilha");

    const { data: track, error } = await supabase
      .from("tracks")
      .insert({ title: parsed.title, description: parsed.description, author_id: user.id })
      .select("id")
      .single();
    if (error || !track) back({ erro: describeEditorError(error ?? {}).message }, "#nova-trilha");
    else {
      const days = parsed.slugs.map((slug, i) => ({ track_id: track.id as string, day_number: i + 1, lesson_id: bySlug.get(slug)! }));
      const { error: daysError } = await supabase.from("track_days").insert(days);
      if (daysError) {
        await supabase.from("tracks").delete().eq("id", track.id as string); // não deixa uma trilha vazia pela metade
        back({ erro: describeEditorError(daysError).message }, "#nova-trilha");
      }
      back({ ok: "Trilha criada como rascunho. Publique quando as lições estiverem prontas." }, "#trilhas");
    }
  }
}

/** Publica, arquiva ou volta a rascunho. Publicar exige todas as lições publicadas (o banco confere). */
export async function setTrackStatus(trackId: string, status: string): Promise<void> {
  const { supabase } = await requireAdmin();
  if (!isUuid(trackId) || !isTrackStatus(status)) back({ erro: "Pedido inválido." });
  else {
    const { error } = await supabase.from("tracks").update({ status }).eq("id", trackId);
    if (error) back({ erro: describeEditorError(error).message }, "#trilhas");
    back({ ok: status === "published" ? "Trilha publicada. Os discipuladores já podem escolhê-la." : status === "archived" ? "Trilha arquivada." : "Trilha voltou a rascunho." }, "#trilhas");
  }
}

/** Passa um grupo para outro discipulador. */
export async function transferGroup(groupId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const to = String(formData.get("discipler") ?? "");
  if (!isUuid(groupId) || !isUuid(to)) back({ erro: "Escolha o novo discipulador." });
  else {
    const { error } = await supabase.rpc("admin_transfer_group", { p_group: groupId, p_new_discipler: to });
    if (error) back({ erro: describeEditorError(error).message }, "#grupos");
    back({ ok: "Grupo transferido." }, "#grupos");
  }
}

/** Marca (ou desmarca) uma pessoa como discipulador. */
export async function setDiscipler(personId: string, formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  if (!isUuid(personId)) back({ erro: "Pessoa inválida." });
  else {
    const { error } = await supabase.rpc("admin_set_discipler", { p_target: personId, p_value: formData.get("value") === "1" });
    if (error) back({ erro: describeEditorError(error).message }, "#discipuladores");
    back({ ok: "Discipulador atualizado." }, "#discipuladores");
  }
}

/** Marca como discipulador a pessoa com este e-mail (ela já precisa ter entrado na plataforma). */
export async function addDiscipler(formData: FormData): Promise<void> {
  const { supabase } = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back({ erro: "Digite um e-mail válido." }, "#discipuladores");
  else {
    const { data } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
    if (!data) back({ erro: "Ninguém com esse e-mail entrou na plataforma ainda." }, "#discipuladores");
    else {
      const { error } = await supabase.rpc("admin_set_discipler", { p_target: data.id as string, p_value: true });
      if (error) back({ erro: describeEditorError(error).message }, "#discipuladores");
      back({ ok: "Discipulador adicionado." }, "#discipuladores");
    }
  }
}
