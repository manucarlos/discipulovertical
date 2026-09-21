-- 0016 Cuidadores e alertas de quem parou (RF-20, RF-21, RF-25, RN-07, RN-13).
--
-- Privacidade (seção 2 do handoff): o cuidador vê SÓ os membros atribuídos a ele; notas de cuidado só
-- o autor e o Admin leem. Tudo isso depende da chave "feature.caregivers": com ela desligada,
-- cares_for() devolve falso e o cuidador não enxerga ninguém.

------------------------------------------------------------------------------
-- Situação das pessoas sem a checagem de Admin (uso interno das funções abaixo)
------------------------------------------------------------------------------
create function public.member_situation_core()
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
revoke execute on function public.member_situation_core() from public, anon, authenticated;

-- A versão de sempre passa a conferir o Admin e chamar a interna (mesma assinatura e mesmo resultado).
create or replace function public.member_situation()
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
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  return query select * from public.member_situation_core();
end
$$;

------------------------------------------------------------------------------
-- Atribuições
------------------------------------------------------------------------------
create table public.care_assignments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  caregiver_id uuid not null references public.profiles (id) on delete cascade,
  active boolean not null default true,
  since timestamptz not null default now(),
  ended_at timestamptz,
  check (member_id <> caregiver_id)
);
-- Um cuidador ativo por membro.
create unique index care_assignments_one_active on public.care_assignments (member_id) where active;
create index care_assignments_caregiver_idx on public.care_assignments (caregiver_id) where active;
alter table public.care_assignments enable row level security;

revoke all on public.care_assignments from anon, authenticated;
grant select on public.care_assignments to authenticated; -- gravar só pelas funções abaixo

create function public.is_caregiver()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'caregiver', false)
$$;
revoke execute on function public.is_caregiver() from public, anon;
grant execute on function public.is_caregiver() to authenticated;

