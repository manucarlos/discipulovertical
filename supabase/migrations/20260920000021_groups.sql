-- 0021 Grupo de Discipulado (handoff, seções 17 a 20).
--
-- Um discipulador conduz um grupo por uma trilha diária, no mesmo ritmo. O calendário (uma lição por dia
-- ativo, pausas, "em atraso") vive em src/lib/groups/calendar.ts, como a liberação gradual da trilha; o banco
-- cuida de quem pode ver o quê:
--   * o discipulador só lê dados dos grupos que conduz, e das reflexões só as COMPARTILHADAS (RG-07);
--   * o discípulo lê só os próprios dados; sair do grupo tira o acesso do discipulador aos dados dele (RG-08);
--   * um pedido de ajuda direto à equipe pastoral NÃO é visível ao discipulador (RG-10);
--   * tudo depende da chave "feature.groups": desligada, ninguém enxerga nada disso.
--
-- Decisão de implementação (docs/DECISIONS.md): o progresso do grupo fica numa tabela própria (group_progress),
-- em vez de mudar a chave de lesson_progress, para não mexer no progresso já em uso da trilha de novos convertidos.

------------------------------------------------------------------------------
-- Lições da biblioteca convivem com as da trilha
------------------------------------------------------------------------------
alter table public.lessons add column kind text not null default 'trail' check (kind in ('trail', 'library'));
alter table public.lessons add column themes text[] not null default '{}';
alter table public.lessons alter column cycle_id drop not null;
alter table public.lessons add constraint lessons_kind_cycle check ((kind = 'trail') = (cycle_id is not null));

alter table public.profiles add column is_discipler boolean not null default false;

create function public.groups_enabled()
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.feature_enabled('feature.groups') $$;
revoke execute on function public.groups_enabled() from public, anon;
grant execute on function public.groups_enabled() to authenticated;

-- Quem pode conduzir grupos: quem o Admin marcou como discipulador (e o próprio Admin).
create function public.is_discipler()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.groups_enabled() and coalesce(
    (select p.is_discipler or p.role = 'admin' from public.profiles p where p.id = (select auth.uid())), false)
$$;
revoke execute on function public.is_discipler() from public, anon;
grant execute on function public.is_discipler() to authenticated;

create function public.admin_set_discipler(p_target uuid, p_value boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  update public.profiles set is_discipler = coalesce(p_value, false) where id = p_target;
  if not found then
    raise exception 'perfil não encontrado' using errcode = 'P0002';
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'discipler_changed', 'profile', p_target::text, jsonb_build_object('is_discipler', coalesce(p_value, false)));
end
$$;
revoke execute on function public.admin_set_discipler(uuid, boolean) from public, anon;
grant execute on function public.admin_set_discipler(uuid, boolean) to authenticated;

------------------------------------------------------------------------------
-- Trilhas de grupo (só o Admin cria e edita)
------------------------------------------------------------------------------
create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  themes text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.tracks enable row level security;

create table public.track_days (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks (id) on delete cascade,
  day_number int not null check (day_number >= 1),
  lesson_id uuid not null references public.lessons (id) on delete restrict,
  unique (track_id, day_number),
  unique (track_id, lesson_id)
);
alter table public.track_days enable row level security;

revoke all on public.tracks, public.track_days from anon, authenticated;
grant select, insert, update, delete on public.tracks, public.track_days to authenticated;

-- Trilhas publicadas são o cardápio do discipulador; rascunhos, só da equipe.
create policy tracks_read on public.tracks
  for select to authenticated
  using (public.is_editor_or_admin() or (status = 'published' and public.groups_enabled()));
create policy tracks_admin_write on public.tracks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy track_days_read on public.track_days
  for select to authenticated
  using (exists (select 1 from public.tracks t where t.id = track_id));
create policy track_days_admin_write on public.track_days
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Uma trilha só é publicada com pelo menos um dia e todas as lições publicadas.
create function public.tracks_publish_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    if not exists (select 1 from public.track_days d where d.track_id = new.id) then
      raise exception 'A trilha precisa de pelo menos um dia antes de ser publicada.' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.track_days d join public.lessons l on l.id = d.lesson_id
      where d.track_id = new.id and l.status <> 'published'
    ) then
      raise exception 'Todas as lições da trilha precisam estar publicadas.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end
