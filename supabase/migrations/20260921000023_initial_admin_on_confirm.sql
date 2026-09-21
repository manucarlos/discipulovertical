-- 0023 O primeiro Admin também vale quando o e-mail é confirmado DEPOIS da criação do usuário.
--
-- O Supabase cria o usuário do login Google sem e-mail confirmado e preenche
-- email_confirmed_at logo depois, num UPDATE (milissegundos mais tarde). O gatilho de criação
-- (handle_new_user, migração 0001) só olha o INSERT, então nunca via o e-mail confirmado e o
-- primeiro Admin nunca era promovido. Este gatilho cobre a transição "não confirmado" -> "confirmado".
-- A regra é a mesma: e-mail igual a app_config.initial_admin_email (sem diferenciar maiúsculas) e
-- confirmado. E-mail nunca confirmado continua sem promoção.
create function public.handle_user_confirmed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  initial_admin text;
begin
  select value into initial_admin from public.app_config where key = 'initial_admin_email';

  if initial_admin is null
     or new.email is null
     or lower(new.email) <> lower(initial_admin)
  then
    return new;
  end if;

  update public.profiles set role = 'admin' where id = new.id and role <> 'admin';

  if found then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values (new.id, 'initial_admin_assigned', 'profile', new.id::text, '{}'::jsonb);
  end if;

  return new;
end
$$;

-- Função de gatilho: só o banco a dispara (mesmo fechamento da migração 0008).
revoke execute on function public.handle_user_confirmed() from public, anon, authenticated;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();
