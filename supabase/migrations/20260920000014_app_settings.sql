-- 0014 Configurações da igreja e chaves liga/desliga dos recursos (RF-28).
--
-- Os recursos das fases seguintes (quiz, lembretes, cuidadores, certificados, grupos...) nascem DESLIGADOS.
-- O Admin liga cada um quando quiser, para o piloto poder começar só com o MVP.
-- Leitura: qualquer pessoa logada (não há segredo aqui). Escrita: só o Admin.

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

revoke all on public.app_settings from anon, authenticated;
grant select, insert, update on public.app_settings to authenticated;

create policy app_settings_read on public.app_settings
  for select to authenticated using (true);
create policy app_settings_admin_insert on public.app_settings
  for insert to authenticated with check (public.is_admin());
create policy app_settings_admin_update on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Só chaves conhecidas: evita lixo e erro de digitação vindo do navegador.
alter table public.app_settings add constraint app_settings_known_keys check (
  key in (
    'church.name', 'church.contact_email',
    'feature.quiz', 'feature.reflections', 'feature.video', 'feature.reminders', 'feature.caregivers',
    'feature.closures', 'feature.certificates', 'feature.groups', 'feature.gamification', 'feature.email_login'
  )
);
-- Recursos são sempre verdadeiro/falso; os textos da igreja, sempre texto.
alter table public.app_settings add constraint app_settings_value_types check (
  (key like 'feature.%' and jsonb_typeof(value) = 'boolean')
  or (key like 'church.%' and jsonb_typeof(value) = 'string')
);

create function public.app_settings_stamp()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end
$$;

create function public.audit_app_setting()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.value is distinct from old.value then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values ((select auth.uid()), 'setting_changed', 'setting', new.key,
            jsonb_build_object('key', new.key, 'value', new.value));
  end if;
  return new;
end
$$;

revoke execute on function public.app_settings_stamp(), public.audit_app_setting() from public, anon, authenticated;

create trigger app_settings_stamp before insert or update on public.app_settings
  for each row execute function public.app_settings_stamp();
create trigger app_settings_audit after insert or update on public.app_settings
  for each row execute function public.audit_app_setting();

-- Padrões: tudo desligado, exceto o nome da igreja. (Inserção como dono do banco: sem autor.)
insert into public.app_settings (key, value) values
  ('church.name', '"Vertical Church"'),
  ('church.contact_email', '""'),
  ('feature.quiz', 'false'),
  ('feature.reflections', 'false'),
  ('feature.video', 'false'),
  ('feature.reminders', 'false'),
  ('feature.caregivers', 'false'),
  ('feature.closures', 'false'),
  ('feature.certificates', 'false'),
  ('feature.groups', 'false'),
  ('feature.gamification', 'false'),
  ('feature.email_login', 'false');
