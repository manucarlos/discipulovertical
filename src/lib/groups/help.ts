import type { SupabaseClient } from "@supabase/supabase-js";

export const HELP_STATUS_LABEL: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em atendimento",
  answered: "Atendido",
  closed: "Encerrado",
};

export interface HelpRequest {
  id: string;
  requesterName: string;
  groupId: string | null;
  topic: string;
  message: string;
  destination: "discipler" | "pastoral";
  status: string;
  escalatedAt: string | null;
  handledNote: string;
  createdAt: string;
}

/**
 * Os pedidos que a pessoa pode ler (o banco decide): o discipulador vê os do grupo dele; o Admin vê os enviados
 * direto à equipe pastoral e os escalados. Nome de quem pediu vem por uma função que repete a mesma regra.
 */
export async function loadHelpRequests(supabase: SupabaseClient): Promise<HelpRequest[]> {
  const { data, error } = await supabase
    .from("help_requests")
    .select("id, user_id, group_id, topic, message, destination, status, escalated_at, handled_note, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Falha ao carregar os pedidos de ajuda: ${error.message}`);
  const rows = (data ?? []) as {
    id: string;
    group_id: string | null;
    topic: string;
    message: string;
    destination: "discipler" | "pastoral";
    status: string;
    escalated_at: string | null;
    handled_note: string;
    created_at: string;
  }[];

  const names = new Map<string, string>();
  if (rows.length > 0) {
    const { data: named } = await supabase.rpc("help_request_names", { p_ids: rows.map((r) => r.id) });
    for (const n of (named ?? []) as { request_id: string; display_name: string }[]) names.set(n.request_id, n.display_name);
  }
  return rows.map((r) => ({
    id: r.id,
    requesterName: names.get(r.id) ?? "(sem nome)",
    groupId: r.group_id,
    topic: r.topic,
    message: r.message,
    destination: r.destination,
    status: r.status,
    escalatedAt: r.escalated_at,
    handledNote: r.handled_note,
    createdAt: r.created_at,
  }));
}
