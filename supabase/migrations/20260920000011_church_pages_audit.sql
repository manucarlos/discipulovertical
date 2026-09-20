-- 0011 "Nossa Igreja": quem e quando editou passam a ser carimbados pelo banco (o navegador não pode
-- forjar), e cada alteração de texto entra no log de auditoria (é o texto institucional da igreja).

create function public.church_pages_stamp()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end
$$;

create function public.audit_church_page()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.title is distinct from old.title or new.body is distinct from old.body then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values ((select auth.uid()), 'church_page_updated', 'church_page', new.slug,
            jsonb_build_object('slug', new.slug, 'title_changed', new.title is distinct from old.title,
                               'body_changed', new.body is distinct from old.body));
  end if;
  return new;
end
$$;

revoke execute on function public.church_pages_stamp(), public.audit_church_page()
  from public, anon, authenticated;

create trigger church_pages_stamp
  before update on public.church_pages
  for each row execute function public.church_pages_stamp();
create trigger church_pages_audit
  after update on public.church_pages
  for each row execute function public.audit_church_page();
