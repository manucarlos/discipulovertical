-- 0019 Registro de exportações (RF-26, LGPD): baixar a lista de pessoas em CSV fica no log de auditoria,
-- com quem baixou, o quê e quantas linhas. Sem nenhum dado pessoal no registro.

create function public.audit_export(p_kind text, p_rows int)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if p_kind not in ('members', 'progress') then
    raise exception 'Tipo de exportação inválido.' using errcode = '22023';
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'data_exported', 'export', p_kind, jsonb_build_object('rows', greatest(coalesce(p_rows, 0), 0)));
end
$$;
revoke execute on function public.audit_export(text, int) from public, anon;
grant execute on function public.audit_export(text, int) to authenticated;
