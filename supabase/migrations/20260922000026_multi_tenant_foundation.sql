-- 0026 FASE 1 do banco único multi-igreja (docs/EXPANSAO.md): tabela `churches`, `church_id` em cada tabela,
-- isolamento por RLS, entrada por convite, e o papel de Super Admin (o operador, acima de todas as igrejas).
-- Decisão: um banco Postgres só, um domínio só, administrado pelo operador; cada igreja separada por
-- `church_id`, nunca por infraestrutura.
--
-- IMPORTANTE — leia antes de mexer aqui: esta migração fecha o isolamento das CONSULTAS DIRETAS (o que o app
-- faz com `supabase.from(...)`), via uma política RESTRITIVA (`as restrictive`) em cada tabela. Uma restritiva
-- é somada (E lógico) a QUALQUER política permissiva existente, sem precisar reescrever nenhuma delas.
--
-- O QUE ESTA MIGRAÇÃO **NÃO** FECHA: as ~80 funções `security definer` do banco (save_lesson, admin_set_role,
-- submit_feedback, os `cron_*`, etc.) RODAM COMO DONAS DAS TABELAS E IGNORAM TODA RLS, restritiva inclusive —
-- confirmado por teste direto (não é suposição). Cada uma delas precisa de uma checagem de `church_id` escrita
-- à mão no corpo, do mesmo jeito que hoje cada uma já confere `is_admin()`. Isso é a FASE 2 (docs/EXPANSAO.md),
-- feita função por função, em sessões seguintes. Até lá, uma função de escrita pode, em teoria, alcançar o dado
-- de outra igreja se alguém souber o UUID interno certo (nenhuma tela do app expõe esse UUID hoje). O teste
-- `tests/db/multi-tenant-checklist.test.ts` lista exatamente quais funções ainda faltam — e a FASE 2 também
-- precisa incluir o Super Admin em cada uma delas.

------------------------------------------------------------------------------
-- 0. Super Admin: o operador da plataforma, independente de qualquer igreja. Três níveis, do mais amplo ao
--    mais restrito: Super Admin (todas as igrejas, lê e escreve) > Admin local (a própria igreja) >
--    Editor/Cuidador/Membro (dentro da própria igreja, como já era). Tabela pequena, sem church_id (é, de
--    propósito, a única exceção de verdade global do banco), sem nenhuma policy: só o SQL Editor do operador
--    grava aqui.
--
--    IMPORTANTE ao promover alguém: só inserir em platform_admins NÃO BASTA. As políticas PERMISSIVAS de
--    cada tabela (de antes desta migração) só sabem checar is_admin() — nunca souberam de outras igrejas,
--    então nunca souberam de church_id. A política RESTRITIVA nova (church_id = current_church_id() OR
--    is_super_admin()) só ESTREITA o que a permissiva já deixa passar; nunca alarga sozinha. Por isso quem
--    vira Super Admin também precisa de role = 'admin' no próprio perfil — aí is_admin() libera a permissiva
--    (em qualquer igreja, já que is_admin() nunca checou church_id) e is_super_admin() libera a restritiva.
--    Confirmado por teste direto em tests/db/multi-tenant.test.ts.
------------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
$$;
revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

------------------------------------------------------------------------------
-- 1. A tabela `churches`
------------------------------------------------------------------------------
create type public.church_status as enum ('trial', 'active', 'suspended', 'canceled');