$$;
revoke execute on function public.tracks_publish_guard() from public, anon, authenticated;
create trigger tracks_publish_guard before update on public.tracks
  for each row execute function public.tracks_publish_guard();

------------------------------------------------------------------------------
-- Grupos
------------------------------------------------------------------------------
create table public.discipleship_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  discipler_id uuid references public.profiles (id) on delete set null,
  track_id uuid not null references public.tracks (id) on delete restrict,
  start_date date not null,
  -- Dias da semana ativos (1 = segunda ... 7 = domingo). Padrão: segunda a sábado.
  active_weekdays int[] not null default '{1,2,3,4,5,6}' check (
    cardinality(active_weekdays) between 1 and 7 and active_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]),
  release_hour int not null default 6 check (release_hour between 0 and 23),
  meeting_weekday int check (meeting_weekday between 1 and 7),
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  -- Alerta ao discipulador: dias ativos seguidos sem leitura (RG-11, configurável).
  alert_days int not null default 3 check (alert_days between 1 and 14),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);
create index discipleship_groups_discipler_idx on public.discipleship_groups (discipler_id);
alter table public.discipleship_groups enable row level security;

create table public.group_members (
  group_id uuid not null references public.discipleship_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  status text not null default 'active' check (status in ('active', 'left')),
  -- O que a pessoa aceitou ao entrar (RG-08): ver exatamente o que o discipulador enxerga.
  consent_version text not null,
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id) where status = 'active';
alter table public.group_members enable row level security;

create table public.group_pauses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.discipleship_groups (id) on delete cascade,
  from_date date not null,
  until_date date not null,
  check (until_date >= from_date)
);
alter table public.group_pauses enable row level security;

create table public.group_meetings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.discipleship_groups (id) on delete cascade,
  meeting_date date not null,
  notes text not null default '' check (char_length(notes) <= 5000),
  attendees uuid[] not null default '{}',
  unique (group_id, meeting_date)
);
alter table public.group_meetings enable row level security;

create table public.group_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null references public.discipleship_groups (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  challenge_done boolean not null default false,
  primary key (user_id, group_id, lesson_id)
);
alter table public.group_progress enable row level security;

create table public.group_reflections (
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null references public.discipleship_groups (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  -- Padrão: compartilhada nas lições comuns, privada nas sensíveis (RG-07). Quem decide é o discípulo.
  shared boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, group_id, lesson_id)
);
alter table public.group_reflections enable row level security;

revoke all on public.discipleship_groups, public.group_members, public.group_pauses, public.group_meetings,
              public.group_progress, public.group_reflections from anon, authenticated;
grant select on public.discipleship_groups, public.group_members, public.group_pauses, public.group_meetings to authenticated;
grant select, insert, update on public.group_progress to authenticated;
grant select, insert, update, delete on public.group_reflections to authenticated;

