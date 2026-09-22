# Fase 2: isolar as funções `security definer` por igreja

A Fase 1 (migração `20260922000026_multi_tenant_foundation.sql`, ver [EXPANSAO.md](EXPANSAO.md)) isolou as **consultas diretas** (o que o app faz com `supabase.from(...)`) entre igrejas, por RLS. O que ficou de fora, de propósito: as ~50 funções `security definer` de escrita/leitura listadas em `PENDENTES_FASE_2` de [`tests/db/multi-tenant-checklist.test.ts`](../tests/db/multi-tenant-checklist.test.ts) — elas rodam como **donas das tabelas** e ignoram toda RLS, restritiva inclusive. Sem risco de vazar pelo app **hoje** (nenhuma tela expõe o UUID de uma pessoa/lição de outra igreja, e só existe uma igreja no banco), mas cada uma precisa do cuidado antes de haver uma segunda igreja de verdade.

Este documento é o roteiro: a ordem dos grupos e, para cada função, o que checar. **Uma sessão por grupo** (ou menos, nunca mais) — cada grupo testado e com a suíte inteira verde antes de passar para o próximo.

## O padrão a aplicar

A maioria das funções já confere `is_admin()`/`is_editor_or_admin()`/etc. — isso continua. O que falta é conferir que o **alvo** da ação (o `target`/`p_user`/`p_member`, a lição, o grupo...) é **da mesma igreja de quem chama**. Duas formas, conforme o caso:

**1. A função recebe o id de uma pessoa/linha específica** — junta com `current_church_id()`:

```sql
-- Antes (admin_set_role, base.sql): só confere que quem chama é Admin, não que o alvo é da mesma igreja.
if not public.is_admin() then
  raise exception 'não autorizado' using errcode = '42501';
end if;
select role into old_role from public.profiles where id = target for update;

-- Depois: o alvo precisa estar na igreja de quem chama (ou quem chama ser Super Admin).
if not public.is_admin() then
  raise exception 'não autorizado' using errcode = '42501';
end if;
select role into old_role from public.profiles
  where id = target and (church_id = public.current_church_id() or public.is_super_admin())
  for update;
```

Repare também em `admin_set_role`: o guarda do último Admin (`select count(*) from public.profiles where role = 'admin') <= 1`) conta admins do **banco inteiro**, não da igreja — precisa virar `where role = 'admin' and church_id = <a igreja do alvo>`. É o tipo de detalhe que só aparece lendo cada função com calma; o roteiro abaixo não tenta adivinhar todos de antemão.

**2. A função devolve uma lista/agregado** (`admin_dashboard`, `member_situation_core`...) — acrescenta `and church_id = current_church_id()` (ou o equivalente, via join) em cada sub-consulta, com `or is_super_admin()` quando fizer sentido o Super Admin ver tudo.

**Sempre**, depois de corrigir uma função:
1. Escreva (ou estenda) um teste em `tests/db/` provando que a igreja B não alcança o alvo da igreja A através dela — inclusive "à força" (UUID direto), como `tests/db/multi-tenant.test.ts` já faz para as consultas diretas.
2. Rode a suíte inteira (`npm test`), não só o arquivo novo — várias dessas funções são chamadas por outras.
3. Mova o nome de `PENDENTES_FASE_2` para `JA_COBERTAS` em `tests/db/multi-tenant-checklist.test.ts`, com um comentário curto do que foi conferido.
4. Marque o grupo como feito aqui embaixo.

## Os grupos, em ordem

A ordem começa pelo que outras funções dependem (situação do membro), depois segue a ordem natural do app (pessoas → conteúdo/progresso → painel → cuidadores → encerramentos → grupos).

### Grupo 1 — Pessoas: papéis e visão geral
`supabase/migrations/20260919000001_base.sql`, `20260920000007_member_overview.sql`, `20260920000009_delete_my_account.sql`, `20260920000013_search_and_access_log.sql`, `20260920000019_export_log.sql`