-- A pessoa logada é cuidadora ativa deste membro (e o recurso está ligado)?
create function public.cares_for(p_member uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.feature_enabled('feature.caregivers')
    and exists (
      select 1 from public.care_assignments a
      where a.member_id = p_member and a.caregiver_id = (select auth.uid()) and a.active
    )
$$;
revoke execute on function public.cares_for(uuid) from public, anon;
grant execute on function public.cares_for(uuid) to authenticated;

create policy care_assignments_read on public.care_assignments
  for select to authenticated
  using (public.is_admin() or caregiver_id = (select auth.uid()));

-- O cuidador lê o PROGRESSO dos atribuídos (só andamento das lições; nada de reflexão aqui).
create policy lesson_progress_caregiver_read on public.lesson_progress
  for select to authenticated using (public.cares_for(user_id));
create policy cycle_progress_caregiver_read on public.cycle_progress
  for select to authenticated using (public.cares_for(user_id));

-- Quem deixa de ser cuidador deixa também os membros que acompanhava (voltam para a fila do Admin).
create function public.end_care_on_role_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'caregiver' and new.role is distinct from 'caregiver' then
    update public.care_assignments set active = false, ended_at = now()
    where caregiver_id = new.id and active;
  end if;
  return new;
end
$$;
revoke execute on function public.end_care_on_role_change() from public, anon, authenticated;
create trigger profiles_end_care_on_role_change after update of role on public.profiles
  for each row execute function public.end_care_on_role_change();

create function public.assign_caregiver(p_member uuid, p_caregiver uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_member_role public.user_role;
  v_caregiver_role public.user_role;
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  select role into v_member_role from public.profiles where id = p_member;
  select role into v_caregiver_role from public.profiles where id = p_caregiver;
  if v_member_role is null or v_caregiver_role is null then
    raise exception 'perfil não encontrado' using errcode = 'P0002';
  end if;
  if v_caregiver_role <> 'caregiver' then
    raise exception 'Só quem tem o perfil de cuidador pode receber membros.' using errcode = 'P0001';
  end if;
  if v_member_role not in ('member', 'caregiver') then
    raise exception 'Equipe de conteúdo e administradores não recebem cuidador.' using errcode = 'P0001';
  end if;
  if p_member = p_caregiver then
    raise exception 'Ninguém cuida de si mesmo.' using errcode = 'P0001';
  end if;

  update public.care_assignments set active = false, ended_at = now() where member_id = p_member and active;
  insert into public.care_assignments (member_id, caregiver_id) values (p_member, p_caregiver);
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'care_assigned', 'profile', p_member::text, jsonb_build_object('caregiver', p_caregiver));
end
$$;
revoke execute on function public.assign_caregiver(uuid, uuid) from public, anon;
grant execute on function public.assign_caregiver(uuid, uuid) to authenticated;

create function public.unassign_caregiver(p_member uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  update public.care_assignments set active = false, ended_at = now() where member_id = p_member and active;
  if found then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values ((select auth.uid()), 'care_unassigned', 'profile', p_member::text, '{}'::jsonb);
  end if;
end
$$;
revoke execute on function public.unassign_caregiver(uuid) from public, anon;
grant execute on function public.unassign_caregiver(uuid) to authenticated;

-- RN-13: rodízio. Cada membro sem cuidador vai para o cuidador com menos membros (empate: o de id menor).
create function public.auto_assign_caregivers()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_member uuid;
  v_caregiver uuid;
  v_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;

  for v_member in
    select p.id from public.profiles p
    where p.role = 'member' and p.onboarded_at is not null
      and not exists (select 1 from public.care_assignments a where a.member_id = p.id and a.active)
    order by p.created_at, p.id
  loop
    select c.id into v_caregiver
    from public.profiles c
    where c.role = 'caregiver' and c.onboarded_at is not null
    order by (select count(*) from public.care_assignments a where a.caregiver_id = c.id and a.active), c.id
    limit 1;
    exit when v_caregiver is null;
    insert into public.care_assignments (member_id, caregiver_id) values (v_member, v_caregiver);
    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values ((select auth.uid()), 'care_auto_assigned', 'assignment', null, jsonb_build_object('count', v_count));
  end if;
  return v_count;
end
$$;
revoke execute on function public.auto_assign_caregivers() from public, anon;
grant execute on function public.auto_assign_caregivers() to authenticated;

-- Fila do Admin: membros ativos que ainda não têm cuidador.
create function public.admin_care_queue()
returns table (member_id uuid, display_name text, email text, created_at timestamptz, status text, last_activity_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  return query
  select s.member_id, s.display_name, s.email, s.created_at, s.status, s.last_activity_at
  from public.member_situation_core() s
  where s.role = 'member' and s.onboarded_at is not null
    and not exists (select 1 from public.care_assignments a where a.member_id = s.member_id and a.active)
  order by s.created_at, s.member_id
  limit 200;
end
$$;
revoke execute on function public.admin_care_queue() from public, anon;
grant execute on function public.admin_care_queue() to authenticated;

------------------------------------------------------------------------------
-- Notas de cuidado
------------------------------------------------------------------------------
create table public.care_notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  created_at timestamptz not null default now()
);
create index care_notes_member_idx on public.care_notes (member_id, created_at desc);
alter table public.care_notes enable row level security;

revoke all on public.care_notes from anon, authenticated;
grant select, insert, delete on public.care_notes to authenticated;

-- Só o autor e o Admin leem.
create policy care_notes_read on public.care_notes
  for select to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());
create policy care_notes_insert on public.care_notes
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.feature_enabled('feature.caregivers')
    and (public.is_admin() or public.cares_for(member_id))
  );
create policy care_notes_delete_own on public.care_notes
  for delete to authenticated using (author_id = (select auth.uid()));

------------------------------------------------------------------------------
-- Alertas de quem parou (RN-07, RF-25)
------------------------------------------------------------------------------
create table public.care_alerts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'in_contact', 'resolved')),
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  resolution text check (resolution is null or char_length(resolution) <= 500)
);
create unique index care_alerts_one_unresolved on public.care_alerts (member_id) where status <> 'resolved';
create index care_alerts_status_idx on public.care_alerts (status, opened_at);
alter table public.care_alerts enable row level security;

revoke all on public.care_alerts from anon, authenticated;
grant select on public.care_alerts to authenticated; -- gravar só pelas funções abaixo

create policy care_alerts_read on public.care_alerts
  for select to authenticated
  using (public.is_admin() or public.cares_for(member_id));

