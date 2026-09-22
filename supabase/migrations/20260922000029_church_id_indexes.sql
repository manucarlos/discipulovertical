-- 0029 Índices em church_id (achado ao investigar lentidão relatada em produção): a migração 0026 acrescentou
-- `church_id` a ~30 tabelas e uma política restritiva que confere `church_id = current_church_id()` em toda
-- consulta a elas, mas não criou nenhum índice para essa coluna nova. Postgres varre a tabela inteira para
-- cada consulta sem um índice para apoiar o filtro. Com o piloto pequeno isso ainda não dói, mas cresce mal e
-- é de graça corrigir agora. `cycles`/`lessons`/`church_pages`/`app_settings`/`church_brand`/`church_assets`
-- ficam de fora: já têm índice cobrindo church_id (é a chave primária ou uma unique que começa por ele).
do $$
declare
  t text;
  tables text[] := array[
    'consents', 'lesson_versions', 'lesson_internal_notes', 'quiz_questions',
    'lesson_progress', 'cycle_progress', 'quiz_attempts', 'reflections',
    'care_assignments', 'care_notes', 'care_alerts',
    'email_templates', 'notifications', 'email_unsubscribe_tokens',
    'closure_events', 'closure_attendance', 'certificates',
    'tracks', 'track_days', 'discipleship_groups', 'group_members', 'group_pauses',
    'group_meetings', 'group_progress', 'group_reflections', 'help_requests',
    'feedback_responses', 'profiles', 'audit_log', 'church_admins_pending'
  ];
begin
  foreach t in array tables loop
    execute format('create index if not exists %I on public.%I (church_id)', t || '_church_id_idx', t);
  end loop;
end
$$;