- [ ] `admin_set_role` — inclui o guarda do último Admin, hoje global (ver exemplo acima)
- [ ] `admin_member_overview`
- [ ] `audit_person_view`
- [ ] `audit_export`
- [ ] `delete_my_account` — cuidado extra: já mexe em muitas tabelas: confirmar que cada uma delas fica só a excluir dados da PRÓPRIA igreja (nunca deveria vazar hoje, já que é tudo pelo `user_id` de quem chama, mas vale a conferência)

### Grupo 2 — Progresso, quiz e edição de conteúdo
`20260919000003_progress.sql`, `20260919000006_lesson_editor.sql` (só `move_lesson`; `save_lesson`/`restore_lesson_version` já são `security invoker`, fora desta lista), `20260920000015_quiz_and_reflections.sql`

- [ ] `has_progress_on_lesson`
- [ ] `move_lesson`
- [ ] `can_access_quiz`
- [ ] `get_quiz`
- [ ] `require_quiz_pass`
- [ ] `submit_quiz`
- [ ] `person_reflections`

### Grupo 3 — Situação do membro e painel (base para os Grupos 4 e 6)
`20260920000010_member_situation.sql`, `20260920000012_dashboard.sql`, `member_situation_core` (definida em `20260920000016_caregivers.sql`, mas é a base de `admin_dashboard`/`member_situation` — por isso entra aqui, antes do Grupo 4)

- [ ] `member_situation_core`
- [ ] `member_situation`
- [ ] `admin_dashboard`
- [ ] `content_metrics`

### Grupo 4 — Cuidadores
`20260920000016_caregivers.sql`

- [ ] `admin_care_queue`
- [ ] `assign_caregiver`
- [ ] `unassign_caregiver`
- [ ] `auto_assign_caregivers`
- [ ] `caregiver_members`
- [ ] `caregiver_member_card`
- [ ] `cares_for`
- [ ] `end_care_on_role_change`
- [ ] `set_alert_status`
- [ ] `sync_stalled_alerts`

### Grupo 5 — Encerramentos e certificados
`20260920000018_closures_certificates.sql`

- [ ] `save_attendance`
- [ ] `issue_certificates`
- [ ] `verify_certificate` — pública (sem login, RF do certificado): confirmar código só devolve o certificado da igreja certa, nunca "vaza" a existência de um código de outra igreja
- [ ] `cron_certificates`

### Grupo 6 — Grupo de Discipulado: criar, entrar, conteúdo da trilha
`20260920000021_groups.sql` (parte)

- [ ] `create_group`
- [ ] `join_group`
- [ ] `leave_group`
- [ ] `can_read_library_lesson`
- [ ] `lesson_in_group_track`
- [ ] `is_group_member`
- [ ] `is_group_discipler`

### Grupo 7 — Grupo de Discipulado: painel do discipulador e administração
`20260920000021_groups.sql` (parte), `20260920000022_group_roster.sql` (parte)

- [ ] `discipler_sees_member`
- [ ] `group_roster`
- [ ] `group_invite_preview`
- [ ] `add_group_pause`
- [ ] `remove_group_pause`
- [ ] `save_group_meeting`
- [ ] `set_group_status`
- [ ] `admin_transfer_group`
- [ ] `admin_set_discipler`

### Grupo 8 — Pedidos de ajuda pastoral
`20260920000021_groups.sql` (parte), `20260920000022_group_roster.sql` (parte)

- [ ] `request_help`
- [ ] `handle_help_request`
- [ ] `escalate_help_request`
- [ ] `help_request_names`

## Quando terminar

`tests/db/multi-tenant-checklist.test.ts` com `PENDENTES_FASE_2` vazia é o sinal de que a Fase 2 acabou — nesse ponto o isolamento entre igrejas cobre tanto as consultas diretas quanto toda função de escrita/leitura do banco, e o produto está pronto, tecnicamente, para uma segunda igreja de verdade (falta ainda a decisão de produto de como uma visita sem login sabe "qual igreja" — [EXPANSAO.md](EXPANSAO.md), seção 1).