------------------------------------------------------------------------------
-- Predicados de acesso (SECURITY DEFINER: evitam recursão entre as políticas)
------------------------------------------------------------------------------
create function public.is_group_discipler(p_group uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.groups_enabled() and exists (
    select 1 from public.discipleship_groups g where g.id = p_group and g.discipler_id = (select auth.uid()))
$$;
create function public.is_group_member(p_group uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.groups_enabled() and exists (
    select 1 from public.group_members m
    where m.group_id = p_group and m.user_id = (select auth.uid()) and m.status = 'active')
$$;
create function public.lesson_in_group_track(p_group uuid, p_lesson uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.discipleship_groups g join public.track_days d on d.track_id = g.track_id
    where g.id = p_group and d.lesson_id = p_lesson)
$$;
-- O discipulador só enxerga dados de quem AINDA está no grupo (RG-08): sair tira o acesso.
create function public.discipler_sees_member(p_group uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_group_discipler(p_group) and exists (
    select 1 from public.group_members m where m.group_id = p_group and m.user_id = p_user and m.status = 'active')
$$;
-- Lição da biblioteca: quem está (ou conduz) um grupo cuja trilha a inclui.
create function public.can_read_library_lesson(p_lesson uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.groups_enabled() and exists (
    select 1 from public.discipleship_groups g join public.track_days d on d.track_id = g.track_id
    where d.lesson_id = p_lesson and g.status <> 'archived'
      and (g.discipler_id = (select auth.uid())
           or exists (select 1 from public.group_members m
                      where m.group_id = g.id and m.user_id = (select auth.uid()) and m.status = 'active')))
$$;
revoke execute on function public.is_group_discipler(uuid), public.is_group_member(uuid),
  public.lesson_in_group_track(uuid, uuid), public.can_read_library_lesson(uuid),
  public.discipler_sees_member(uuid, uuid) from public, anon;
grant execute on function public.is_group_discipler(uuid), public.is_group_member(uuid),
  public.lesson_in_group_track(uuid, uuid), public.can_read_library_lesson(uuid),
  public.discipler_sees_member(uuid, uuid) to authenticated;

create policy lessons_read_library on public.lessons
  for select to authenticated
  using (kind = 'library' and status = 'published' and public.can_read_library_lesson(id));

-- Grupos: o discipulador, os membros ativos e o Admin.
create policy groups_read on public.discipleship_groups
  for select to authenticated
  using (public.is_admin() or public.is_group_discipler(id) or public.is_group_member(id));
create policy group_members_read on public.group_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_group_discipler(group_id) or public.is_admin());
create policy group_pauses_read on public.group_pauses
  for select to authenticated
  using (public.is_admin() or public.is_group_discipler(group_id) or public.is_group_member(group_id));
-- As notas do encontro são só do discipulador (e do Admin).
create policy group_meetings_read on public.group_meetings
  for select to authenticated
  using (public.is_admin() or public.is_group_discipler(group_id));

-- Progresso: o discípulo escreve o próprio (só em grupo e lição dele); o discipulador lê o do grupo.
create policy group_progress_read on public.group_progress
  for select to authenticated
  using (user_id = (select auth.uid()) or public.discipler_sees_member(group_id, user_id) or public.is_admin());
create policy group_progress_insert on public.group_progress
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_group_member(group_id) and public.lesson_in_group_track(group_id, lesson_id));
create policy group_progress_update on public.group_progress
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_group_member(group_id));

-- Reflexões: o dono lê tudo o que escreveu; o discipulador lê SÓ as compartilhadas do grupo dele.
create policy group_reflections_read on public.group_reflections
  for select to authenticated
  using (user_id = (select auth.uid()) or (shared and public.discipler_sees_member(group_id, user_id)));
create policy group_reflections_insert on public.group_reflections
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_group_member(group_id) and public.lesson_in_group_track(group_id, lesson_id));
create policy group_reflections_update on public.group_reflections
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_group_member(group_id));
create policy group_reflections_delete on public.group_reflections
  for delete to authenticated using (user_id = (select auth.uid()));

------------------------------------------------------------------------------
-- Ações sobre grupos (todas por função, com conferência de quem chama)
------------------------------------------------------------------------------
create function public.create_group(
  p_name text, p_track uuid, p_start date, p_weekdays int[], p_hour int, p_meeting_weekday int
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_code text;
begin
  if not public.is_discipler() then
    raise exception 'Só um discipulador pode criar grupos.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tracks where id = p_track and status = 'published') then
    raise exception 'Escolha uma trilha publicada.' using errcode = 'P0001';
  end if;
  loop
    v_code := 'G-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.discipleship_groups where invite_code = v_code);
  end loop;
  insert into public.discipleship_groups (name, discipler_id, track_id, start_date, active_weekdays, release_hour, meeting_weekday, invite_code)
  values (btrim(p_name), (select auth.uid()), p_track, p_start,
          coalesce(p_weekdays, '{1,2,3,4,5,6}'), coalesce(p_hour, 6), p_meeting_weekday, v_code)
  returning id into v_id;
  return v_id;
end
$$;

-- O discípulo entra pelo código do convite e aceita o consentimento do grupo (RG-08).
create function public.join_group(p_code text, p_consent_version text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_group public.discipleship_groups;
begin
  if v_uid is null or not public.groups_enabled() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  select * into v_group from public.discipleship_groups where invite_code = upper(btrim(p_code)) and status = 'active';
  if not found then
    raise exception 'Convite não encontrado ou grupo encerrado.' using errcode = 'P0002';
  end if;
  if v_group.discipler_id = v_uid then
    raise exception 'Você conduz este grupo.' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_consent_version), '') = '' then
    raise exception 'É preciso aceitar o consentimento do grupo.' using errcode = 'P0001';
  end if;
  insert into public.group_members (group_id, user_id, consent_version)
  values (v_group.id, v_uid, p_consent_version)
  on conflict (group_id, user_id) do update
    set status = 'active', left_at = null, joined_at = now(), consent_version = excluded.consent_version;
  return v_group.id;
