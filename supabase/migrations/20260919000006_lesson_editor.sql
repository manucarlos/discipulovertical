-- 0006 Editor de lições: salvar, criar, reordenar e restaurar versões, cada operação em uma
-- transação só. As funções de edição rodam com as permissões de quem chama (SECURITY INVOKER),
-- então a RLS da 0002 continua valendo: o editor só mexe em rascunho/em revisão; só o Admin
-- mexe em lição publicada.

------------------------------------------------------------------------------
-- Auditoria de qualquer mudança de status (substitui a função da 0002).
-- Mantém o registro 'lesson_published' e acrescenta 'lesson_status_changed'.
------------------------------------------------------------------------------
create or replace function public.audit_lesson_publication()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values ((select auth.uid()), 'lesson_published', 'lesson', new.id::text,
            jsonb_build_object('slug', new.slug, 'version_id', new.current_version_id));
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values ((select auth.uid()), 'lesson_status_changed', 'lesson', new.id::text,
            jsonb_build_object('slug', new.slug, 'from', old.status, 'to', new.status));
  end if;
  return new;
end
$$;

------------------------------------------------------------------------------
-- Barreira final da publicação (regra 0.4.3). A coluna has_placeholders é mantida pelo editor,
-- mas quem publica é conferido contra o texto de verdade: nenhum [PREENCHER] no conteúdo
-- vigente nem nas notas internas, e a lição precisa ter uma versão.
------------------------------------------------------------------------------
create function public.lessons_block_placeholder_publish()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    if new.current_version_id is null then
      raise exception 'lição sem conteúdo não pode ser publicada' using errcode = '23514';
    end if;
    if exists (select 1 from public.lesson_versions v
               where v.id = new.current_version_id and v.content::text like '%[PREENCHER%')
       or exists (select 1 from public.lesson_internal_notes n
                  where n.lesson_id = new.id
                    and concat_ws(' ', n.pastoral_review_note, n.video_suggestion,
                                  n.draft_notice, n.button_suggestion) like '%[PREENCHER%')
    then
      raise exception 'lição com [PREENCHER] não pode ser publicada' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;
create trigger lessons_block_placeholder_publish
  before update of status on public.lessons
  for each row execute function public.lessons_block_placeholder_publish();

------------------------------------------------------------------------------
-- Salvar uma lição: nova versão + metadados + notas internas + quiz, tudo ou nada.
--
-- p_fields:  {title, objective, key_verse_ref, estimated_minutes, tags[], required, sensitive}
-- p_content: {blocks[], practice, reflection}   (vira uma nova linha em lesson_versions)
-- p_notes:   {pastoral_review_note, video_suggestion, draft_notice, button_suggestion}
-- p_quiz:    [{prompt, options{A,B,..}, correct_option, explanation}]
--
-- p_expected_version é a versão que a pessoa viu ao abrir o editor. Se outra pessoa salvou
-- no meio tempo, a função recusa (erro 40001) em vez de sobrescrever em silêncio.
------------------------------------------------------------------------------
create function public.save_lesson(
  p_lesson_id uuid,
  p_expected_version uuid,
  p_fields jsonb,
  p_content jsonb,
  p_notes jsonb,
  p_quiz jsonb,
  p_note text default null
)
returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_current uuid;
  v_version uuid;
  v_rows int;
  v_has_placeholders boolean;
