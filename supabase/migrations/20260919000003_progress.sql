-- 0003 Progresso: o membro lê e escreve apenas o próprio progresso.
-- As regras de liberação (RN-01) vivem em src/lib/lessons/release.ts (ver docs/DECISIONS.md).

create type public.progress_status as enum ('available', 'in_progress', 'completed');
create type public.cycle_progress_status as enum ('in_progress', 'completed');

create table public.lesson_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- RESTRICT: lição com progresso nunca é apagada, só arquivada (seção 4).
  lesson_id uuid not null references public.lessons (id) on delete restrict,
  status public.progress_status not null default 'available',
  released_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_position numeric(5, 4) check (last_position between 0 and 1),
  practice_done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index lesson_progress_lesson_idx on public.lesson_progress (lesson_id);
create index lesson_progress_user_status_idx on public.lesson_progress (user_id, status);
alter table public.lesson_progress enable row level security;

create table public.cycle_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  cycle_id uuid not null references public.cycles (id) on delete restrict,
  status public.cycle_progress_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, cycle_id)
);
alter table public.cycle_progress enable row level security;

revoke all on public.lesson_progress, public.cycle_progress from anon, authenticated;
grant select, insert, update on public.lesson_progress to authenticated;
grant select, insert, update on public.cycle_progress to authenticated;

create policy lesson_progress_select on public.lesson_progress
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
-- A subconsulta em lessons passa pela RLS do próprio membro: só lições que ele pode ver.
create policy lesson_progress_insert_own on public.lesson_progress
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.lessons l where l.id = lesson_id)
  );
create policy lesson_progress_update_own on public.lesson_progress
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy cycle_progress_select on public.cycle_progress
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());
create policy cycle_progress_insert_own on public.cycle_progress
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy cycle_progress_update_own on public.cycle_progress
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- RN-11: lição arquivada some para novos membros, mas segue visível a quem já tem progresso nela.
-- A leitura de lesson_progress fica numa função SECURITY DEFINER para não fechar um ciclo de
-- políticas (lessons -> lesson_progress -> lessons), que o Postgres recusa como recursão infinita.
create function public.has_progress_on_lesson(target_lesson uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lesson_progress p
    where p.lesson_id = target_lesson and p.user_id = (select auth.uid())
  )
$$;
revoke execute on function public.has_progress_on_lesson(uuid) from public, anon;
grant execute on function public.has_progress_on_lesson(uuid) to authenticated;

create policy lessons_read_archived_with_progress on public.lessons
  for select to authenticated
  using (status = 'archived' and public.has_progress_on_lesson(id));

create policy lesson_versions_read_archived_with_progress on public.lesson_versions
  for select to authenticated
  using (
    public.has_progress_on_lesson(lesson_id)
    and exists (
      select 1 from public.lessons l
      where l.id = lesson_versions.lesson_id
        and l.status = 'archived'
        and l.current_version_id = lesson_versions.id
    )
  );
