-- 0001 Base: perfis, papéis, consentimentos, versões da Bíblia e log de auditoria.
-- RLS habilitado em todas as tabelas desde o início (regra 0.4 do handoff).
-- Convenção: identificadores em inglês; interface e conteúdo em português.

------------------------------------------------------------------------------
-- Tipos
------------------------------------------------------------------------------
create type public.user_role as enum ('member', 'caregiver', 'editor', 'admin');
create type public.profile_status as enum ('active', 'inactive');
create type public.consent_purpose as enum ('data_processing', 'email_reminders', 'whatsapp_reminders');

------------------------------------------------------------------------------
-- Configuração interna (somente service role / SQL Editor; nenhuma policy)
------------------------------------------------------------------------------
create table public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

------------------------------------------------------------------------------
-- Versões da Bíblia (NVI e NTLH). Só metadados: nunca o texto (regra 0.4.1).
------------------------------------------------------------------------------
create table public.bible_versions (
  code text primary key,
  name text not null,
  rights_holder text,
  copyright_notice text,
  -- Modelo de URL do leitor externo; {query} vira a referência (ex.: "João 3.16").
  external_reader_url text,
  active boolean not null default true
);
alter table public.bible_versions enable row level security;
revoke all on public.bible_versions from anon, authenticated;
grant select on public.bible_versions to authenticated;
create policy bible_versions_read on public.bible_versions
  for select to authenticated using (active);

-- Titulares dos direitos ficam em branco até a licença ser confirmada por escrito.
insert into public.bible_versions (code, name, external_reader_url) values
  ('NTLH', 'Nova Tradução na Linguagem de Hoje',
   'https://www.biblegateway.com/passage/?search={query}&version=NTLH'),
  ('NVI', 'Nova Versão Internacional',
   'https://www.biblegateway.com/passage/?search={query}&version=NVI-PT');

------------------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  email text not null,
  photo_url text,
  whatsapp text,
  bible_version text not null default 'NTLH' references public.bible_versions (code),
  role public.user_role not null default 'member',
  status public.profile_status not null default 'active',
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Funções auxiliares de papel. SECURITY DEFINER para não recursar na RLS de profiles.
create function public.current_user_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create function public.is_editor_or_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('editor', 'admin'), false)
$$;

-- O membro só edita campos do próprio perfil. Papel e status mudam apenas por função.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, whatsapp, bible_version, photo_url, onboarded_at)
  on public.profiles to authenticated;

create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

------------------------------------------------------------------------------
-- Auditoria (somente inserção)
------------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  -- Não gravar dados pessoais aqui (ex.: e-mail). Só identificadores e valores técnicos.
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
create policy audit_log_admin_read on public.audit_log
  for select to authenticated using (public.is_admin());

-- Bloqueia UPDATE/DELETE, exceto anonimizar actor_id (exclusão de conta, ON DELETE SET NULL).
create function public.audit_log_append_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.actor_id is null and old.actor_id is not null
     and (new.id, new.action, new.entity, new.entity_id, new.details, new.created_at)
         is not distinct from
         (old.id, old.action, old.entity, old.entity_id, old.details, old.created_at)
  then
    return new;
  end if;
  raise exception 'audit_log é somente inserção' using errcode = '42501';
end
$$;
create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.audit_log_append_only();

------------------------------------------------------------------------------
-- Criação automática do perfil no primeiro login (Google)
------------------------------------------------------------------------------
-- O primeiro Admin é definido por e-mail em app_config ('initial_admin_email'),
-- ANTES do primeiro login. Ver docs/RUNBOOK.md.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  initial_admin text;
  assigned public.user_role := 'member';
begin
  select value into initial_admin from public.app_config where key = 'initial_admin_email';

  if initial_admin is not null
     and new.email is not null
     and new.email_confirmed_at is not null
     and lower(new.email) = lower(initial_admin)
  then
    assigned := 'admin';
  end if;

  insert into public.profiles (id, display_name, email, photo_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    assigned
  );

  if assigned = 'admin' then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values (new.id, 'initial_admin_assigned', 'profile', new.id::text, '{}'::jsonb);
  end if;

  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------------------
-- Promoção de perfil (somente Admin; sempre auditada)
------------------------------------------------------------------------------
create function public.admin_set_role(target uuid, new_role public.user_role)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  old_role public.user_role;
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;

  select role into old_role from public.profiles where id = target for update;
  if old_role is null then
    raise exception 'perfil não encontrado' using errcode = 'P0002';
  end if;

  if old_role = 'admin' and new_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1
  then
    raise exception 'não é possível remover o último administrador' using errcode = 'P0001';
  end if;

  update public.profiles set role = new_role where id = target;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (
    (select auth.uid()), 'role_changed', 'profile', target::text,
    jsonb_build_object('from', old_role, 'to', new_role)
  );
end
$$;
revoke execute on function public.admin_set_role(uuid, public.user_role) from public, anon;
grant execute on function public.admin_set_role(uuid, public.user_role) to authenticated;

------------------------------------------------------------------------------
-- Consentimentos (LGPD): um aceite por finalidade, com data e versão do termo
------------------------------------------------------------------------------
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  purpose public.consent_purpose not null,
  term_version text not null,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index consents_one_active_per_purpose
  on public.consents (user_id, purpose, term_version) where revoked_at is null;
alter table public.consents enable row level security;

revoke all on public.consents from anon, authenticated;
grant select on public.consents to authenticated;
-- accepted_at fica de fora do INSERT: sempre now(); não dá para retroagir o aceite.
grant insert (user_id, purpose, term_version) on public.consents to authenticated;
grant update (revoked_at) on public.consents to authenticated;

create policy consents_select_own_or_admin on public.consents
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy consents_insert_own on public.consents
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy consents_revoke_own on public.consents
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
