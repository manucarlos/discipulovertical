-- 0025 Identidade da igreja (RF-33): cores e imagens (logotipo e ícones) editáveis no painel, para cada
-- instalação ter a sua marca sem mexer em código.
--
-- Guardado em tabelas SQL comuns (as imagens em base64, pequenas), sem Storage nem recurso próprio do Supabase:
-- dá para exportar com pg_dump e levar para outro banco. Sem linha em church_brand, o site usa a paleta e as
-- imagens padrão do código.
--   - Só o Admin grava, e só pelas funções abaixo (que validam tudo e deixam registro).
--   - Qualquer pessoa, mesmo sem login, lê o que é público (nome, cores, imagens), porque o login também usa a marca.

create table public.church_brand (
  id boolean primary key default true check (id), -- uma linha só
  inputs jsonb,       -- as 3 cores escolhidas na tela ({brand, foreground, background}); nulo = padrão
  palette jsonb,      -- tema claro completo (9 papéis); nulo = padrão
  reading_dark jsonb, -- modo escuro da leitura (9 papéis); nulo = padrão
  version integer not null default 1, -- sobe a cada mudança: entra no endereço das imagens (cache)
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.church_assets (
  key text primary key check (key in ('logo', 'icon-192', 'icon-512', 'icon-maskable', 'icon-apple', 'icon-tab', 'logo-jpeg')),
  content_type text not null check (content_type in ('image/png', 'image/jpeg')),
  data text not null check (data ~ '^[A-Za-z0-9+/]+={0,2}$' and char_length(data) <= 700000), -- base64
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  updated_at timestamptz not null default now()
);

alter table public.church_brand enable row level security;
alter table public.church_assets enable row level security;
revoke all on public.church_brand, public.church_assets from anon, authenticated;
grant select on public.church_brand, public.church_assets to authenticated;
create policy church_brand_admin_read on public.church_brand for select to authenticated using (public.is_admin());
create policy church_assets_admin_read on public.church_assets for select to authenticated using (public.is_admin());

-- Uma paleta válida tem exatamente os 9 papéis, cada um um "#rrggbb" em minúsculas. Isso vai para o CSS das
-- páginas: nada além de cor pode passar. (O "case" garante a ordem: só conta chaves se for mesmo um objeto.)
create function public.brand_palette_ok(p jsonb)
returns boolean
language sql immutable set search_path = ''
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then false
    else (select count(*) from jsonb_object_keys(p)) = 9
      and p ?& array['background', 'foreground', 'brand', 'brandStrong', 'onBrand', 'tint', 'muted', 'card', 'line']
      and not exists (select 1 from jsonb_each_text(p) e where e.value !~ '^#[0-9a-f]{6}$')
  end
$$;

-- As 3 cores escolhidas na tela: exatamente brand, foreground e background.
create function public.brand_inputs_ok(p jsonb)
returns boolean
language sql immutable set search_path = ''
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then false
    else (select count(*) from jsonb_object_keys(p)) = 3
      and p ?& array['brand', 'foreground', 'background']
      and not exists (select 1 from jsonb_each_text(p) e where e.value !~ '^#[0-9a-f]{6}$')
  end
$$;

-- Auxiliares só das funções abaixo (que rodam como dono do banco): ninguém precisa chamá-los direto.
revoke execute on function public.brand_palette_ok(jsonb), public.brand_inputs_ok(jsonb) from public, anon, authenticated;

create function public.save_church_brand(p_inputs jsonb, p_palette jsonb, p_reading_dark jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
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

  insert into public.church_brand (id, inputs, palette, reading_dark, updated_by)
  values (true, p_inputs, p_palette, p_reading_dark, (select auth.uid()))
  on conflict (id) do update
    set inputs = excluded.inputs, palette = excluded.palette, reading_dark = excluded.reading_dark,
        version = public.church_brand.version + 1, updated_by = excluded.updated_by, updated_at = now();

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'brand_changed', 'brand', 'colors', '{}'::jsonb);
end
$$;
revoke execute on function public.save_church_brand(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_church_brand(jsonb, jsonb, jsonb) to authenticated;

-- p_assets: lista de {key, content_type, data (base64), width, height}. As restrições da tabela conferem o resto,
-- e um item inválido desfaz o lote inteiro.
create function public.save_church_assets(p_assets jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  item jsonb;
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if p_assets is null or jsonb_typeof(p_assets) <> 'array' or jsonb_array_length(p_assets) = 0 then
    raise exception 'Nenhuma imagem foi enviada' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(p_assets) loop
    insert into public.church_assets (key, content_type, data, width, height)
    values (item ->> 'key', item ->> 'content_type', item ->> 'data', (item ->> 'width')::integer, (item ->> 'height')::integer)
    on conflict (key) do update
      set content_type = excluded.content_type, data = excluded.data, width = excluded.width,
          height = excluded.height, updated_at = now();
  end loop;

  insert into public.church_brand (id, updated_by) values (true, (select auth.uid()))
  on conflict (id) do update
    set version = public.church_brand.version + 1, updated_by = excluded.updated_by, updated_at = now();

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'brand_changed', 'brand', 'images', '{}'::jsonb);
end
$$;
revoke execute on function public.save_church_assets(jsonb) from public, anon;
grant execute on function public.save_church_assets(jsonb) to authenticated;

-- Volta ao padrão do código: apaga cores e imagens personalizadas.
create function public.reset_church_brand()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  delete from public.church_assets where true;
  delete from public.church_brand where true;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'brand_reset', 'brand', 'all', '{}'::jsonb);
end
$$;
revoke execute on function public.reset_church_brand() from public, anon;
grant execute on function public.reset_church_brand() to authenticated;

-- Público (sem login): o nome da igreja e as cores, e quais imagens são personalizadas. Nada além disso.
create function public.public_identity()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'name', (select value #>> '{}' from public.app_settings where key = 'church.name'),
    'palette', (select palette from public.church_brand),
    'reading_dark', (select reading_dark from public.church_brand),
    'version', coalesce((select version from public.church_brand), 0),
    'assets', coalesce((select jsonb_agg(key order by key) from public.church_assets), '[]'::jsonb)
  )
$$;
revoke execute on function public.public_identity() from public;
grant execute on function public.public_identity() to anon, authenticated;

-- Público: uma imagem da marca (base64), ou nulo se não houver personalizada.
create function public.public_brand_asset(p_key text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'content_type', a.content_type, 'data', a.data, 'width', a.width, 'height', a.height,
    'version', coalesce((select version from public.church_brand), 0)
  )
  from public.church_assets a where a.key = p_key
$$;
revoke execute on function public.public_brand_asset(text) from public;
grant execute on function public.public_brand_asset(text) to anon, authenticated;
