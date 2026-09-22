import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createDb } from "./harness";

/**
 * Fase 2 (docs/EXPANSAO.md, migração 0026): cada função `security definer` do banco roda como DONA das
 * tabelas e ignora toda RLS — inclusive a política restritiva de isolamento por igreja. Cada uma precisa de
 * uma checagem explícita de `church_id` no corpo, do mesmo jeito que hoje cada uma já confere `is_admin()`.
 * Feito função por função, em grupos, cada grupo testado antes do próximo. O roteiro (os grupos, a ordem,
 * o padrão de correção) está em docs/FASE2.md.
 *
 * Este teste não é uma barreira que barra o deploy: é um LEMBRETE que não deixa esquecer. `JA_COBERTAS` lista
 * as que já têm o cuidado (ou não precisam: leem/escrevem em tabelas sem `church_id`, ou já são church-scoped
 * de outra forma). Se uma função nova entrar na lista do banco e não estiver em nenhuma das duas, o teste
 * falha — é o sinal para decidir: cobrir agora, ou anotar aqui como pendente da Fase 2.
 */
let db: PGlite;
const q = <T = Record<string, unknown>>(sql: string) => db.query<T>(sql).then((r) => r.rows);

beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

/**
 * Cobertas na Fase 1 porque, sem isso, o próprio banco único não funcionava (RF-1 deste trabalho): o
 * bootstrap do primeiro Admin, o convite, as telas públicas (sem login), os gatilhos de auditoria, e um
 * punhado de auxiliares que só leem a PRÓPRIA linha de quem chama (current_user_role e o que se apoia nela)
 * — nunca leem dado de outra pessoa, então não têm como vazar entre igrejas, hoje ou depois.
 */
const JA_COBERTAS = [
  "audit_app_setting",
  "audit_church_page",
  "audit_lesson_publication",
  "check_cron_secret", // só confere um segredo contra app_config (global, sem church_id) — não é dado de igreja
  "claim_church",
  "cron_enqueue",
  "cron_report", // atualiza uma notificação pelo id que o próprio agendador (dono do segredo) informou
  "cron_snapshot",
  "current_church_id",
  "current_user_role", // lê só o próprio perfil
  "email_templates_stamp",
  "feature_enabled",
  "groups_enabled", // só chama feature_enabled, já coberta
  "handle_new_user",
  "handle_user_confirmed",
  "is_admin", // lê só o próprio perfil
  "is_caregiver", // lê só o próprio perfil
  "is_discipler", // lê só o próprio perfil
  "is_editor_or_admin", // lê só o próprio perfil
  "is_super_admin",
  "lessons_block_placeholder_publish", // só valida a MESMA lição sendo publicada; não lê/escreve outra linha
  "public_brand_asset",
  "public_features", // só chama feature_enabled, já coberta
  "public_identity",
  "reset_church_brand",
  "save_church_assets",
  "save_church_brand",
  "submit_feedback",
  "unsubscribe_email",
].sort();

/**
 * Pendentes da Fase 2: leem ou escrevem em tabela de outra pessoa/grupo/lição (não só a própria linha),
 * contando com is_admin()/is_editor_or_admin()/etc. sem checar se é da MESMA igreja de quem foi consultado —
 * ou fazem a consulta sem nenhum recorte de igreja. Sem risco de vazar pelo app hoje (nenhuma tela expõe o
 * UUID de uma pessoa/lição de outra igreja), mas cada uma precisa do cuidado antes de haver uma segunda
 * igreja de verdade no banco.
 */
const PENDENTES_FASE_2 = [
  "add_group_pause",
  "admin_care_queue",
  "admin_dashboard",
  "admin_member_overview",
  "admin_set_discipler",
  "admin_set_role",
  "admin_transfer_group",
  "assign_caregiver",
  "audit_export",
  "audit_person_view",
  "auto_assign_caregivers",
  "can_access_quiz",
  "can_read_library_lesson",
  "caregiver_member_card",
  "caregiver_members",
  "cares_for",
  "content_metrics",
  "create_group",
  "cron_certificates",
  "delete_my_account",
  "discipler_sees_member",
  "end_care_on_role_change",
  "escalate_help_request",
  "get_quiz",
  "group_invite_preview",
  "group_roster",
  "handle_help_request",
  "has_progress_on_lesson",
  "help_request_names",
  "is_group_discipler",
  "is_group_member",
  "issue_certificates",
  "join_group",
  "leave_group",
  "lesson_in_group_track",
  "member_situation",
  "member_situation_core",
  "move_lesson",
  "person_reflections",
  "remove_group_pause",
  "request_help",
  "require_quiz_pass",
  "save_attendance",
  "save_group_meeting",
  "set_alert_status",
  "set_group_status",
  "submit_quiz",
  "sync_stalled_alerts",
  "unassign_caregiver",
  "verify_certificate",
].sort();

describe("funções security definer", () => {
  it("toda função dona (security definer) do schema public está numa das duas listas", async () => {
    const rows = await q<{ proname: string }>(
      `select distinct p.proname from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef order by 1`,
    );
    const real = rows.map((r) => r.proname).sort();
    const known = [...new Set([...JA_COBERTAS, ...PENDENTES_FASE_2])].sort();

    // Sobrou no banco e não está em nenhuma lista: função nova, decidir e anotar aqui.
    expect(real.filter((f) => !known.includes(f))).toEqual([]);
    // Está numa lista mas sumiu do banco: a lista ficou desatualizada (a função foi removida/renomeada).
    expect(known.filter((f) => !real.includes(f))).toEqual([]);
  });
});
