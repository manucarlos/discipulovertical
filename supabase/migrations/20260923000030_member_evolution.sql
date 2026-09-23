-- 0030 Evolução por pessoa: numa página só, quem está evoluindo nos conteúdos — Ciclos (trilha clássica) e
-- Trilhas do Grupo de Discipulado, lado a lado mas nunca somados (são sistemas de progresso separados; ver
-- 0021), frequência média das últimas 4 semanas, e último login ao lado da última leitura. Cada papel vê o seu
-- recorte de sempre: Admin/Super Admin (a própria igreja), Discipulador (quem está nos grupos que conduz),
-- Cuidador (quem está atribuído a ele) — reaproveitando as telas e os mecanismos de acesso que já existiam.
--
-- Também fecha, só nas funções desta migração, a falha descrita na 0026 (funções security definer não
-- filtravam por church_id): admin_member_overview passa a só devolver gente da MESMA igreja de quem chama.
-- Super Admin, por decisão do pastor, se comporta como Admin aqui por enquanto (só a própria igreja) — sem
-- seletor de igreja, que fica para a Fase 2 (docs/EXPANSAO.md). As demais ~80 funções continuam como estavam;
-- não é o escopo desta migração mexer nelas.

------------------------------------------------------------------------------
-- 1. Último login: só o necessário (id, last_sign_in_at) de auth.users, nunca a tabela inteira. Interna: só as
--    funções desta migração chamam, depois de já terem decidido quem tem permissão de ver cada id.
------------------------------------------------------------------------------
create function public.member_last_logins(p_ids uuid[])
returns table (member_id uuid, last_login_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select id, last_sign_in_at from auth.users where id = any (coalesce(p_ids, '{}'))
$$;
revoke execute on function public.member_last_logins(uuid[]) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 2. Métricas de evolução, para um conjunto de pessoas já filtrado por quem chama (interna, mesmo padrão de
--    member_situation_core). completed_lessons/started_lessons de Ciclo já vêm de member_situation_core; aqui
--    só o que falta: ciclos concluídos, frequência (Ciclo e Trilha, média móvel de 4 semanas), trilhas em
--    andamento/concluídas e suas lições, e o último login.
------------------------------------------------------------------------------
create function public.member_evolution_core(p_member_ids uuid[])
returns table (
  member_id uuid,
  cycles_completed int,
  cycles_total int,
  cycle_freq_4w numeric,
  groups_in_progress int,
  groups_completed int,
  group_lessons_completed int,
  group_lessons_started int,
  group_freq_4w numeric,
  last_login_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce(p_member_ids, '{}');
  v_cycles_total int;
begin
  select count(*)::int into v_cycles_total from public.cycles where active;

  return query
  with ids as (
    select unnest(v_ids) as member_id
  ),
  cyc as (
    select cp.user_id, count(*) filter (where cp.status = 'completed')::int as completed
    from public.cycle_progress cp
    where cp.user_id = any (v_ids)
    group by cp.user_id
  ),
  cyc_freq as (
    select lp.user_id, (count(*)::numeric / 4.0) as freq
    from public.lesson_progress lp
    join public.lessons l on l.id = lp.lesson_id and l.status = 'published' and l.required
    join public.cycles c on c.id = l.cycle_id and c.active
    where lp.status = 'completed' and lp.completed_at > now() - interval '28 days'
      and lp.user_id = any (v_ids)
    group by lp.user_id
  ),
  track_totals as (
    select track_id, count(*)::int as total_days from public.track_days group by track_id
  ),
  grp as (
    select
      gm.user_id,
      count(*) filter (where coalesce(done.n, 0) >= tt.total_days and tt.total_days > 0)::int as completed,
      count(*) filter (where coalesce(done.n, 0) < tt.total_days or tt.total_days = 0)::int as in_progress,
      coalesce(sum(coalesce(done.n, 0)), 0)::int as lessons_completed,
      coalesce(sum(coalesce(started.n, 0)), 0)::int as lessons_started
    from public.group_members gm
    join public.discipleship_groups g on g.id = gm.group_id
    join track_totals tt on tt.track_id = g.track_id
    left join lateral (
      select count(*) as n from public.group_progress gp
      where gp.user_id = gm.user_id and gp.group_id = gm.group_id and gp.completed_at is not null
    ) done on true
    left join lateral (
      select count(*) as n from public.group_progress gp
      where gp.user_id = gm.user_id and gp.group_id = gm.group_id
    ) started on true
    where gm.user_id = any (v_ids) and public.groups_enabled()
    group by gm.user_id
  ),
  grp_freq as (
    select gp.user_id, (count(*)::numeric / 4.0) as freq
    from public.group_progress gp
    where gp.completed_at is not null and gp.completed_at > now() - interval '28 days'
      and gp.user_id = any (v_ids) and public.groups_enabled()
    group by gp.user_id
  ),
  logins as (
    select * from public.member_last_logins(v_ids)
  )
  select
    i.member_id,
    coalesce(cyc.completed, 0),
    v_cycles_total,
    round(coalesce(cyc_freq.freq, 0), 1),
    coalesce(grp.in_progress, 0),
    coalesce(grp.completed, 0),
    coalesce(grp.lessons_completed, 0),
    coalesce(grp.lessons_started, 0),
    round(coalesce(grp_freq.freq, 0), 1),
    logins.last_login_at
  from ids i
  left join cyc on cyc.user_id = i.member_id
  left join cyc_freq on cyc_freq.user_id = i.member_id
  left join grp on grp.user_id = i.member_id
  left join grp_freq on grp_freq.user_id = i.member_id
  left join logins on logins.member_id = i.member_id;
end
$$;
revoke execute on function public.member_evolution_core(uuid[]) from public, anon, authenticated;

------------------------------------------------------------------------------
-- 3. As trilhas de grupo de uma pessoa (ficha segregada: cada trilha com seus próprios dias, nunca somada com
--    Ciclos). Quem pode ver: Admin, o cuidador dela, ou algum discipulador de um grupo em que ela está.
------------------------------------------------------------------------------
create function public.person_group_progress(p_target uuid)
returns table (
  group_id uuid,
  group_name text,
  track_title text,
  member_status text,
  total_days int,
  completed_days int,
  started_days int
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (
    public.is_admin()
    or public.cares_for(p_target)
    or exists (select 1 from public.group_members gm where gm.user_id = p_target and public.is_group_discipler(gm.group_id))
  ) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if not public.groups_enabled() then
    return;
  end if;

  return query
  select
    g.id, g.name, t.title, gm.status,
    tt.total_days,
    count(gp.lesson_id) filter (where gp.completed_at is not null)::int,
    count(gp.lesson_id)::int
  from public.group_members gm
  join public.discipleship_groups g on g.id = gm.group_id
  join public.tracks t on t.id = g.track_id
  join (select track_id, count(*)::int as total_days from public.track_days group by track_id) tt on tt.track_id = g.track_id
  left join public.group_progress gp on gp.user_id = gm.user_id and gp.group_id = gm.group_id
  where gm.user_id = p_target
  group by g.id, g.name, t.title, gm.status, tt.total_days, g.created_at
  order by g.created_at desc;
end
$$;
revoke execute on function public.person_group_progress(uuid) from public, anon;
grant execute on function public.person_group_progress(uuid) to authenticated;

------------------------------------------------------------------------------
-- 4. admin_member_overview: mesma lista de sempre (Pessoas), agora só da PRÓPRIA igreja de quem chama, e com
--    as colunas novas. Mesmo nome e mesmas 10 colunas de antes, na mesma ordem — quem já lê por nome de coluna
--    (exportação em CSV, a ficha) continua funcionando sem mudar nada.
------------------------------------------------------------------------------
drop function public.admin_member_overview(text, public.user_role, text, int, int);

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
  cycles_completed int,
  cycles_total int,
  cycle_freq_4w numeric,
  groups_in_progress int,
  groups_completed int,
  group_lessons_completed int,
  group_lessons_started int,
  group_freq_4w numeric,
  last_login_at timestamptz,
  total_count bigint
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_search text := public.normalize_text(btrim(coalesce(p_search, '')));
  v_church uuid := public.current_church_id();
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if p_status is not null
     and p_status not in ('onboarding_pending', 'not_started', 'in_progress', 'stalled', 'completed') then
    raise exception 'situação inválida' using errcode = '22023';
  end if;

  return query
  with matched as (
    select s.*
    from public.member_situation() s
    join public.profiles p on p.id = s.member_id
    where p.church_id = v_church
      and (p_role is null or s.role = p_role)
      and (
        v_search = ''
        or position(v_search in public.normalize_text(s.display_name)) > 0
        or position(v_search in public.normalize_text(s.email)) > 0
      )
      and (p_status is null or s.status = p_status)
  )
  select
    m.member_id, m.display_name, m.email, m.role, m.created_at, m.onboarded_at,
    m.completed_lessons, m.started_lessons, m.last_activity_at, m.status,
    e.cycles_completed, e.cycles_total, e.cycle_freq_4w,
    e.groups_in_progress, e.groups_completed, e.group_lessons_completed, e.group_lessons_started, e.group_freq_4w,
    e.last_login_at,
    count(*) over () as total_count
  from matched m
  join public.member_evolution_core((select coalesce(array_agg(member_id), '{}'::uuid[]) from matched)) e on e.member_id = m.member_id
  order by m.created_at desc, m.member_id
  limit greatest(coalesce(p_limit, 25), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end
$$;
revoke execute on function public.admin_member_overview(text, public.user_role, text, int, int) from public, anon;
grant execute on function public.admin_member_overview(text, public.user_role, text, int, int) to authenticated;

------------------------------------------------------------------------------
-- 5. group_roster: mesmas 4 colunas de sempre (RG-07: só o nome, nada de e-mail), mais as métricas de
--    evolução — inclusive de Ciclos, para o discipulador ver o quadro inteiro da pessoa, não só o grupo.
------------------------------------------------------------------------------
drop function public.group_roster(uuid);

create function public.group_roster(p_group uuid)
returns table (
  user_id uuid,
  display_name text,
  joined_at timestamptz,
  status text,
  cycles_completed int,
  cycles_total int,
  cycle_freq_4w numeric,
  completed_lessons int,
  started_lessons int,
  last_activity_at timestamptz,
  groups_in_progress int,
  groups_completed int,
  group_lessons_completed int,
  group_lessons_started int,
  group_freq_4w numeric,
  last_login_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if not (public.is_group_discipler(p_group) or (public.is_admin() and public.groups_enabled())) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;

  select coalesce(array_agg(m.user_id), '{}'::uuid[]) into v_ids from public.group_members m where m.group_id = p_group;

  return query
  select
    m.user_id, p.display_name, m.joined_at, m.status,
    e.cycles_completed, e.cycles_total, e.cycle_freq_4w,
    s.completed_lessons, s.started_lessons, s.last_activity_at,
    e.groups_in_progress, e.groups_completed, e.group_lessons_completed, e.group_lessons_started, e.group_freq_4w,
    e.last_login_at
  from public.group_members m
  join public.profiles p on p.id = m.user_id
  left join public.member_situation_core() s on s.member_id = m.user_id
  left join public.member_evolution_core(v_ids) e on e.member_id = m.user_id
  where m.group_id = p_group
  order by (m.status = 'active') desc, p.display_name, m.user_id;
end
$$;
revoke execute on function public.group_roster(uuid) from public, anon;
grant execute on function public.group_roster(uuid) to authenticated;

------------------------------------------------------------------------------
-- 6. caregiver_members e caregiver_member_card: mesmas colunas de sempre, mais as métricas de evolução.
------------------------------------------------------------------------------
drop function public.caregiver_members();

create function public.caregiver_members()
returns table (
  member_id uuid,
  display_name text,
  status text,
  completed_lessons int,
  started_lessons int,
  last_activity_at timestamptz,
  since timestamptz,
  alert_id uuid,
  alert_status text,
  cycles_completed int,
  cycles_total int,
  cycle_freq_4w numeric,
  groups_in_progress int,
  groups_completed int,
  group_lessons_completed int,
  group_lessons_started int,
  group_freq_4w numeric,
  last_login_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ids uuid[];
begin
  if not public.feature_enabled('feature.caregivers') or not (public.is_caregiver() or public.is_admin()) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;

  select coalesce(array_agg(a.member_id), '{}'::uuid[]) into v_ids
  from public.care_assignments a where a.caregiver_id = (select auth.uid()) and a.active;

  return query
  select s.member_id, s.display_name, s.status, s.completed_lessons, s.started_lessons, s.last_activity_at,
         a.since, al.id, al.status,
         e.cycles_completed, e.cycles_total, e.cycle_freq_4w,
         e.groups_in_progress, e.groups_completed, e.group_lessons_completed, e.group_lessons_started, e.group_freq_4w,
         e.last_login_at
  from public.care_assignments a
  join public.member_situation_core() s on s.member_id = a.member_id
  left join public.care_alerts al on al.member_id = a.member_id and al.status <> 'resolved'
  left join public.member_evolution_core(v_ids) e on e.member_id = a.member_id
  where a.caregiver_id = (select auth.uid()) and a.active
  order by (al.id is null), s.last_activity_at nulls first, s.display_name;
end
$$;
revoke execute on function public.caregiver_members() from public, anon;
grant execute on function public.caregiver_members() to authenticated;

drop function public.caregiver_member_card(uuid);

create function public.caregiver_member_card(p_member uuid)
returns table (
  member_id uuid,
  display_name text,
  email text,
  whatsapp text,
  bible_version text,
  status text,
  completed_lessons int,
  started_lessons int,
  last_activity_at timestamptz,
  onboarded_at timestamptz,
  cycles_completed int,
  cycles_total int,
  cycle_freq_4w numeric,
  groups_in_progress int,
  groups_completed int,
  group_lessons_completed int,
  group_lessons_started int,
  group_freq_4w numeric,
  last_login_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.cares_for(p_member) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  return query
  select s.member_id, s.display_name, s.email, p.whatsapp, p.bible_version, s.status,
         s.completed_lessons, s.started_lessons, s.last_activity_at, s.onboarded_at,
         e.cycles_completed, e.cycles_total, e.cycle_freq_4w,
         e.groups_in_progress, e.groups_completed, e.group_lessons_completed, e.group_lessons_started, e.group_freq_4w,
         e.last_login_at
  from public.member_situation_core() s
  join public.profiles p on p.id = s.member_id
  left join public.member_evolution_core(array[p_member]) e on e.member_id = s.member_id
  where s.member_id = p_member;
end
$$;
revoke execute on function public.caregiver_member_card(uuid) from public, anon;
grant execute on function public.caregiver_member_card(uuid) to authenticated;