begin
  if btrim(coalesce(p_fields ->> 'title', '')) = '' then
    raise exception 'o título é obrigatório' using errcode = '22023';
  end if;

  select current_version_id into v_current
  from public.lessons where id = p_lesson_id for update;
  if not found then
    raise exception 'lição não encontrada ou sem permissão para editá-la' using errcode = '42501';
  end if;
  if v_current is distinct from p_expected_version then
    raise exception 'conflito de edição: a lição foi alterada por outra pessoa' using errcode = '40001';
  end if;

  v_has_placeholders := (p_content::text || coalesce(p_notes::text, '')) like '%[PREENCHER%';

  insert into public.lesson_versions (lesson_id, content, author_id, note)
  values (p_lesson_id, p_content, (select auth.uid()), p_note)
  returning id into v_version;

  update public.lessons set
    title = btrim(p_fields ->> 'title'),
    objective = coalesce(p_fields ->> 'objective', ''),
    key_verse_ref = nullif(btrim(coalesce(p_fields ->> 'key_verse_ref', '')), ''),
    estimated_minutes = nullif(p_fields ->> 'estimated_minutes', '')::int,
    tags = coalesce(array(select jsonb_array_elements_text(coalesce(p_fields -> 'tags', '[]'::jsonb))), '{}'),
    required = coalesce((p_fields ->> 'required')::boolean, true),
    sensitive = coalesce((p_fields ->> 'sensitive')::boolean, false),
    current_version_id = v_version,
    has_placeholders = v_has_placeholders
  where id = p_lesson_id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'sem permissão para editar esta lição' using errcode = '42501';
  end if;

  insert into public.lesson_internal_notes
    (lesson_id, pastoral_review_note, video_suggestion, draft_notice, button_suggestion)
  values (
    p_lesson_id,
    nullif(p_notes ->> 'pastoral_review_note', ''),
    nullif(p_notes ->> 'video_suggestion', ''),
    nullif(p_notes ->> 'draft_notice', ''),
    nullif(p_notes ->> 'button_suggestion', '')
  )
  on conflict (lesson_id) do update set
    pastoral_review_note = excluded.pastoral_review_note,
    video_suggestion = excluded.video_suggestion,
    draft_notice = excluded.draft_notice,
    button_suggestion = excluded.button_suggestion;

  delete from public.quiz_questions where lesson_id = p_lesson_id;
  insert into public.quiz_questions (lesson_id, position, prompt, options, correct_option, explanation)
  select p_lesson_id, t.ord::int, q ->> 'prompt', q -> 'options', q ->> 'correct_option',
         coalesce(q ->> 'explanation', '')
  from jsonb_array_elements(coalesce(p_quiz, '[]'::jsonb)) with ordinality as t(q, ord);

  return v_version;
end
$$;

------------------------------------------------------------------------------
-- Criar uma lição vazia (rascunho) no fim de um ciclo. Devolve o slug.
------------------------------------------------------------------------------
create function public.create_lesson(p_cycle_id uuid, p_title text)
returns text
language plpgsql set search_path = ''
as $$
declare
  v_cycle_slug text;
  v_position int;
  v_slug text;
  v_lesson uuid;
  v_version uuid := gen_random_uuid();
begin
  if btrim(coalesce(p_title, '')) = '' then
    raise exception 'o título é obrigatório' using errcode = '22023';
  end if;

  select slug into v_cycle_slug from public.cycles where id = p_cycle_id;
  if not found then
    raise exception 'ciclo não encontrado' using errcode = 'P0002';
  end if;

  select coalesce(max(position), 0) + 1 into v_position from public.lessons where cycle_id = p_cycle_id;
  v_slug := v_cycle_slug || '-l' || lpad(v_position::text, 2, '0');
  if exists (select 1 from public.lessons where slug = v_slug) then
    v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 4);
  end if;

  insert into public.lessons (cycle_id, slug, title, position, status, current_version_id)
  values (p_cycle_id, v_slug, btrim(p_title), v_position, 'draft', v_version)
  returning id into v_lesson;

  insert into public.lesson_versions (id, lesson_id, content, author_id, note)
  values (v_version, v_lesson,
          '{"blocks": [], "practice": null, "reflection": null}'::jsonb,
          (select auth.uid()), 'Lição criada');

  return v_slug;
end
$$;

------------------------------------------------------------------------------
-- Restaurar uma versão antiga: cria uma versão NOVA com aquele conteúdo (o histórico só cresce).
------------------------------------------------------------------------------
create function public.restore_lesson_version(
  p_lesson_id uuid,
  p_version_id uuid,
  p_expected_version uuid
)
returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_current uuid;
  v_content jsonb;
  v_created timestamptz;
  v_version uuid;
  v_rows int;
  v_has_placeholders boolean;
