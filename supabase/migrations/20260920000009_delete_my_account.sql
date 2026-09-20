-- 0009 Exclusão da própria conta (RF-27, LGPD).
--
-- Feita por uma função do banco em vez de uma chamada administrativa da API, para que o site NUNCA
-- precise guardar a chave secreta (service_role). A função só age sobre a conta de quem a chama
-- (auth.uid()); não há parâmetro de "qual conta".
--
-- O que acontece (tudo em cascata, pelas chaves estrangeiras já existentes):
--   apagados  perfil, consentimentos, progresso das lições e dos ciclos
--   mantidos  histórico de versões de lições e log de auditoria, SEM o vínculo com a pessoa
--             (author_id/actor_id viram nulos); nenhum dado pessoal fica nesses registros
--   mantido   um registro 'account_deleted' no log, sem identificação (só o perfil que a pessoa tinha)

create function public.delete_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.user_role;
begin
  if v_uid is null then
    raise exception 'não autorizado' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'conta não encontrada' using errcode = 'P0002';
  end if;

  -- Sem administrador ninguém consegue publicar nem promover ninguém.
  if v_role = 'admin' and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'não é possível excluir a conta do último administrador' using errcode = 'P0001';
  end if;

  -- O vínculo com a pessoa é desfeito quando a conta some (actor_id vira nulo, permitido pelo gatilho
  -- de somente-inserção). entity_id fica nulo de propósito: nada aqui identifica quem foi.
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'account_deleted', 'account', null, jsonb_build_object('role', v_role));

  delete from auth.users where id = v_uid;
end
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