-- Abre um alerta para cada pessoa parada (14 dias sem atividade) e fecha o de quem voltou a ler.
-- Quem acabou de ter um alerta resolvido por uma pessoa não ganha outro por 14 dias, para o cuidador
-- não receber o mesmo pedido de novo logo depois de fazer o contato.
create function public.sync_stalled_alerts()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_opened int;
begin
  if not (public.is_admin() or public.is_caregiver()) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;

  update public.care_alerts a
  set status = 'resolved', resolved_at = now(), updated_at = now(), resolution = 'Voltou a ler a trilha.'
  where a.status <> 'resolved'
    and not exists (
      select 1 from public.member_situation_core() s where s.member_id = a.member_id and s.status = 'stalled'
    );

  with opened as (
    insert into public.care_alerts (member_id)
    select s.member_id
    from public.member_situation_core() s
    where s.status = 'stalled'
      and s.role in ('member', 'caregiver')
      and not exists (
        select 1 from public.care_alerts a
        where a.member_id = s.member_id
          and (a.status <> 'resolved'
               or (a.resolved_at > now() - interval '14 days'
                   and a.resolved_at > coalesce(s.last_activity_at, s.created_at)))
      )
    returning 1
  )
  select count(*)::int into v_opened from opened;
  return v_opened;
end
$$;
revoke execute on function public.sync_stalled_alerts() from public, anon;
grant execute on function public.sync_stalled_alerts() to authenticated;

create function public.set_alert_status(p_alert uuid, p_status text, p_resolution text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_member uuid;
  v_current text;
begin
  if p_status not in ('open', 'in_contact', 'resolved') then
    raise exception 'Situação de alerta inválida.' using errcode = '22023';
  end if;
  select member_id, status into v_member, v_current from public.care_alerts where id = p_alert;
  if v_member is null then
    raise exception 'Alerta não encontrado.' using errcode = 'P0002';
  end if;
  if not (public.is_admin() or public.cares_for(v_member)) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if v_current = 'resolved' then
    raise exception 'Este alerta já foi resolvido.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_resolution, '')) > 500 then
    raise exception 'O texto pode ter no máximo 500 caracteres.' using errcode = 'P0001';
  end if;

  update public.care_alerts
  set status = p_status,
      updated_at = now(),
      updated_by = (select auth.uid()),
      resolved_at = case when p_status = 'resolved' then now() else null end,
      resolution = case when p_status = 'resolved' then nullif(btrim(coalesce(p_resolution, '')), '') else null end
  where id = p_alert;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'care_alert_updated', 'profile', v_member::text,
          jsonb_build_object('alert', p_alert, 'from', v_current, 'to', p_status));
end
$$;
revoke execute on function public.set_alert_status(uuid, text, text) from public, anon;
grant execute on function public.set_alert_status(uuid, text, text) to authenticated;

------------------------------------------------------------------------------
-- Telas do cuidador
------------------------------------------------------------------------------
-- Os membros atribuídos a quem chama, com situação e alerta em aberto.
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
  alert_status text
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.feature_enabled('feature.caregivers') or not (public.is_caregiver() or public.is_admin()) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  return query
  select s.member_id, s.display_name, s.status, s.completed_lessons, s.started_lessons, s.last_activity_at,
         a.since, al.id, al.status
  from public.care_assignments a
  join public.member_situation_core() s on s.member_id = a.member_id
  left join public.care_alerts al on al.member_id = a.member_id and al.status <> 'resolved'
  where a.caregiver_id = (select auth.uid()) and a.active
  order by (al.id is null), s.last_activity_at nulls first, s.display_name;
end
$$;
revoke execute on function public.caregiver_members() from public, anon;
grant execute on function public.caregiver_members() to authenticated;

-- Ficha de contato de um membro atribuído.
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
  onboarded_at timestamptz
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
         s.completed_lessons, s.started_lessons, s.last_activity_at, s.onboarded_at
  from public.member_situation_core() s
  join public.profiles p on p.id = s.member_id
  where s.member_id = p_member;
end
$$;
revoke execute on function public.caregiver_member_card(uuid) from public, anon;
grant execute on function public.caregiver_member_card(uuid) to authenticated;

-- Consultas ao perfil e às reflexões valem também para o cuidador do membro (e ficam registradas).
create or replace function public.audit_person_view(p_target uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.is_admin() or public.cares_for(p_target)) then
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

create or replace function public.person_reflections(p_target uuid)
returns table (lesson_slug text, lesson_title text, body text, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.is_admin() or public.cares_for(p_target)) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if p_target is distinct from (select auth.uid()) then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values ((select auth.uid()), 'reflections_viewed', 'profile', p_target::text, '{}'::jsonb);
  end if;
  return query
    select l.slug, l.title, r.body, r.updated_at
    from public.reflections r join public.lessons l on l.id = r.lesson_id
    where r.user_id = p_target
    order by r.updated_at desc;
end
$$;
