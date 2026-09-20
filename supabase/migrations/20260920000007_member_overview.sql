-- 0007 Visão geral dos membros (RF-23): lista com busca, filtro de papel e de situação, paginada.
-- SECURITY DEFINER com verificação de Admin: só o Admin enxerga dados pessoais de todos.
--
-- Situação de cada pessoa (nesta ordem de precedência):
--   onboarding_pending  ainda não concluiu o primeiro acesso
--   completed           concluiu todas as lições obrigatórias publicadas
--   stalled             (RN-07) 14 dias ou mais sem atividade, contados da última atividade;
--                       se nunca começou, contados do primeiro acesso
--   not_started         concluiu o primeiro acesso, ainda não abriu nenhuma lição (há menos de 14 dias)
--   in_progress         o resto
-- "Atividade" = abrir, ler (posição salva) ou concluir uma lição.

create function public.admin_member_overview(
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
  v_required int;
  v_search text := lower(btrim(coalesce(p_search, '')));
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if p_status is not null
     and p_status not in ('onboarding_pending', 'not_started', 'in_progress', 'stalled', 'completed') then
    raise exception 'situação inválida' using errcode = '22023';
  end if;

  -- Quantas lições obrigatórias existem hoje para quem está na trilha.
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
    where (p_role is null or p.role = p_role)
      and (
        v_search = ''
        or position(v_search in lower(p.display_name)) > 0
        or position(v_search in lower(p.email)) > 0
      )
    group by p.id
  ),
  classified as (
    select
      b.*,
      case
        when b.onboarded_at is null then 'onboarding_pending'
        when v_required > 0 and b.completed_lessons >= v_required then 'completed'
        when coalesce(b.last_activity_at, b.onboarded_at, b.created_at) < now() - interval '14 days' then 'stalled'
        when b.started_lessons = 0 then 'not_started'
        else 'in_progress'
      end as status
    from base b
  )
  select
    c.member_id, c.display_name, c.email, c.role, c.created_at, c.onboarded_at,
    c.completed_lessons, c.started_lessons, c.last_activity_at, c.status,
    count(*) over () as total_count
  from classified c
  where p_status is null or c.status = p_status
  order by c.created_at desc, c.member_id
  limit greatest(coalesce(p_limit, 25), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end
$$;

revoke execute on function public.admin_member_overview(text, public.user_role, text, int, int) from public, anon;
grant execute on function public.admin_member_overview(text, public.user_role, text, int, int) to authenticated;
