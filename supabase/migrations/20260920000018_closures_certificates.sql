-- 0018 Encerramentos presenciais e certificados (RF-18, RF-19, RN-05, RN-06).
--
-- O encerramento NÃO bloqueia o ciclo seguinte (RN-05): é só um marco. O certificado (RN-06) sai quando o
-- ciclo está concluído E a presença no encerramento foi confirmada pelo Admin. Cada certificado tem um
-- código único, que qualquer pessoa pode conferir na página pública de verificação (sem login).

------------------------------------------------------------------------------
-- Eventos de encerramento
------------------------------------------------------------------------------
create table public.closure_events (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null default '' check (char_length(kind) <= 60),
  starts_at timestamptz not null,
  location text not null default '' check (char_length(location) <= 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index closure_events_cycle_idx on public.closure_events (cycle_id, starts_at);
alter table public.closure_events enable row level security;

revoke all on public.closure_events from anon, authenticated;
grant select, insert, update, delete on public.closure_events to authenticated;
-- Data e local não são segredo: quem está logado vê os eventos (com o recurso ligado); o Admin sempre.
create policy closure_events_read on public.closure_events
  for select to authenticated
  using (public.is_admin() or public.feature_enabled('feature.closures'));
create policy closure_events_admin_insert on public.closure_events
  for insert to authenticated with check (public.is_admin());
create policy closure_events_admin_update on public.closure_events
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy closure_events_admin_delete on public.closure_events
  for delete to authenticated using (public.is_admin());

create function public.closure_events_stamp()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  end if;
  return new;
end
$$;
revoke execute on function public.closure_events_stamp() from public, anon, authenticated;
create trigger closure_events_stamp before insert on public.closure_events
  for each row execute function public.closure_events_stamp();

------------------------------------------------------------------------------
-- Presença
------------------------------------------------------------------------------
create table public.closure_attendance (
  event_id uuid not null references public.closure_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  present boolean not null,
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.closure_attendance enable row level security;
revoke all on public.closure_attendance from anon, authenticated;
grant select on public.closure_attendance to authenticated; -- gravar só por save_attendance()
create policy closure_attendance_read on public.closure_attendance
  for select to authenticated
  using (public.is_admin() or (user_id = (select auth.uid()) and public.feature_enabled('feature.closures')));

-- O Admin confirma a presença (e a ausência) de várias pessoas de uma vez.
create function public.save_attendance(p_event uuid, p_present uuid[], p_absent uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.closure_events where id = p_event) then
    raise exception 'Encerramento não encontrado.' using errcode = 'P0002';
  end if;
  if coalesce(p_present, '{}') && coalesce(p_absent, '{}') then
    raise exception 'A mesma pessoa não pode estar presente e ausente.' using errcode = 'P0001';
  end if;

  insert into public.closure_attendance (event_id, user_id, present, confirmed_by)
  select p_event, u, true, (select auth.uid()) from unnest(coalesce(p_present, '{}')) u
  where exists (select 1 from public.profiles p where p.id = u)
  on conflict (event_id, user_id) do update
    set present = true, confirmed_by = excluded.confirmed_by, confirmed_at = now();
  insert into public.closure_attendance (event_id, user_id, present, confirmed_by)
  select p_event, u, false, (select auth.uid()) from unnest(coalesce(p_absent, '{}')) u
  where exists (select 1 from public.profiles p where p.id = u)
  on conflict (event_id, user_id) do update
    set present = false, confirmed_by = excluded.confirmed_by, confirmed_at = now();

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'closure_attendance_saved', 'closure_event', p_event::text,
          jsonb_build_object('present', cardinality(coalesce(p_present, '{}')), 'absent', cardinality(coalesce(p_absent, '{}'))));
end
$$;
revoke execute on function public.save_attendance(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.save_attendance(uuid, uuid[], uuid[]) to authenticated;

------------------------------------------------------------------------------
-- Certificados
------------------------------------------------------------------------------
create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  cycle_id uuid not null references public.cycles (id) on delete restrict,
  event_id uuid references public.closure_events (id) on delete set null,
  -- O nome fica gravado como estava no dia: renomear o perfil depois não muda um certificado emitido.
  holder_name text not null check (char_length(btrim(holder_name)) > 0),
  code text not null unique check (code ~ '^VC-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$'),
  issued_at timestamptz not null default now(),
  issued_by uuid references public.profiles (id) on delete set null,
  unique (user_id, cycle_id)
);
alter table public.certificates enable row level security;
revoke all on public.certificates from anon, authenticated;
grant select on public.certificates to authenticated; -- emitir só por issue_certificates()
create policy certificates_read on public.certificates
  for select to authenticated
  using (public.is_admin() or user_id = (select auth.uid()));

-- Emite os certificados de um encerramento: quem tem presença confirmada E concluiu o ciclo (RN-06).
create function public.issue_certificates(p_event uuid)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_cycle uuid;
  v_user uuid;
  v_name text;
  v_code text;
  v_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if not public.feature_enabled('feature.certificates') then
    raise exception 'O recurso Certificados não está ligado.' using errcode = 'P0001';
  end if;
  select cycle_id into v_cycle from public.closure_events where id = p_event;
  if v_cycle is null then
    raise exception 'Encerramento não encontrado.' using errcode = 'P0002';
  end if;

  for v_user, v_name in
    select a.user_id, p.display_name
    from public.closure_attendance a
    join public.profiles p on p.id = a.user_id
    join public.cycle_progress cp on cp.user_id = a.user_id and cp.cycle_id = v_cycle and cp.status = 'completed'
    where a.event_id = p_event and a.present
      and not exists (select 1 from public.certificates c where c.user_id = a.user_id and c.cycle_id = v_cycle)
    order by p.display_name, a.user_id
  loop
    loop
      v_code := 'VC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
             || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
             || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
      exit when not exists (select 1 from public.certificates where code = v_code);
    end loop;
    insert into public.certificates (user_id, cycle_id, event_id, holder_name, code, issued_by)
    values (v_user, v_cycle, p_event, coalesce(nullif(btrim(v_name), ''), 'Membro'), v_code, (select auth.uid()));
    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values ((select auth.uid()), 'certificates_issued', 'closure_event', p_event::text, jsonb_build_object('count', v_count));
  end if;
  return v_count;
end
$$;
revoke execute on function public.issue_certificates(uuid) from public, anon;
grant execute on function public.issue_certificates(uuid) to authenticated;

-- Página pública de verificação: quem tem o código confere nome, ciclo e data. Nada além disso.
create function public.verify_certificate(p_code text)
returns table (holder_name text, cycle_title text, issued_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select c.holder_name, cy.title, c.issued_at
  from public.certificates c join public.cycles cy on cy.id = c.cycle_id
  where c.code = upper(btrim(p_code))
$$;
revoke execute on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;

------------------------------------------------------------------------------
-- Aviso por e-mail quando o certificado é emitido (seção 10)
------------------------------------------------------------------------------
alter table public.email_templates drop constraint email_templates_kind_check;
alter table public.email_templates add constraint email_templates_kind_check check (kind in (
  'welcome', 'new_lesson', 'nudge_3d', 'nudge_7d', 'stalled_alert', 'cycle_completed', 'weekly_summary', 'certificate'
));
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'welcome', 'new_lesson', 'nudge_3d', 'nudge_7d', 'stalled_alert', 'cycle_completed', 'weekly_summary', 'certificate'
));
insert into public.email_templates (kind, subject, body) values
  ('certificate',
   'Seu certificado está pronto, {{nome}}',
   E'Olá, {{nome}}!\n\nSeu certificado do ciclo "{{ciclo}}" já está disponível. Foi uma alegria caminhar com você nesta etapa.\n\nBaixe o certificado em PDF aqui:\n{{link}}\n\nQue Deus continue conduzindo os seus passos.');

-- Certificados emitidos nos últimos 7 dias de quem aceitou e-mails: entrada do planejador de lembretes.
create function public.cron_certificates(p_secret text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.check_cron_secret(p_secret);
  if not public.feature_enabled('feature.reminders') then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', c.user_id, 'cycle_title', cy.title, 'code', c.code, 'issued_at', c.issued_at))
    from public.certificates c join public.cycles cy on cy.id = c.cycle_id
    where c.issued_at > now() - interval '7 days'
      and exists (select 1 from public.consents k
                  where k.user_id = c.user_id and k.purpose = 'email_reminders' and k.revoked_at is null)
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.cron_certificates(text) from public;
grant execute on function public.cron_certificates(text) to anon, authenticated;