create table public.churches (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$'),
  name text not null check (char_length(name) between 2 and 80),
  contact_email text not null default '' check (char_length(contact_email) <= 254),
  status public.church_status not null default 'trial',
  -- Código de convite para membros entrarem (mesmo padrão de discipleship_groups.invite_code): opaco, não é o
  -- slug (o slug pode ser público/adivinhável; o convite não).
  invite_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.churches enable row level security;
revoke all on public.churches from anon, authenticated;
-- Sem policy de listagem: nenhuma tela precisa ver outras igrejas. Quem lista é o dono do banco (SQL Editor
-- do operador). As políticas de leitura/edição da PRÓPRIA igreja (churches_own_read/churches_admin_update)
-- ficam lá na frente (seção 3b): dependem de current_church_id(), que só existe depois de profiles ganhar
-- church_id.

create function public.churches_stamp()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
revoke execute on function public.churches_stamp() from public, anon, authenticated;
create trigger churches_stamp before update on public.churches
  for each row execute function public.churches_stamp();

------------------------------------------------------------------------------
-- 2. Seed: a Vertical Church (o que já existe hoje) vira a primeira linha de `churches`.
--    O nome e o contato, se já configurados em app_settings, são aproveitados; senão, um padrão.
------------------------------------------------------------------------------
do $$
declare
  v_name text;
  v_contact text;
begin
  select coalesce(nullif(value #>> '{}', ''), 'Vertical Church') into v_name
    from public.app_settings where key = 'church.name';
  select coalesce(value #>> '{}', '') into v_contact
    from public.app_settings where key = 'church.contact_email';

  insert into public.churches (slug, name, contact_email, status)
  values ('vertical-church', coalesce(v_name, 'Vertical Church'), coalesce(v_contact, ''), 'active');
end
$$;

------------------------------------------------------------------------------
-- 3. `profiles`: caso especial. `church_id` fica OPCIONAL (nulo até a pessoa entrar por um convite ou ser
--    reconhecida como administradora pendente — ver seção 8). A política restritiva libera sempre a PRÓPRIA
--    linha (por id), mesmo sem igreja ainda, para o primeiro acesso funcionar; as linhas de outras pessoas só
--    aparecem quando a igreja bate, ou para o Super Admin.
------------------------------------------------------------------------------
alter table public.profiles add column church_id uuid references public.churches (id) on delete cascade;
update public.profiles set church_id = (select id from public.churches where slug = 'vertical-church');

-- A igreja da pessoa logada. SECURITY DEFINER: lê profiles sem depender da própria RLS de profiles (evita
-- recursão) — o mesmo padrão já usado por current_user_role()/is_admin() desde a migração 0001. Fica depois de
-- profiles ganhar a coluna church_id: funções `language sql` são checadas contra o schema já na criação.
create function public.current_church_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select church_id from public.profiles where id = (select auth.uid())
$$;
revoke execute on function public.current_church_id() from public, anon;
grant execute on function public.current_church_id() to authenticated;

create policy profiles_tenant_isolation on public.profiles as restrictive for all to authenticated
  using (id = (select auth.uid()) or church_id = public.current_church_id() or public.is_super_admin())
  with check (id = (select auth.uid()) or church_id = public.current_church_id() or public.is_super_admin());

------------------------------------------------------------------------------
-- 3b. `churches`: agora que current_church_id() existe, cada um lê e edita a PRÓPRIA igreja. Nome e contato
--     não são segredo — public_identity() (seção 10) já expõe isso a quem nem tem login; loadSettings() usa
--     em certificado, exportação e e-mails, não só na tela do Admin — por isso a leitura é de qualquer pessoa
--     da igreja, não só do Admin. Só o Admin EDITA (Administração > Configurações; antes vinha de
--     app_settings, seção 6).
------------------------------------------------------------------------------
grant select (id, name, contact_email), update (name, contact_email) on public.churches to authenticated;
create policy churches_own_read on public.churches for select to authenticated
  using (id = public.current_church_id());
create policy churches_admin_update on public.churches for update to authenticated
  using (id = public.current_church_id() and public.is_admin())
  with check (id = public.current_church_id() and public.is_admin());

------------------------------------------------------------------------------
-- 4. As 28 tabelas "comuns": ganham `church_id` obrigatório e a mesma política restritiva, sem exceção. Um
--    laço só, para não arriscar 28 blocos copiados à mão com um nome de tabela errado em algum deles.
------------------------------------------------------------------------------
do $$
declare
  t text;
  seed_id uuid := (select id from public.churches where slug = 'vertical-church');
  tables text[] := array[
    'consents', 'lesson_versions', 'lesson_internal_notes', 'quiz_questions',
    'lesson_progress', 'cycle_progress', 'quiz_attempts', 'reflections',
    'care_assignments', 'care_notes', 'care_alerts',
    'email_templates', 'notifications', 'email_unsubscribe_tokens',
    'closure_events', 'closure_attendance', 'certificates',
    'tracks', 'track_days', 'discipleship_groups', 'group_members', 'group_pauses',
    'group_meetings', 'group_progress', 'group_reflections', 'help_requests',
    'feedback_responses'
  ];
begin
  foreach t in array tables loop
    -- `default current_church_id()`: sem isso, todo INSERT do app (que hoje não manda church_id, coluna nova)
    -- quebraria por not-null. O default cobre o caminho normal (quem grava já está numa igreja); a política
    -- restritiva abaixo garante que ninguém consegue, mesmo assim, gravar um church_id que não seja o seu.
    execute format('alter table public.%I add column church_id uuid references public.churches (id) on delete cascade default public.current_church_id()', t);
    -- Desliga os gatilhos do dono da tabela (ex.: email_templates_stamp grava em audit_log a cada UPDATE) só
    -- para este preenchimento: sem isso, o backfill vira um monte de "email_template_updated" (e outros
    -- eventos) datados da migração, sem autor — poluindo o histórico de quem mudou o quê.
    execute format('alter table public.%I disable trigger user', t);
    execute format('update public.%I set church_id = %L', t, seed_id);
    execute format('alter table public.%I enable trigger user', t);
    execute format('alter table public.%I alter column church_id set not null', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (church_id = public.current_church_id() or public.is_super_admin()) with check (church_id = public.current_church_id() or public.is_super_admin())',
      t || '_tenant_isolation', t
    );
  end loop;
end
$$;

------------------------------------------------------------------------------
-- audit_log fica fora do laço acima: o gatilho "só insere" (migração 0001) recusaria o UPDATE de preenchimento
-- do church_id das linhas antigas. Desligado só durante esta migração (dono do banco), religado no fim.
------------------------------------------------------------------------------
alter table public.audit_log disable trigger audit_log_append_only;
alter table public.audit_log add column church_id uuid references public.churches (id) on delete cascade default public.current_church_id();
update public.audit_log set church_id = (select id from public.churches where slug = 'vertical-church');
alter table public.audit_log alter column church_id set not null;
alter table public.audit_log enable trigger audit_log_append_only;
create policy audit_log_tenant_isolation on public.audit_log as restrictive for all to authenticated
  using (church_id = public.current_church_id() or public.is_super_admin())
  with check (church_id = public.current_church_id() or public.is_super_admin());

------------------------------------------------------------------------------
-- 5. `cycles`, `lessons`, `church_pages`: além do church_id (uniforme, como acima), o `slug` deixa de ser único
--    no banco inteiro e passa a ser único POR IGREJA — cada igreja tem o seu próprio "c1", "c1-l01", "vision"...
------------------------------------------------------------------------------
do $$
declare
  seed_id uuid := (select id from public.churches where slug = 'vertical-church');
begin
  -- cycles
  alter table public.cycles add column church_id uuid references public.churches (id) on delete cascade default public.current_church_id();
  alter table public.cycles disable trigger user;
  update public.cycles set church_id = seed_id;
  alter table public.cycles enable trigger user;
  alter table public.cycles alter column church_id set not null;
  alter table public.cycles drop constraint cycles_slug_key;
  alter table public.cycles add constraint cycles_church_slug_key unique (church_id, slug);
  create policy cycles_tenant_isolation on public.cycles as restrictive for all to authenticated
    using (church_id = public.current_church_id() or public.is_super_admin())
    with check (church_id = public.current_church_id() or public.is_super_admin());

  -- lessons
  alter table public.lessons add column church_id uuid references public.churches (id) on delete cascade default public.current_church_id();
  alter table public.lessons disable trigger user;
  update public.lessons set church_id = seed_id;
  alter table public.lessons enable trigger user;
  alter table public.lessons alter column church_id set not null;
  alter table public.lessons drop constraint lessons_slug_key;
  alter table public.lessons add constraint lessons_church_slug_key unique (church_id, slug);
  create policy lessons_tenant_isolation on public.lessons as restrictive for all to authenticated
    using (church_id = public.current_church_id() or public.is_super_admin())
    with check (church_id = public.current_church_id() or public.is_super_admin());

  -- church_pages: "slug" era a própria chave primária (não uma unique à parte); vira (church_id, slug).
  alter table public.church_pages add column church_id uuid references public.churches (id) on delete cascade default public.current_church_id();
  alter table public.church_pages disable trigger user;
  update public.church_pages set church_id = seed_id;
  alter table public.church_pages enable trigger user;
  alter table public.church_pages alter column church_id set not null;
  alter table public.church_pages drop constraint church_pages_pkey;
  alter table public.church_pages add primary key (church_id, slug);
  create policy church_pages_tenant_isolation on public.church_pages as restrictive for all to authenticated
    using (church_id = public.current_church_id() or public.is_super_admin())
    with check (church_id = public.current_church_id() or public.is_super_admin());
end
$$;

------------------------------------------------------------------------------
-- 6. `app_settings`: o nome e o contato da igreja SAEM daqui (agora são colunas de `churches`, seção 1) — cada
--    linha de app_settings passa a ser só uma chave liga/desliga, por igreja. A chave primária passa a ser
--    (church_id, key).
------------------------------------------------------------------------------
alter table public.app_settings add column church_id uuid references public.churches (id) on delete cascade default public.current_church_id();
alter table public.app_settings disable trigger user;
update public.app_settings set church_id = (select id from public.churches where slug = 'vertical-church');
alter table public.app_settings enable trigger user;
alter table public.app_settings alter column church_id set not null;
delete from public.app_settings where key in ('church.name', 'church.contact_email');
alter table public.app_settings drop constraint app_settings_pkey;
alter table public.app_settings add primary key (church_id, key);
alter table public.app_settings drop constraint app_settings_known_keys;
alter table public.app_settings add constraint app_settings_known_keys check (
  key in (
    'feature.quiz', 'feature.reflections', 'feature.video', 'feature.reminders', 'feature.caregivers',
    'feature.closures', 'feature.certificates', 'feature.groups', 'feature.gamification', 'feature.email_login',
    'feature.feedback'
  )
);
alter table public.app_settings drop constraint app_settings_value_types;
alter table public.app_settings add constraint app_settings_value_types check (jsonb_typeof(value) = 'boolean');
create policy app_settings_tenant_isolation on public.app_settings as restrictive for all to authenticated
  using (church_id = public.current_church_id() or public.is_super_admin())
  with check (church_id = public.current_church_id() or public.is_super_admin());

------------------------------------------------------------------------------
-- 7. `church_brand` e `church_assets`: eram uma linha só (`id boolean`), porque só existia uma igreja. Agora são
--    uma linha POR igreja: a chave primária vira `church_id` (ou `(church_id, key)` para as imagens).
------------------------------------------------------------------------------
alter table public.church_brand add column church_id uuid references public.churches (id) on delete cascade default public.current_church_id();
alter table public.church_brand disable trigger user;
update public.church_brand set church_id = (select id from public.churches where slug = 'vertical-church');
alter table public.church_brand enable trigger user;
alter table public.church_brand drop constraint church_brand_pkey;
alter table public.church_brand alter column church_id set not null;
alter table public.church_brand add primary key (church_id);
alter table public.church_brand drop column id;
create policy church_brand_tenant_isolation on public.church_brand as restrictive for all to authenticated
  using (church_id = public.current_church_id() or public.is_super_admin())
  with check (church_id = public.current_church_id() or public.is_super_admin());

alter table public.church_assets add column church_id uuid references public.churches (id) on delete cascade default public.current_church_id();
alter table public.church_assets disable trigger user;
update public.church_assets set church_id = (select id from public.churches where slug = 'vertical-church');
alter table public.church_assets enable trigger user;
alter table public.church_assets drop constraint church_assets_pkey;
alter table public.church_assets alter column church_id set not null;
alter table public.church_assets add primary key (church_id, key);
create policy church_assets_tenant_isolation on public.church_assets as restrictive for all to authenticated
  using (church_id = public.current_church_id() or public.is_super_admin())
  with check (church_id = public.current_church_id() or public.is_super_admin());

------------------------------------------------------------------------------
-- 8. Entrada de gente nova, agora que não existe mais "um site por igreja":
--    a) Administrador de uma igreja NOVA: um e-mail fica "pendente" numa igreja específica (troca o antigo
--       app_config.initial_admin_email, que só sabia lidar com uma igreja e uma pessoa). Também serve para
--       adicionar um segundo administrador antes de ele nunca ter entrado — hoje isso só dava por SQL manual.
--    b) Membro: entra por um LINK DE CONVITE (o invite_code da igreja), como já funciona no Grupo de
--       Discipulado. Chama claim_church() depois do primeiro login.
------------------------------------------------------------------------------
create table public.church_admins_pending (
  email text primary key check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  church_id uuid not null references public.churches (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.church_admins_pending enable row level security;
revoke all on public.church_admins_pending from anon, authenticated;
-- Sem policy: só o SQL Editor do operador grava aqui (ao criar uma igreja) e a função abaixo lê.

-- Substitui a função da migração 0023: em vez de um e-mail global (app_config.initial_admin_email), confere
-- church_admins_pending. A promoção só vale com e-mail CONFIRMADO (mesma regra de sempre).
create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  pending public.church_admins_pending;
begin
  if new.email is null then
    return new;
  end if;

  select * into pending from public.church_admins_pending where email = lower(new.email);
  if pending.church_id is null then
    return new;
  end if;

  update public.profiles set church_id = pending.church_id, role = 'admin'
    where id = new.id and church_id is distinct from pending.church_id;
  if found then
    delete from public.church_admins_pending where email = lower(new.email);
    insert into public.audit_log (church_id, actor_id, action, entity, entity_id, details)
    values (pending.church_id, new.id, 'initial_admin_assigned', 'profile', new.id::text, '{}'::jsonb);
  end if;

  return new;
end
$$;

-- Substitui a função da migração 0001: o e-mail confirmado ANTES do insert (SQL Editor, outros provedores) já
-- pode ser reconhecido de uma vez, em vez de esperar um UPDATE que nunca vai acontecer.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  pending public.church_admins_pending;
  assigned_church uuid;
  assigned_role public.user_role := 'member';
begin
  if new.email is not null and new.email_confirmed_at is not null then
    select * into pending from public.church_admins_pending where email = lower(new.email);
    if pending.church_id is not null then
      assigned_church := pending.church_id;
      assigned_role := 'admin';
    end if;
  end if;

  insert into public.profiles (id, display_name, email, photo_url, role, church_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    assigned_role,
    assigned_church
  );

  if assigned_role = 'admin' then
    delete from public.church_admins_pending where email = lower(new.email);
    insert into public.audit_log (church_id, actor_id, action, entity, entity_id, details)
    values (assigned_church, new.id, 'initial_admin_assigned', 'profile', new.id::text, '{}'::jsonb);
  end if;

  return new;
end
$$;

-- Um membro entra numa igreja pelo código de convite dela. Só quem ainda não tem igreja (church_id nulo) pode
-- entrar por aqui — trocar de igreja não é feito por este caminho.
create function public.claim_church(p_invite_code text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  target public.churches;
  already uuid;
begin
  select church_id into already from public.profiles where id = (select auth.uid());
  if already is not null then
    raise exception 'Você já faz parte de uma igreja.' using errcode = 'P0001';
  end if;

  select * into target from public.churches where invite_code = p_invite_code;
  if target.id is null then
    raise exception 'Convite inválido.' using errcode = 'P0002';
  end if;
  if target.status not in ('trial', 'active') then
    raise exception 'Esta igreja não está aceitando novos membros no momento.' using errcode = 'P0001';
  end if;

  update public.profiles set church_id = target.id where id = (select auth.uid());
  insert into public.audit_log (church_id, actor_id, action, entity, entity_id, details)
  values (target.id, (select auth.uid()), 'church_joined', 'profile', (select auth.uid())::text, '{}'::jsonb);
end
$$;
revoke execute on function public.claim_church(text) from public, anon;
grant execute on function public.claim_church(text) to authenticated;

------------------------------------------------------------------------------
-- 9. Três gatilhos de auditoria gravam em public.audit_log sem informar church_id, contando com o valor
--    padrão (current_church_id(), que lê o JWT de quem chama). Isso quebra sempre que o gatilho dispara SEM
--    uma pessoa logada por trás — dono do banco, service_role, um cron — porque aí não há JWT e o padrão dá
--    null, contra a coluna NOT NULL. Corrigido usando o church_id da própria linha (new.church_id), que já
--    existe agora em lessons/church_pages/app_settings: sempre certo, não depende de quem (ou o quê) disparou.
--    NÃO é a Fase 2 (essa é sobre as ~80 funções chamadas de fora, não gatilhos internos de auditoria).
------------------------------------------------------------------------------
create or replace function public.audit_lesson_publication()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    insert into public.audit_log (church_id, actor_id, action, entity, entity_id, details)
    values (new.church_id, (select auth.uid()), 'lesson_published', 'lesson', new.id::text,
            jsonb_build_object('slug', new.slug, 'version_id', new.current_version_id));
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.audit_log (church_id, actor_id, action, entity, entity_id, details)
    values (new.church_id, (select auth.uid()), 'lesson_status_changed', 'lesson', new.id::text,
            jsonb_build_object('slug', new.slug, 'from', old.status, 'to', new.status));
  end if;
  return new;
end
$$;

create or replace function public.audit_church_page()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body then
    insert into public.audit_log (church_id, actor_id, action, entity, entity_id, details)
    values (new.church_id, (select auth.uid()), 'church_page_updated', 'church_page', new.slug,
            jsonb_build_object('slug', new.slug, 'title_changed', new.title is distinct from old.title,
                               'body_changed', new.body is distinct from old.body));
  end if;
  return new;
end
$$;

create or replace function public.email_templates_stamp()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  insert into public.audit_log (church_id, actor_id, action, entity, entity_id, details)
  values (new.church_id, (select auth.uid()), 'email_template_updated', 'email_template', new.kind, '{}'::jsonb);
  return new;
end
$$;

create or replace function public.audit_app_setting()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.value is distinct from old.value then
    insert into public.audit_log (church_id, actor_id, action, entity, entity_id, details)
    values (new.church_id, (select auth.uid()), 'setting_changed', 'setting', new.key,
            jsonb_build_object('key', new.key, 'value', new.value));
  end if;
  return new;
end
$$;

------------------------------------------------------------------------------
-- 9b. feature_enabled (0015): lia app_settings só por "key", que virou (church_id, key) — com mais de uma
--     igreja tendo a mesma chave, a subconsulta passaria a devolver mais de uma linha. Escopada à igreja de
--     quem chama; sem sessão (funções públicas, como submit_feedback), cai na igreja semente (mesmo motivo
--     de public_identity() acima).
------------------------------------------------------------------------------
create or replace function public.feature_enabled(p_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select value = 'true'::jsonb from public.app_settings
     where key = p_key
       and church_id = coalesce(public.current_church_id(), (select id from public.churches where slug = 'vertical-church'))),
    false
  )
$$;
revoke execute on function public.feature_enabled(text) from public, anon;
grant execute on function public.feature_enabled(text) to authenticated;

------------------------------------------------------------------------------
-- 9c. submit_feedback (0024): grava em feedback_responses sem igreja (também é chamada por quem não tem
--     login). Mesma solução: igreja semente, até o produto decidir como uma visita sem login diz "qual
--     igreja" (a função já respeita feature.feedback por igreja, via feature_enabled acima).
------------------------------------------------------------------------------
create or replace function public.submit_feedback(
  p_device text, p_entered text, p_lesson_done text, p_ease int, p_alone text,
  p_liked text, p_confusing text, p_suggestion text, p_contact_name text, p_contact text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_church uuid := (select id from public.churches where slug = 'vertical-church');
begin
  if not public.feature_enabled('feature.feedback') then
    raise exception 'O formulário de feedback está fechado no momento.' using errcode = 'P0001';
  end if;

  if (select count(*) from public.feedback_responses where church_id = v_church and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Recebemos muitas respostas agora. Tente de novo daqui a pouco.' using errcode = 'P0001';
  end if;

  insert into public.feedback_responses
    (church_id, device, entered, lesson_done, ease, alone, liked, confusing, suggestion, contact_name, contact)
  values (
    v_church, p_device, p_entered, p_lesson_done, p_ease, p_alone,
    nullif(btrim(p_liked), ''), nullif(btrim(p_confusing), ''), nullif(btrim(p_suggestion), ''),
    nullif(btrim(p_contact_name), ''), nullif(btrim(p_contact), '')
  );
end
$$;

------------------------------------------------------------------------------
-- 10. Marca da igreja (0025) e identidade pública: `church_brand`/`church_assets` deixaram de ser uma linha só
--     (chave `id`) e viraram uma linha POR igreja (chave `church_id`/`(church_id, key)`, seção 7). As funções
--     do Admin (save/reset) passam a mexer só na SUA igreja, via current_church_id() — exatamente como o
--     bootstrap do primeiro Admin já faz. As funções PÚBLICAS (public_identity/public_brand_asset), essas SIM
--     são Fase 2 de verdade: rodam sem login (current_church_id() não existe para quem não tem perfil), e o
--     produto ainda não decidiu como o navegador diz "qual igreja" antes do login (subdomínio? caminho?
--     parâmetro?) — ver docs/EXPANSAO.md. Até essa decisão, ficam presas à igreja semente (vertical-church),
--     mantendo o piloto atual funcionando exatamente como hoje.
------------------------------------------------------------------------------
create or replace function public.save_church_brand(p_inputs jsonb, p_palette jsonb, p_reading_dark jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_church uuid := public.current_church_id();
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if not public.brand_palette_ok(p_palette) or not public.brand_palette_ok(p_reading_dark) then
    raise exception 'A paleta de cores é inválida' using errcode = '22023';
  end if;
  if not public.brand_inputs_ok(p_inputs) then
    raise exception 'As cores escolhidas são inválidas' using errcode = '22023';
  end if;

  insert into public.church_brand (church_id, inputs, palette, reading_dark, updated_by)
  values (v_church, p_inputs, p_palette, p_reading_dark, (select auth.uid()))
  on conflict (church_id) do update
    set inputs = excluded.inputs, palette = excluded.palette, reading_dark = excluded.reading_dark,
        version = public.church_brand.version + 1, updated_by = excluded.updated_by, updated_at = now();

  insert into public.audit_log (church_id, actor_id, action, entity, entity_id, details)
  values (v_church, (select auth.uid()), 'brand_changed', 'brand', 'colors', '{}'::jsonb);
end
$$;

create or replace function public.save_church_assets(p_assets jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  item jsonb;
  v_church uuid := public.current_church_id();
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if p_assets is null or jsonb_typeof(p_assets) <> 'array' or jsonb_array_length(p_assets) = 0 then
    raise exception 'Nenhuma imagem foi enviada' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(p_assets) loop
    insert into public.church_assets (church_id, key, content_type, data, width, height)
    values (v_church, item ->> 'key', item ->> 'content_type', item ->> 'data', (item ->> 'width')::integer, (item ->> 'height')::integer)
    on conflict (church_id, key) do update
      set content_type = excluded.content_type, data = excluded.data, width = excluded.width,
          height = excluded.height, updated_at = now();
  end loop;

  insert into public.church_brand (church_id, updated_by) values (v_church, (select auth.uid()))
  on conflict (church_id) do update
    set version = public.church_brand.version + 1, updated_by = excluded.updated_by, updated_at = now();

  insert into public.audit_log (church_id, actor_id, action, entity, entity_id, details)
  values (v_church, (select auth.uid()), 'brand_changed', 'brand', 'images', '{}'::jsonb);
end
$$;

create or replace function public.reset_church_brand()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_church uuid := public.current_church_id();
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  delete from public.church_assets where church_id = v_church;
  delete from public.church_brand where church_id = v_church;
  insert into public.audit_log (church_id, actor_id, action, entity, entity_id, details)
  values (v_church, (select auth.uid()), 'brand_reset', 'brand', 'all', '{}'::jsonb);
end
$$;

create or replace function public.public_identity()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'name', (select name from public.churches where slug = 'vertical-church'),
    'palette', (select b.palette from public.church_brand b join public.churches c on c.id = b.church_id where c.slug = 'vertical-church'),
    'reading_dark', (select b.reading_dark from public.church_brand b join public.churches c on c.id = b.church_id where c.slug = 'vertical-church'),
    'version', coalesce((select b.version from public.church_brand b join public.churches c on c.id = b.church_id where c.slug = 'vertical-church'), 0),
    'assets', coalesce(
      (select jsonb_agg(a.key order by a.key) from public.church_assets a join public.churches c on c.id = a.church_id where c.slug = 'vertical-church'),
      '[]'::jsonb
    )
  )
$$;

------------------------------------------------------------------------------
-- 11. Lembretes por e-mail (0017): cron_enqueue grava em notifications/email_unsubscribe_tokens sem igreja
--     (roda com o segredo do agendador, sem login) — usa a igreja de quem recebe o lembrete, que é sempre
--     conhecida (é o dono do e-mail). unsubscribe_email audita do mesmo jeito. cron_snapshot também lia
--     app_settings.church.name/contact_email, que saíram da tabela (viraram colunas de churches) — sem isso
--     ele sempre devolvia o texto de fallback ("Vertical Church"), nunca o nome de verdade.
--     A varredura de membros/ciclos/lições dentro de cron_snapshot continua sem recorte por igreja — é Fase 2
--     de verdade (o agendador precisa passar a rodar por igreja, não uma vez só para o banco inteiro).
------------------------------------------------------------------------------
create or replace function public.cron_enqueue(p_secret text, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_out jsonb := '[]'::jsonb;
  v_user uuid;
  v_church uuid;
  v_kind text;
  v_token uuid;
  v_email text;
begin
  perform public.check_cron_secret(p_secret);
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Lista de mensagens inválida.' using errcode = 'P0001';
  end if;
  if not public.feature_enabled('feature.reminders') then
    return v_out;
  end if;
  perform pg_advisory_xact_lock(hashtext('cron_enqueue'));

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_user := (v_item ->> 'user_id')::uuid;
    v_kind := v_item ->> 'kind';
    select church_id into v_church from public.profiles where id = v_user;
    if v_church is null then
      continue;
    end if;

    -- Só para quem ainda tem o consentimento ligado.
    if not exists (select 1 from public.consents c
                   where c.user_id = v_user and c.purpose = 'email_reminders' and c.revoked_at is null) then
      continue;
    end if;
    -- No máximo 2 lembretes (avisos de lição e convites para voltar) a cada 7 dias.
    if v_kind in ('new_lesson', 'nudge_3d', 'nudge_7d') and (
         select count(*) from public.notifications n
         where n.user_id = v_user and n.kind in ('new_lesson', 'nudge_3d', 'nudge_7d')
           and n.status in ('pending', 'sent') and n.created_at > now() - interval '7 days'
       ) >= 2 then
      continue;
    end if;

    insert into public.notifications (church_id, user_id, kind, dedupe_key, subject)
    values (v_church, v_user, v_kind, v_item ->> 'dedupe_key', left(v_item ->> 'subject', 150))
    on conflict (user_id, kind, dedupe_key) do update
      set status = 'pending', error = null, scheduled_for = now()
      where public.notifications.status = 'failed' and public.notifications.created_at > now() - interval '2 days'
    returning id into v_id;
    if v_id is null then
      continue;
    end if;

    insert into public.email_unsubscribe_tokens (church_id, user_id) values (v_church, v_user) on conflict (user_id) do nothing;
    select t.token into v_token from public.email_unsubscribe_tokens t where t.user_id = v_user;
    select p.email into v_email from public.profiles p where p.id = v_user;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_id, 'user_id', v_user, 'kind', v_kind, 'dedupe_key', v_item ->> 'dedupe_key',
      'email', v_email, 'unsubscribe_token', v_token));
    v_id := null;
  end loop;

  return v_out;
end
$$;

create or replace function public.unsubscribe_email(p_token uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
  v_church uuid;
  v_changed int;
begin
  select t.user_id into v_user from public.email_unsubscribe_tokens t where t.token = p_token;
  if v_user is null then
    return false;
  end if;
  select church_id into v_church from public.profiles where id = v_user;
  update public.consents set revoked_at = now()
  where user_id = v_user and purpose = 'email_reminders' and revoked_at is null;
  get diagnostics v_changed = row_count;
  if v_changed > 0 then
    insert into public.audit_log (church_id, actor_id, action, entity, entity_id, details)
    values (v_church, null, 'email_unsubscribed', 'profile', v_user::text, '{}'::jsonb);
  end if;
  return true;
end
$$;

create or replace function public.cron_snapshot(p_secret text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.check_cron_secret(p_secret);

  if not public.feature_enabled('feature.reminders') then
    return jsonb_build_object('enabled', false);
  end if;

  select jsonb_build_object(
    'enabled', true,
    'caregivers_enabled', public.feature_enabled('feature.caregivers'),
    'church', jsonb_build_object(
      'name', coalesce((select name from public.churches where slug = 'vertical-church'), 'Vertical Church'),
      'contact_email', coalesce((select contact_email from public.churches where slug = 'vertical-church'), '')
    ),
    -- Só quem aceitou lembretes por e-mail e não revogou.
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.member_id, 'name', s.display_name, 'email', s.email, 'role', s.role,
        'onboarded_at', s.onboarded_at, 'last_activity_at', s.last_activity_at, 'status', s.status))
      from public.member_situation_core() s
      where s.onboarded_at is not null
        and exists (select 1 from public.consents c
                    where c.user_id = s.member_id and c.purpose = 'email_reminders' and c.revoked_at is null)
    ), '[]'::jsonb),
    'cycles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'title', c.title, 'position', c.position,
        'release_interval_days', c.release_interval_days, 'max_lessons_per_week', c.max_lessons_per_week))
      from public.cycles c where c.active
    ), '[]'::jsonb),
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'cycle_id', l.cycle_id, 'slug', l.slug, 'title', l.title, 'position', l.position, 'required', l.required))
      from public.lessons l join public.cycles c on c.id = l.cycle_id
      where l.status = 'published' and c.active
    ), '[]'::jsonb),
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', lp.user_id, 'lesson_id', lp.lesson_id, 'released_at', lp.released_at,
        'started_at', lp.started_at, 'completed_at', lp.completed_at))
      from public.lesson_progress lp
      where exists (select 1 from public.consents c
                    where c.user_id = lp.user_id and c.purpose = 'email_reminders' and c.revoked_at is null)
    ), '[]'::jsonb),
    'cycle_progress', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', cp.user_id, 'cycle_id', cp.cycle_id, 'completed_at', cp.completed_at))
      from public.cycle_progress cp
      where cp.status = 'completed'
        and exists (select 1 from public.consents c
                    where c.user_id = cp.user_id and c.purpose = 'email_reminders' and c.revoked_at is null)
    ), '[]'::jsonb),
    'sent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', n.user_id, 'kind', n.kind, 'dedupe_key', n.dedupe_key, 'status', n.status, 'created_at', n.created_at))
      from public.notifications n where n.created_at > now() - interval '60 days'
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object('member_id', a.member_id, 'caregiver_id', a.caregiver_id))
      from public.care_assignments a where a.active
    ), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(jsonb_build_object('id', al.id, 'member_id', al.member_id, 'member_name', p.display_name, 'opened_at', al.opened_at))
      from public.care_alerts al join public.profiles p on p.id = al.member_id
      where al.status <> 'resolved'
    ), '[]'::jsonb),
    -- Números da semana de cada cuidador, sem nomes: quem está ativo, quem parou, quantas lições foram concluídas.
    'summaries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'caregiver_id', x.caregiver_id, 'members', x.members, 'active', x.active,
        'stalled', x.stalled, 'completed_lessons', x.completed_lessons))
      from (
        select a.caregiver_id,
               count(*)::int as members,
               count(*) filter (where s.last_activity_at > now() - interval '7 days')::int as active,
               count(*) filter (where s.status = 'stalled')::int as stalled,
               coalesce(sum((select count(*) from public.lesson_progress lp
                             where lp.user_id = a.member_id and lp.status = 'completed'
                               and lp.completed_at > now() - interval '7 days')), 0)::int as completed_lessons
        from public.care_assignments a
        join public.member_situation_core() s on s.member_id = a.member_id
        where a.active
        group by a.caregiver_id
      ) x
    ), '[]'::jsonb),
    'templates', coalesce((select jsonb_agg(jsonb_build_object('kind', t.kind, 'subject', t.subject, 'body', t.body)) from public.email_templates t), '[]'::jsonb),
    'admins', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'email', p.email))
      from public.profiles p
      where p.role = 'admin' and p.onboarded_at is not null
        and exists (select 1 from public.consents c
                    where c.user_id = p.id and c.purpose = 'email_reminders' and c.revoked_at is null)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$$;

create or replace function public.public_brand_asset(p_key text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'content_type', a.content_type, 'data', a.data, 'width', a.width, 'height', a.height,
    'version', coalesce((select b.version from public.church_brand b join public.churches c on c.id = b.church_id where c.slug = 'vertical-church'), 0)
  )
  from public.church_assets a join public.churches c on c.id = a.church_id
  where c.slug = 'vertical-church' and a.key = p_key
$$;
