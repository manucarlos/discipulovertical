-- 0013 Busca sem acento na lista de pessoas e registro de consulta de ficha.

------------------------------------------------------------------------------
-- normalize_text: minúsculas e sem acento, para comparar "Flávia" com "flavia".
-- Só SQL puro (translate): não depende de nenhuma extensão do Postgres.
------------------------------------------------------------------------------
create function public.normalize_text(t text)
returns text
language sql immutable set search_path = ''
as $$
  select translate(
    lower(coalesce(t, '')),
    'áàâãäåéèêëíìîïóòôõöúùûüçñ',
    'aaaaaaeeeeiiiiooooouuuucn'
  )
$$;
revoke execute on function public.normalize_text(text) from public, anon;
grant execute on function public.normalize_text(text) to authenticated;

-- A lista passa a comparar sem acento (mesma assinatura de antes).
create or replace function public.admin_member_overview(
  p_search text default null,
  p_role public.user_role default null,
  p_status text default null,
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  member_id uuid,
  display_name text,
  email text,
  role public.user_role,
  created_at timestamptz,
  onboarded_at timestamptz,
  completed_lessons int,
  started_lessons int,
  last_activity_at timestamptz,
  status text,
  total_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_search text := public.normalize_text(btrim(coalesce(p_search, '')));
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if p_status is not null
     and p_status not in ('onboarding_pending', 'not_started', 'in_progress', 'stalled', 'completed') then
    raise exception 'situação inválida' using errcode = '22023';
  end if;

  return query
  select
    s.member_id, s.display_name, s.email, s.role, s.created_at, s.onboarded_at,
    s.completed_lessons, s.started_lessons, s.last_activity_at, s.status,
    count(*) over () as total_count
  from public.member_situation() s
  where (p_role is null or s.role = p_role)
    and (
      v_search = ''
      or position(v_search in public.normalize_text(s.display_name)) > 0
      or position(v_search in public.normalize_text(s.email)) > 0
    )
    and (p_status is null or s.status = p_status)
  order by s.created_at desc, s.member_id
  limit greatest(coalesce(p_limit, 25), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end
$$;

------------------------------------------------------------------------------
-- Consulta de ficha (LGPD: acesso de administrador a dados de outra pessoa fica registrado).
-- Não repete o registro se o mesmo administrador olhou a mesma ficha nos últimos 10 minutos.
------------------------------------------------------------------------------
create function public.audit_person_view(p_target uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if p_target = (select auth.uid()) then
    return; -- olhar a própria ficha não é acesso a dados de terceiros
  end if;
  if exists (
    select 1 from public.audit_log
    where action = 'person_viewed' and actor_id = (select auth.uid()) and entity_id = p_target::text
      and created_at > now() - interval '10 minutes'
  ) then
    return;
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'person_viewed', 'profile', p_target::text, '{}'::jsonb);
end
$$;
revoke execute on function public.audit_person_view(uuid) from public, anon;
grant execute on function public.audit_person_view(uuid) to authenticated;
