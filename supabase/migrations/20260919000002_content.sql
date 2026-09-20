-- 0002 Conteúdo: ciclos, lições, versões, notas internas e quiz.
-- O membro só lê o que está publicado. Notas internas e quiz são só da equipe.

create type public.lesson_status as enum ('draft', 'in_review', 'published', 'archived');

------------------------------------------------------------------------------
-- Ciclos
------------------------------------------------------------------------------
create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  position int not null,
  planned_weeks int,
  -- RN-01: intervalo mínimo entre lições e máximo de lições liberadas por semana.
  release_interval_days int not null default 3 check (release_interval_days >= 0),
  max_lessons_per_week int not null default 2 check (max_lessons_per_week >= 1),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.cycles enable row level security;

revoke all on public.cycles from anon, authenticated;
grant select, insert, update, delete on public.cycles to authenticated;

create policy cycles_read on public.cycles
  for select to authenticated using (active or public.is_editor_or_admin());
create policy cycles_editor_insert on public.cycles
  for insert to authenticated with check (public.is_editor_or_admin());
create policy cycles_editor_update on public.cycles
  for update to authenticated
  using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());
create policy cycles_admin_delete on public.cycles
  for delete to authenticated using (public.is_admin());

------------------------------------------------------------------------------
-- Lições
------------------------------------------------------------------------------
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.cycles (id) on delete restrict,
  slug text not null unique,               -- ex.: c1-l01 (id do importador)
  title text not null,
  objective text not null default '',
  position int not null,
  estimated_minutes int,
  tags text[] not null default '{}',
  key_verse_ref text,                      -- referência, nunca o texto (regra 0.4.1)
  required boolean not null default true,  -- RN-10: lição nova em ciclo já concluído pode ser opcional
  sensitive boolean not null default false,
  has_placeholders boolean not null default false,
  status public.lesson_status not null default 'draft',
  current_version_id uuid,
  created_at timestamptz not null default now(),
  -- Regra 0.4.3: lição com [PREENCHER] nunca pode ser publicada.
  constraint lessons_no_publish_with_placeholders
    check (not (status = 'published' and has_placeholders)),
  unique (cycle_id, position)
);
create index lessons_cycle_position_idx on public.lessons (cycle_id, position);
alter table public.lessons enable row level security;

create table public.lesson_versions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  -- Blocos (texto, versículo, vídeo, destaque, imagem, prática) + reflexão. Ver docs/HANDOFF.md 0.7.
  content jsonb not null,
  author_id uuid references public.profiles (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index lesson_versions_lesson_idx on public.lesson_versions (lesson_id, created_at desc);
alter table public.lesson_versions enable row level security;

alter table public.lessons
  add constraint lessons_current_version_fk
  foreign key (current_version_id) references public.lesson_versions (id)
  deferrable initially deferred;

-- Campos internos (regra 0.4.7): nunca visíveis ao membro.
create table public.lesson_internal_notes (
  lesson_id uuid primary key references public.lessons (id) on delete cascade,
  pastoral_review_note text,
  video_suggestion text,
  draft_notice text
);
alter table public.lesson_internal_notes enable row level security;

-- Quiz: só a equipe lê por enquanto (o gabarito não pode ir ao membro). A V2 expõe via função.
create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  position int not null,
  prompt text not null,
  options jsonb not null,
  correct_option text not null,
  explanation text not null default '',
  unique (lesson_id, position)
);
alter table public.quiz_questions enable row level security;

-- Grants
revoke all on public.lessons, public.lesson_versions,
              public.lesson_internal_notes, public.quiz_questions from anon, authenticated;
grant select, insert, update, delete on public.lessons to authenticated;
grant select, insert on public.lesson_versions to authenticated;   -- histórico imutável
grant select, insert, update, delete on public.lesson_internal_notes to authenticated;
grant select, insert, update, delete on public.quiz_questions to authenticated;

-- Lições: membro vê publicadas; equipe vê tudo.
create policy lessons_read on public.lessons
  for select to authenticated
  using (
    public.is_editor_or_admin()
    or (status = 'published'
        and exists (select 1 from public.cycles c where c.id = cycle_id and c.active))
  );
-- Editor cria e edita só rascunho/em revisão; só o Admin publica ou arquiva.
create policy lessons_staff_insert on public.lessons
  for insert to authenticated
  with check (
    public.is_admin()
    or (public.is_editor_or_admin() and status in ('draft', 'in_review'))
  );
create policy lessons_staff_update on public.lessons
  for update to authenticated
  using (
    public.is_admin()
    or (public.is_editor_or_admin() and status in ('draft', 'in_review'))
  )
  with check (
    public.is_admin()
    or (public.is_editor_or_admin() and status in ('draft', 'in_review'))
  );
-- Apagar só é possível sem progresso (FK RESTRICT em lesson_progress); senão, arquivar.
create policy lessons_admin_delete on public.lessons
  for delete to authenticated using (public.is_admin());

-- Versões: membro lê apenas a versão vigente de lição publicada.
create policy lesson_versions_read on public.lesson_versions
  for select to authenticated
  using (
    public.is_editor_or_admin()
    or exists (
      select 1 from public.lessons l
      where l.id = lesson_id
        and l.status = 'published'
        and l.current_version_id = lesson_versions.id
    )
  );
create policy lesson_versions_staff_insert on public.lesson_versions
  for insert to authenticated
  with check (public.is_editor_or_admin() and author_id = (select auth.uid()));

create policy lesson_internal_notes_staff on public.lesson_internal_notes
  for all to authenticated
  using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());

create policy quiz_questions_staff on public.quiz_questions
  for all to authenticated
  using (public.is_editor_or_admin()) with check (public.is_editor_or_admin());

------------------------------------------------------------------------------
-- Auditoria de publicação
------------------------------------------------------------------------------
create function public.audit_lesson_publication()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values ((select auth.uid()), 'lesson_published', 'lesson', new.id::text,
            jsonb_build_object('slug', new.slug, 'version_id', new.current_version_id));
  end if;
  return new;
end
$$;
create trigger lessons_audit_publication
  after insert or update of status on public.lessons
  for each row execute function public.audit_lesson_publication();
