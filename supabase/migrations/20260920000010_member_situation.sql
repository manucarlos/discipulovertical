-- 0010 Situação das pessoas numa função única (interna), usada pela lista de pessoas e, a seguir,
-- pelo painel de indicadores. Também corrige uma regra: o alerta de "parado" vale para MEMBROS
-- (e cuidadores), não para a equipe. Um Admin ou Editor que nunca fez a trilha não é "parado".
--
-- Descoberto nos testes de usabilidade com pessoas simuladas (tests/e2e): o administrador aparecia
-- como "Parado" no filtro que o pastor mais usa.

create function public.member_situation()
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
  status text
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_required int;
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;

  select count(*)::int into v_required
  from public.lessons l
  join public.cycles c on c.id = l.cycle_id
  where l.status = 'published' and l.required and c.active;

  return query
  with base as (
    select
      p.id as member_id,
      p.display_name,
      p.email,
      p.role,
      p.created_at,
      p.onboarded_at,
      count(lp.lesson_id) filter (where lp.status = 'completed' and l2.id is not null)::int as completed_lessons,
      count(lp.lesson_id)::int as started_lessons,
      greatest(max(lp.updated_at), max(lp.started_at), max(lp.completed_at)) as last_activity_at
    from public.profiles p
    left join public.lesson_progress lp on lp.user_id = p.id
    left join public.lessons l2
      on l2.id = lp.lesson_id and l2.status = 'published' and l2.required
    group by p.id
  )
  select
    b.member_id, b.display_name, b.email, b.role, b.created_at, b.onboarded_at,
    b.completed_lessons, b.started_lessons, b.last_activity_at,
    case
      when b.onboarded_at is null then 'onboarding_pending'
      when v_required > 0 and b.completed_lessons >= v_required then 'completed'
      when b.role in ('member', 'caregiver')
           and coalesce(b.last_activity_at, b.onboarded_at, b.created_at) < now() - interval '14 days' then 'stalled'
      when b.started_lessons = 0 then 'not_started'
      else 'in_progress'
    end as status
  from base b;
end
$$;

-- Interna: só as outras funções do banco a chamam.
revoke execute on function public.member_situation() from public, anon, authenticated;

-- A lista passa a usar a função única (mesma assinatura de antes).
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
  v_search text := lower(btrim(coalesce(p_search, '')));
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
      or position(v_search in lower(s.display_name)) > 0
      or position(v_search in lower(s.email)) > 0
    )
    and (p_status is null or s.status = p_status)
  order by s.created_at desc, s.member_id
  limit greatest(coalesce(p_limit, 25), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end
$$;
