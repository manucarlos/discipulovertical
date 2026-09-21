-- 0015 Quiz das lições (RF-12, RN-02) e reflexões (RF-13, RN-03). Ambos dependem de chave liga/desliga.
--
-- Quiz:  o gabarito nunca sai do banco. O membro pede as perguntas por get_quiz() (sem a resposta certa)
--        e envia as respostas por submit_quiz(), que corrige, guarda a tentativa e devolve só acertou/errou
--        e a explicação. Refazer é ilimitado. Com o quiz ligado, uma lição que tem perguntas só pode ser
--        concluída depois de uma tentativa aprovada (gatilho em lesson_progress, para valer mesmo que
--        alguém contorne a tela).
-- Reflexão: privada. O dono lê e escreve. O Admin lê por person_reflections(), que deixa registro.

create function public.feature_enabled(p_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select value = 'true'::jsonb from public.app_settings where key = p_key), false)
$$;
revoke execute on function public.feature_enabled(text) from public, anon;
grant execute on function public.feature_enabled(text) to authenticated;

------------------------------------------------------------------------------
-- Tentativas de quiz
------------------------------------------------------------------------------
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  answers jsonb not null,
  correct_count int not null check (correct_count >= 0),
  total int not null check (total > 0),
  passed boolean not null,
  created_at timestamptz not null default now()
);
create index quiz_attempts_user_lesson_idx on public.quiz_attempts (user_id, lesson_id);
alter table public.quiz_attempts enable row level security;

revoke all on public.quiz_attempts from anon, authenticated;
grant select on public.quiz_attempts to authenticated; -- gravar só por submit_quiz()
create policy quiz_attempts_read on public.quiz_attempts
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- Quem pode ver o quiz de uma lição: quem vê a lição (publicada; ou arquivada com progresso) e a equipe.
create function public.can_access_quiz(p_lesson uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_editor_or_admin() or exists (
    select 1 from public.lessons l
    where l.id = p_lesson
      and (l.status = 'published'
           or (l.status = 'archived' and exists (
                 select 1 from public.lesson_progress p
                 where p.lesson_id = l.id and p.user_id = (select auth.uid()))))
  )
$$;
revoke execute on function public.can_access_quiz(uuid) from public, anon;
grant execute on function public.can_access_quiz(uuid) to authenticated;

-- Perguntas SEM a resposta certa nem a explicação.
create function public.get_quiz(p_lesson uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.can_access_quiz(p_lesson) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if not public.feature_enabled('feature.quiz') then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('position', q.position, 'prompt', q.prompt, 'options', q.options)
                     order by q.position)
    from public.quiz_questions q where q.lesson_id = p_lesson
  ), '[]'::jsonb);
end
$$;
revoke execute on function public.get_quiz(uuid) from public, anon;
grant execute on function public.get_quiz(uuid) to authenticated;

-- Corrige e grava a tentativa. p_answers: {"1": "B", "2": "A", ...} (posição da pergunta -> alternativa).
-- Aprovação (RN-02): pelo menos 2 de cada 3 acertos (arredondado para cima; nunca menos de 1).
create function public.submit_quiz(p_lesson uuid, p_answers jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_total int;
  v_correct int;
  v_passed boolean;
  v_results jsonb;
begin
  if v_uid is null or not public.can_access_quiz(p_lesson) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if not public.feature_enabled('feature.quiz') then
    raise exception 'O quiz não está ativo.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_answers) is distinct from 'object' then
    raise exception 'Respostas inválidas.' using errcode = 'P0001';
  end if;

  select count(*) into v_total from public.quiz_questions where lesson_id = p_lesson;
  if v_total = 0 then
    raise exception 'Esta lição não tem quiz.' using errcode = 'P0001';
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'position', q.position,
      'correct', (p_answers ->> q.position::text) is not distinct from q.correct_option,
      'explanation', q.explanation
    ) order by q.position), '[]'::jsonb),
    count(*) filter (where (p_answers ->> q.position::text) is not distinct from q.correct_option)
  into v_results, v_correct
  from public.quiz_questions q where q.lesson_id = p_lesson;

  v_passed := v_correct >= greatest(1, ceil(v_total * 2.0 / 3.0)::int);

  insert into public.quiz_attempts (user_id, lesson_id, answers, correct_count, total, passed)
  values (v_uid, p_lesson, p_answers, v_correct, v_total, v_passed);

  return jsonb_build_object('correct_count', v_correct, 'total', v_total, 'passed', v_passed, 'results', v_results);
end
$$;
revoke execute on function public.submit_quiz(uuid, jsonb) from public, anon;
grant execute on function public.submit_quiz(uuid, jsonb) to authenticated;

-- RN-02: com o quiz ligado, concluir uma lição que tem perguntas exige uma tentativa aprovada.
create function public.require_quiz_pass()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed')
     and public.feature_enabled('feature.quiz')
     and exists (select 1 from public.quiz_questions q where q.lesson_id = new.lesson_id)
     and not exists (
       select 1 from public.quiz_attempts a
       where a.user_id = new.user_id and a.lesson_id = new.lesson_id and a.passed
     )
  then
    raise exception 'Para concluir esta lição, acerte o quiz.' using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke execute on function public.require_quiz_pass() from public, anon, authenticated;
create trigger lesson_progress_require_quiz before insert or update on public.lesson_progress
  for each row execute function public.require_quiz_pass();

------------------------------------------------------------------------------
-- Reflexões
------------------------------------------------------------------------------
create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);
alter table public.reflections enable row level security;

revoke all on public.reflections from anon, authenticated;
grant select, insert, update, delete on public.reflections to authenticated;

create policy reflections_own_read on public.reflections
  for select to authenticated using (user_id = (select auth.uid()));
create policy reflections_own_insert on public.reflections
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.feature_enabled('feature.reflections')
    and exists (select 1 from public.lessons l where l.id = lesson_id)
  );
create policy reflections_own_update on public.reflections
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.feature_enabled('feature.reflections'));
create policy reflections_own_delete on public.reflections
  for delete to authenticated using (user_id = (select auth.uid()));

create function public.reflections_stamp()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
revoke execute on function public.reflections_stamp() from public, anon, authenticated;
create trigger reflections_stamp before update on public.reflections
  for each row execute function public.reflections_stamp();

-- O Admin lê as reflexões de uma pessoa (RN-03) e cada consulta fica registrada, sem o conteúdo.
create function public.person_reflections(p_target uuid)
returns table (lesson_slug text, lesson_title text, body text, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if p_target is distinct from (select auth.uid()) then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values ((select auth.uid()), 'reflections_viewed', 'profile', p_target::text, '{}'::jsonb);
  end if;
  return query
    select l.slug, l.title, r.body, r.updated_at
    from public.reflections r join public.lessons l on l.id = r.lesson_id
    where r.user_id = p_target
    order by r.updated_at desc;
end
$$;
revoke execute on function public.person_reflections(uuid) from public, anon;
grant execute on function public.person_reflections(uuid) to authenticated;
