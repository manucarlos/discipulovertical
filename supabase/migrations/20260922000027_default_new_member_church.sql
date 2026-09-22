-- 0027 Corrige o cadastro de gente nova (achado só ao testar contra o Supabase de produção, não pelos testes
-- automatizados): handle_new_user()/handle_user_confirmed() (migração 0026) deixavam church_id NULO para
-- quem não é administrador pendente — e a app NUNCA chama claim_church() no cadastro comum (hoje só existe o
-- convite do Grupo de Discipulado, que é outra coisa, e não atribui a igreja principal). Resultado: toda
-- pessoa nova travava no primeiro acesso ("Não foi possível registrar seu consentimento"), porque
-- `consents.church_id` (default current_church_id()) não tinha como resolver sem igreja.
--
-- Enquanto houver uma igreja só, quem não é administrador pendente entra direto na igreja semente
-- (vertical-church) — é como o produto sempre funcionou. Quando houver uma segunda igreja de verdade, este é
-- o primeiro lugar a revisitar (Fase 2, docs/EXPANSAO.md): decidir como uma pessoa nova escolhe a igreja
-- (convite na tela de cadastro? subdomínio?) — e nesse dia claim_church() (hoje código morto: nunca chamado
-- pela app, e com este default ninguém mais chega com church_id nulo para poder chamá-lo) volta a fazer
-- sentido, ou é substituído.

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

  -- Sem "is distinct from church_id" aqui de propósito: agora todo mundo já chega com a igreja semente
  -- (abaixo), então a igreja do convite pendente pode ser IGUAL à que a pessoa já tem — o que muda é o
  -- papel. Quem trava uma segunda promoção depois de demovido não é essa comparação, é o DELETE logo
  -- abaixo: na segunda confirmação não há mais convite pendente, então nem entra aqui (achado pelo teste
  -- que quebrou com a primeira versão deste arquivo — tests/e2e/personas.test.ts).
  select * into pending from public.church_admins_pending where email = lower(new.email);
  if pending.church_id is not null then
    update public.profiles set church_id = pending.church_id, role = 'admin' where id = new.id;
    delete from public.church_admins_pending where email = lower(new.email);
    insert into public.audit_log (church_id, actor_id, action, entity, entity_id, details)
    values (pending.church_id, new.id, 'initial_admin_assigned', 'profile', new.id::text, '{}'::jsonb);
    return new;
  end if;

  -- Sem convite pendente: se por algum motivo a pessoa ainda estiver sem igreja, entra na semente.
  update public.profiles set church_id = (select id from public.churches where slug = 'vertical-church')
    where id = new.id and church_id is null;

  return new;
end
$$;

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

  -- Sem administrador pendente correspondente: entra na igreja semente (única igreja hoje).
  if assigned_church is null then
    assigned_church := (select id from public.churches where slug = 'vertical-church');
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