end
$$;

-- Sair do grupo: o discipulador perde o acesso aos dados de leitura e às reflexões da pessoa (RG-08).
create function public.leave_group(p_group uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.group_members set status = 'left', left_at = now()
  where group_id = p_group and user_id = (select auth.uid()) and status = 'active';
  update public.group_reflections set shared = false where group_id = p_group and user_id = (select auth.uid());
end
$$;

create function public.set_group_status(p_group uuid, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_status not in ('active', 'completed', 'archived') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  if not (public.is_group_discipler(p_group) or public.is_admin()) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  update public.discipleship_groups set status = p_status where id = p_group;
end
$$;

create function public.add_group_pause(p_group uuid, p_from date, p_until date)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.is_group_discipler(p_group) or public.is_admin()) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if p_until < p_from then
    raise exception 'O fim da pausa não pode ser antes do começo.' using errcode = 'P0001';
  end if;
  insert into public.group_pauses (group_id, from_date, until_date) values (p_group, p_from, p_until);
end
$$;

create function public.remove_group_pause(p_pause uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_group uuid;
begin
  select group_id into v_group from public.group_pauses where id = p_pause;
  if v_group is null or not (public.is_group_discipler(v_group) or public.is_admin()) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  delete from public.group_pauses where id = p_pause;
end
$$;

-- Registra (ou corrige) o encontro de um dia: notas e presença. Só entram como presentes os membros ativos.
create function public.save_group_meeting(p_group uuid, p_date date, p_notes text, p_attendees uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not (public.is_group_discipler(p_group) or public.is_admin()) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  insert into public.group_meetings (group_id, meeting_date, notes, attendees)
  values (p_group, p_date, coalesce(p_notes, ''), coalesce((
    select array_agg(m.user_id) from public.group_members m
    where m.group_id = p_group and m.status = 'active' and m.user_id = any (coalesce(p_attendees, '{}'))), '{}'))
  on conflict (group_id, meeting_date) do update set notes = excluded.notes, attendees = excluded.attendees;
end
$$;

-- O Admin passa um grupo para outro discipulador (ou atribui um grupo que ficou sem discipulador).
create function public.admin_transfer_group(p_group uuid, p_new_discipler uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_new_discipler and (is_discipler or role = 'admin')) then
    raise exception 'Escolha uma pessoa marcada como discipulador.' using errcode = 'P0001';
  end if;
  update public.discipleship_groups set discipler_id = p_new_discipler where id = p_group;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'group_transferred', 'group', p_group::text, jsonb_build_object('to', p_new_discipler));
end
$$;

revoke execute on function public.create_group(text, uuid, date, int[], int, int),
  public.join_group(text, text), public.leave_group(uuid), public.set_group_status(uuid, text),
  public.add_group_pause(uuid, date, date), public.remove_group_pause(uuid),
  public.save_group_meeting(uuid, date, text, uuid[]), public.admin_transfer_group(uuid, uuid) from public, anon;
grant execute on function public.create_group(text, uuid, date, int[], int, int),
  public.join_group(text, text), public.leave_group(uuid), public.set_group_status(uuid, text),
  public.add_group_pause(uuid, date, date), public.remove_group_pause(uuid),
  public.save_group_meeting(uuid, date, text, uuid[]), public.admin_transfer_group(uuid, uuid) to authenticated;

------------------------------------------------------------------------------
-- Pedidos de ajuda pastoral (RG-09, RG-10)
------------------------------------------------------------------------------
create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid references public.discipleship_groups (id) on delete set null,
  lesson_id uuid references public.lessons (id) on delete set null,
  topic text not null default '' check (char_length(topic) <= 120),
  message text not null check (char_length(btrim(message)) between 1 and 3000),
  -- 'discipler': vai primeiro ao discipulador. 'pastoral': direto à equipe pastoral, com prioridade.
  destination text not null check (destination in ('discipler', 'pastoral')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'answered', 'closed')),
  assignee_id uuid references public.profiles (id) on delete set null,
  escalated_at timestamptz,
  handled_note text not null default '' check (char_length(handled_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (destination = 'pastoral' or group_id is not null)
);
create index help_requests_status_idx on public.help_requests (status, created_at);
alter table public.help_requests enable row level security;
revoke all on public.help_requests from anon, authenticated;
grant select on public.help_requests to authenticated; -- gravar só por funções

-- Direto à equipe pastoral: nem o discipulador vê (o pedido pode ser sobre ele).
create policy help_requests_read on public.help_requests
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (destination = 'discipler' and group_id is not null and public.is_group_discipler(group_id))
    or (public.is_admin() and (destination = 'pastoral' or escalated_at is not null))
  );

create function public.request_help(p_group uuid, p_lesson uuid, p_topic text, p_message text, p_destination text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null or not public.groups_enabled() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if p_destination not in ('discipler', 'pastoral') then
    raise exception 'Destino inválido.' using errcode = '22023';
  end if;
  if p_destination = 'discipler' and not public.is_group_member(p_group) then
    raise exception 'Você precisa estar no grupo para pedir ajuda ao discipulador.' using errcode = '42501';
  end if;
  if p_destination = 'pastoral' and p_group is not null and not public.is_group_member(p_group) then
    p_group := null;
  end if;
  insert into public.help_requests (user_id, group_id, lesson_id, topic, message, destination)
  values ((select auth.uid()), p_group, p_lesson, left(coalesce(p_topic, ''), 120), p_message, p_destination)
  returning id into v_id;
  return v_id;
end
$$;

create function public.handle_help_request(p_id uuid, p_status text, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.help_requests;
  v_admin boolean := public.is_admin();
begin
  if p_status not in ('open', 'in_progress', 'answered', 'closed') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  select * into v_req from public.help_requests where id = p_id;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  -- Discipulador atende o que é do grupo dele e ainda não foi escalado; a equipe pastoral atende o resto.
  if not (
    (v_req.destination = 'discipler' and v_req.escalated_at is null and v_req.group_id is not null and public.is_group_discipler(v_req.group_id))
    or (v_admin and (v_req.destination = 'pastoral' or v_req.escalated_at is not null))
  ) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  update public.help_requests
  set status = p_status, handled_note = left(coalesce(p_note, ''), 1000), updated_at = now(),
      assignee_id = coalesce(assignee_id, (select auth.uid()))
  where id = p_id;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'help_request_updated', 'help_request', p_id::text, jsonb_build_object('status', p_status));
end
$$;

-- O discipulador escala o pedido à equipe pastoral com um botão (RG-10).
create function public.escalate_help_request(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_req public.help_requests;
begin
  select * into v_req from public.help_requests where id = p_id;
  if not found or v_req.destination <> 'discipler' or v_req.group_id is null or not public.is_group_discipler(v_req.group_id) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if v_req.escalated_at is not null then
    return;
  end if;
  update public.help_requests set escalated_at = now(), status = 'open', updated_at = now() where id = p_id;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'help_request_escalated', 'help_request', p_id::text, '{}'::jsonb);
end
$$;

revoke execute on function public.request_help(uuid, uuid, text, text, text),
  public.handle_help_request(uuid, text, text), public.escalate_help_request(uuid) from public, anon;
grant execute on function public.request_help(uuid, uuid, text, text, text),
  public.handle_help_request(uuid, text, text), public.escalate_help_request(uuid) to authenticated;