begin
  select current_version_id into v_current
  from public.lessons where id = p_lesson_id for update;
  if not found then
    raise exception 'lição não encontrada ou sem permissão para editá-la' using errcode = '42501';
  end if;
  if v_current is distinct from p_expected_version then
    raise exception 'conflito de edição: a lição foi alterada por outra pessoa' using errcode = '40001';
  end if;

  select content, created_at into v_content, v_created
  from public.lesson_versions where id = p_version_id and lesson_id = p_lesson_id;
  if not found then
    raise exception 'versão não encontrada' using errcode = 'P0002';
  end if;

  v_has_placeholders := v_content::text like '%[PREENCHER%'
    or exists (select 1 from public.lesson_internal_notes n
               where n.lesson_id = p_lesson_id
                 and concat_ws(' ', n.pastoral_review_note, n.video_suggestion,
                               n.draft_notice, n.button_suggestion) like '%[PREENCHER%');

  insert into public.lesson_versions (lesson_id, content, author_id, note)
  values (p_lesson_id, v_content, (select auth.uid()),
          'Restaurada da versão de ' || to_char(v_created at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'))
  returning id into v_version;

  update public.lessons
  set current_version_id = v_version, has_placeholders = v_has_placeholders
  where id = p_lesson_id;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'sem permissão para editar esta lição' using errcode = '42501';
  end if;

  return v_version;
end
$$;

------------------------------------------------------------------------------
-- Reordenar: troca a lição com a vizinha de cima ou de baixo, dentro do ciclo.
-- SECURITY DEFINER porque mexe em duas linhas (a vizinha pode ser de outro status);
-- por isso as permissões são conferidas aqui: o editor só reordena rascunhos.
------------------------------------------------------------------------------
create function public.move_lesson(p_lesson_id uuid, p_direction text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  a record;
  b record;
begin
  if not public.is_editor_or_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
  if p_direction not in ('up', 'down') then
    raise exception 'direção inválida' using errcode = '22023';
  end if;

  select id, cycle_id, position, status, slug into a
  from public.lessons where id = p_lesson_id for update;
  if not found then
    raise exception 'lição não encontrada' using errcode = 'P0002';
  end if;

  if p_direction = 'up' then
    select id, position, status into b from public.lessons
    where cycle_id = a.cycle_id and position < a.position
    order by position desc limit 1 for update;
  else
    select id, position, status into b from public.lessons
    where cycle_id = a.cycle_id and position > a.position
    order by position asc limit 1 for update;
  end if;
  if not found then
    return; -- já está na ponta
  end if;

  if not public.is_admin()
     and (a.status not in ('draft', 'in_review') or b.status not in ('draft', 'in_review')) then
    raise exception 'só o administrador reordena lições publicadas ou arquivadas' using errcode = '42501';
  end if;

  -- position é único por ciclo: usa -1 como posição temporária durante a troca.
  update public.lessons set position = -1 where id = a.id;
  update public.lessons set position = a.position where id = b.id;
  update public.lessons set position = b.position where id = a.id;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'lesson_moved', 'lesson', a.id::text,
          jsonb_build_object('slug', a.slug, 'direction', p_direction));
end
$$;

revoke execute on function public.save_lesson(uuid, uuid, jsonb, jsonb, jsonb, jsonb, text) from public, anon;
revoke execute on function public.create_lesson(uuid, text) from public, anon;
revoke execute on function public.restore_lesson_version(uuid, uuid, uuid) from public, anon;
revoke execute on function public.move_lesson(uuid, text) from public, anon;
grant execute on function public.save_lesson(uuid, uuid, jsonb, jsonb, jsonb, jsonb, text) to authenticated;
grant execute on function public.create_lesson(uuid, text) to authenticated;
grant execute on function public.restore_lesson_version(uuid, uuid, uuid) to authenticated;
grant execute on function public.move_lesson(uuid, text) to authenticated;
