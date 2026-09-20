-- 0012 Painel de indicadores (seção 11 do handoff).
--
-- content_metrics()   por lição: quantas pessoas iniciaram, concluíram e pararam nela.
--                     SEM dados pessoais: o Editor também vê (o handoff diz que ele só vê métricas de conteúdo).
-- admin_dashboard()   indicadores das pessoas e da trilha. Só o Admin.
--
-- Tudo conta apenas MEMBROS e cuidadores: a equipe (Admin e Editor) não entra nos números, senão quem
-- testa o sistema distorceria a taxa de conclusão e o "parado".

create function public.content_metrics()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_editor_or_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'slug', x.slug,
        'title', x.title,
        'cycle_slug', x.cycle_slug,
        'cycle_position', x.cycle_position,
        'position', x.position,
        'started', x.started,
        'completed', x.completed,
        -- Pararam AQUI: começaram a lição e não voltam há 14 dias ou mais.
        'stalled_here', x.stalled_here
      )
      order by x.cycle_position, x.position
    )
    from (
      select
        l.slug, l.title, c.slug as cycle_slug, c.position as cycle_position, l.position,
        count(lp.user_id)::int as started,
        count(lp.user_id) filter (where lp.status = 'completed')::int as completed,
        count(lp.user_id) filter (
          where lp.status = 'in_progress' and lp.updated_at < now() - interval '14 days'
        )::int as stalled_here
      from public.lessons l
      join public.cycles c on c.id = l.cycle_id and c.active
      left join public.lesson_progress lp on lp.lesson_id = l.id
      left join public.profiles p on p.id = lp.user_id
      where l.status = 'published'
        and (lp.user_id is null or p.role in ('member', 'caregiver'))
      group by l.id, c.id
    ) x
  ), '[]'::jsonb);
end
$$;

create function public.admin_dashboard(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_members int;
  v_new int;
  v_situations jsonb;
  v_start jsonb;
  v_cycles jsonb;
  v_vision jsonb;
begin
  if not public.is_admin() then
    raise exception 'não autorizado' using errcode = '42501';
  end if;

  select count(*)::int into v_members from public.profiles where role in ('member', 'caregiver');

  select count(*)::int into v_new
  from public.profiles
  where role in ('member', 'caregiver') and created_at >= now() - make_interval(days => v_days);

  -- Situação de cada pessoa: a mesma função da lista de pessoas.
  select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb) into v_situations
  from (
    select status, count(*)::int as n
    from public.member_situation()
    where role in ('member', 'caregiver')
    group by status
  ) s;

  -- "Início em 7 dias": entre quem chegou no período (e já teve 7 dias para começar), quantos
  -- concluíram a primeira lição dentro desses 7 dias.
  select jsonb_build_object(
    'eligible', count(*)::int,
    'started', (count(*) filter (where exists (
      select 1 from public.lesson_progress lp
      where lp.user_id = p.id and lp.status = 'completed'
        and lp.completed_at <= p.created_at + interval '7 days'
    )))::int
  ) into v_start
  from public.profiles p
  where p.role in ('member', 'caregiver')
    and p.created_at >= now() - make_interval(days => v_days)
    and p.created_at <= now() - interval '7 days';

  -- Por ciclo: quem começou, quem concluiu (todas as obrigatórias) e quanto tempo levou.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'slug', r.slug, 'title', r.title, 'position', r.position,
      'required_total', r.required_total,
      'started_members', r.started_members,
      'completed_members', r.completed_members,
      'avg_days', r.avg_days
    ) order by r.position
  ), '[]'::jsonb) into v_cycles
  from (
    select
      c.slug, c.title, c.position,
      req.required_total,
      count(pu.user_id)::int as started_members,
      (count(pu.user_id) filter (where pu.done_required >= req.required_total))::int as completed_members,
      round((avg(extract(epoch from (pu.last_done - pu.first_start)) / 86400.0)
             filter (where pu.done_required >= req.required_total))::numeric, 1) as avg_days
    from public.cycles c
    join (
      select l.cycle_id, count(*)::int as required_total
      from public.lessons l where l.status = 'published' and l.required group by l.cycle_id
    ) req on req.cycle_id = c.id
    left join (
      select
        l.cycle_id, lp.user_id,
        count(*) filter (where l.required and lp.status = 'completed') as done_required,
        min(lp.started_at) as first_start,
        max(lp.completed_at) filter (where l.required and lp.status = 'completed') as last_done
      from public.lesson_progress lp
      join public.lessons l on l.id = lp.lesson_id and l.status = 'published'
      join public.profiles p on p.id = lp.user_id and p.role in ('member', 'caregiver')
      group by l.cycle_id, lp.user_id
    ) pu on pu.cycle_id = c.id
    where c.active
    group by c.id, req.required_total
  ) r;

  -- RN-12: "conhece a visão" = concluiu todas as lições com a etiqueta "visão".
  select jsonb_build_object(
    'lessons', (select count(*)::int from public.lessons l join public.cycles c on c.id = l.cycle_id
                where l.status = 'published' and c.active and 'visão' = any(l.tags)),
    'members_knowing', (
      select count(*)::int from (
        select lp.user_id
        from public.lesson_progress lp
        join public.lessons l on l.id = lp.lesson_id and l.status = 'published' and 'visão' = any(l.tags)
        join public.cycles c on c.id = l.cycle_id and c.active
        join public.profiles p on p.id = lp.user_id and p.role in ('member', 'caregiver')
        where lp.status = 'completed'
        group by lp.user_id
        having count(*) = (select count(*) from public.lessons l2 join public.cycles c2 on c2.id = l2.cycle_id
                           where l2.status = 'published' and c2.active and 'visão' = any(l2.tags))
      ) k
    ),
    'members_total', (select count(*)::int from public.profiles
                      where role in ('member', 'caregiver') and onboarded_at is not null)
  ) into v_vision;

  return jsonb_build_object(
    'generated_at', now(),
    'period_days', v_days,
    'members_total', v_members,
    'new_in_period', v_new,
    'start_within_7_days', v_start,
    'situations', v_situations,
    'cycles', v_cycles,
    'lessons', public.content_metrics(),
    'vision', v_vision
  );
end
$$;

revoke execute on function public.content_metrics() from public, anon;
revoke execute on function public.admin_dashboard(int) from public, anon;
grant execute on function public.content_metrics() to authenticated;
grant execute on function public.admin_dashboard(int) to authenticated;
