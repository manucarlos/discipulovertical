-- 0022 Lista de pessoas de um grupo, só com o nome (RG-07): o discipulador precisa saber QUEM está no grupo
-- para montar o painel e ler os pedidos de ajuda, mas não pode ler o perfil completo (e-mail, WhatsApp) de
-- ninguém. O Admin vê todos os grupos.

create function public.group_roster(p_group uuid)
returns table (user_id uuid, display_name text, joined_at timestamptz, status text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (public.is_group_discipler(p_group) or (public.is_admin() and public.groups_enabled())) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.display_name, m.joined_at, m.status
    from public.group_members m join public.profiles p on p.id = m.user_id
    where m.group_id = p_group
    order by (m.status = 'active') desc, p.display_name, m.user_id;
end
$$;
revoke execute on function public.group_roster(uuid) from public, anon;
grant execute on function public.group_roster(uuid) to authenticated;

-- Nome de quem pediu ajuda, para o Admin e o discipulador que podem ler o pedido.
create function public.help_request_names(p_ids uuid[])
returns table (request_id uuid, display_name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  return query
    select r.id, p.display_name
    from public.help_requests r join public.profiles p on p.id = r.user_id
    where r.id = any (coalesce(p_ids, '{}'))
      and (
        (r.destination = 'discipler' and r.group_id is not null and public.is_group_discipler(r.group_id))
        or (public.is_admin() and (r.destination = 'pastoral' or r.escalated_at is not null))
      );
end
$$;
revoke execute on function public.help_request_names(uuid[]) from public, anon;
grant execute on function public.help_request_names(uuid[]) to authenticated;

-- Antes de aceitar o consentimento, quem recebeu o convite vê a que grupo está entrando (nome do grupo, do
-- discipulador e da trilha). Só devolve algo para um código válido de grupo ativo.
create function public.group_invite_preview(p_code text)
returns table (group_name text, discipler_name text, track_title text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.groups_enabled() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  return query
    select g.name, coalesce(p.display_name, ''), t.title
    from public.discipleship_groups g
    join public.tracks t on t.id = g.track_id
    left join public.profiles p on p.id = g.discipler_id
    where g.invite_code = upper(btrim(p_code)) and g.status = 'active';
end
$$;
revoke execute on function public.group_invite_preview(text) from public, anon;
grant execute on function public.group_invite_preview(text) to authenticated;
