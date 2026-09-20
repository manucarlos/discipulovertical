-- 0008 Fecha o acesso de funções que o papel anônimo (chave pública do Supabase) não precisa chamar.
-- O teste tests/db/invariants.test.ts passa a exigir isso de toda função do schema public.

-- Auxiliares usadas pelas políticas de RLS: só usuários logados.
revoke execute on function
  public.current_user_role(), public.is_admin(), public.is_editor_or_admin()
  from public, anon;
grant execute on function
  public.current_user_role(), public.is_admin(), public.is_editor_or_admin()
  to authenticated;

-- Funções de gatilho: são disparadas pelo banco e nunca chamadas por API. O privilégio de execução
-- só é conferido na criação do gatilho, então podem ficar fechadas para todos.
revoke execute on function
  public.handle_new_user(),
  public.audit_log_append_only(),
  public.audit_lesson_publication(),
  public.lessons_block_placeholder_publish()
  from public, anon, authenticated;

-- Funções novas não nascem executáveis pelo anônimo nem por "todo mundo".
alter default privileges in schema public revoke execute on functions from public, anon;
