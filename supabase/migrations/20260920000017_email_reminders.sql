-- 0017 Lembretes por e-mail (RF-16, seção 10 do handoff).
--
-- Como funciona sem a chave secreta do Supabase no site:
--   * Um serviço de agendamento chama, de tempos em tempos, a rota /api/cron/lembretes do site
--     (Authorization: Bearer <CRON_SECRET>).
--   * A rota conversa com o banco só pelas 3 funções cron_* abaixo, que exigem o mesmo segredo
--     (guardado no banco só como hash, em app_config 'cron_secret_hash'; veja docs/CONTAS.md).
--     Quem tem o segredo lê o necessário para montar os avisos e registra o que enviou; nada mais.
--   * As regras (consentimento, 8h às 20h, no máximo 2 lembretes por semana, cancelar se a pessoa
--     voltou) ficam no planejador do site (src/lib/reminders) e, para o limite semanal, também aqui.
--   * O descadastro em um clique usa um código por pessoa (nunca o e-mail) e não exige login.

------------------------------------------------------------------------------
-- Textos dos e-mails (editáveis pelo Admin)
------------------------------------------------------------------------------
create table public.email_templates (
  kind text primary key check (kind in (
    'welcome', 'new_lesson', 'nudge_3d', 'nudge_7d', 'stalled_alert', 'cycle_completed', 'weekly_summary'
  )),
  subject text not null check (char_length(btrim(subject)) between 1 and 150),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.email_templates enable row level security;
revoke all on public.email_templates from anon, authenticated;
grant select, update (subject, body) on public.email_templates to authenticated;
create policy email_templates_admin_read on public.email_templates
  for select to authenticated using (public.is_admin());
create policy email_templates_admin_update on public.email_templates
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create function public.email_templates_stamp()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'email_template_updated', 'email_template', new.kind, '{}'::jsonb);
  return new;
end
$$;
revoke execute on function public.email_templates_stamp() from public, anon, authenticated;
create trigger email_templates_stamp before update on public.email_templates
  for each row execute function public.email_templates_stamp();

-- Variáveis: {{nome}} {{igreja}} {{licao}} {{ciclo}} {{link}} {{resumo}} {{membro}}.
-- O rodapé com o link para desligar os lembretes é sempre acrescentado pelo site.
insert into public.email_templates (kind, subject, body) values
  ('welcome',
   'Que bom ter você aqui, {{nome}}',
   E'Olá, {{nome}}!\n\nQue alegria ter você na trilha de discipulado da {{igreja}}. Cada passo é dado no seu ritmo, e não há pressa.\n\nQuando quiser começar, sua primeira lição está aqui:\n{{link}}\n\nDeus abençoe sua caminhada.'),
  ('new_lesson',
   'Sua próxima lição está disponível',
   E'Olá, {{nome}}!\n\nUma nova lição foi liberada para você: "{{licao}}" ({{ciclo}}).\n\nQuando tiver um tempinho, ela está esperando por você:\n{{link}}\n\nSem pressa. Ela fica aqui.'),
  ('nudge_3d',
   'Sentimos sua falta, {{nome}}',
   E'Olá, {{nome}}!\n\nFaz alguns dias que você não passa por aqui. Tudo bem: a vida às vezes aperta. Se quiser retomar, a lição "{{licao}}" continua no mesmo lugar:\n{{link}}\n\nEstamos torcendo por você.'),
  ('nudge_7d',
   'Estamos orando por você, {{nome}}',
   E'Olá, {{nome}}!\n\nNa última semana não nos vimos por aqui, e quisemos apenas dizer que você faz falta e que estamos orando por você. Sua trilha está do jeito que você deixou, e você pode voltar quando se sentir à vontade:\n{{link}}\n\nSe houver algo em que possamos ajudar, é só responder este e-mail.'),
  ('stalled_alert',
   '{{membro}} está há mais de 14 dias sem ler',
   E'Olá, {{nome}}!\n\n{{membro}} está há mais de 14 dias sem acessar a trilha. Um contato pessoal costuma ajudar mais do que qualquer lembrete: uma mensagem, uma ligação, um café.\n\nVeja o alerta e registre como foi o contato:\n{{link}}'),
  ('cycle_completed',
   'Parabéns por concluir o ciclo, {{nome}}!',
   E'Olá, {{nome}}!\n\nVocê concluiu o ciclo "{{ciclo}}". Que caminhada bonita! Em breve a liderança vai convidar você para o encerramento presencial, para celebrarmos juntos.\n\nVeja sua trilha:\n{{link}}'),
  ('weekly_summary',
   'Resumo da semana dos seus membros',
   E'Olá, {{nome}}!\n\nAssim foi a semana dos membros que estão com você:\n\n{{resumo}}\n\nVeja os detalhes e quem precisa de um contato:\n{{link}}');

------------------------------------------------------------------------------
-- Registro de notificações
------------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'welcome', 'new_lesson', 'nudge_3d', 'nudge_7d', 'stalled_alert', 'cycle_completed', 'weekly_summary'
  )),
  channel text not null default 'email' check (channel = 'email'),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  -- Identifica a "ocorrência": a mesma lição, o mesmo alerta, a mesma semana. Sem repetir o aviso.
  dedupe_key text not null,
  subject text not null,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  error text check (error is null or char_length(error) <= 300),
  created_at timestamptz not null default now(),
  unique (user_id, kind, dedupe_key)
);
create index notifications_user_recent_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated; -- gravar só pelas funções cron_*
create policy notifications_admin_read on public.notifications
  for select to authenticated using (public.is_admin());

-- Código de descadastro: um por pessoa, lido só pelas funções do banco.
create table public.email_unsubscribe_tokens (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token uuid not null unique default gen_random_uuid()
);
alter table public.email_unsubscribe_tokens enable row level security;
revoke all on public.email_unsubscribe_tokens from anon, authenticated;

------------------------------------------------------------------------------
-- Segredo do agendador
------------------------------------------------------------------------------
create function public.check_cron_secret(p_secret text)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if coalesce(p_secret, '') = '' or not exists (
    select 1 from public.app_config
    where key = 'cron_secret_hash'
      and value = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')
  ) then
    raise exception 'não autorizado' using errcode = '42501';
  end if;
end
$$;
revoke execute on function public.check_cron_secret(text) from public, anon, authenticated;

-- Tudo o que o planejador precisa saber, numa consulta só. Só quem tem o segredo lê.
create function public.cron_snapshot(p_secret text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.check_cron_secret(p_secret);

  if not public.feature_enabled('feature.reminders') then
    return jsonb_build_object('enabled', false);
  end if;

  select jsonb_build_object(
    'enabled', true,
    'caregivers_enabled', public.feature_enabled('feature.caregivers'),
    'church', jsonb_build_object(
      'name', coalesce((select value #>> '{}' from public.app_settings where key = 'church.name'), 'Vertical Church'),
      'contact_email', coalesce((select value #>> '{}' from public.app_settings where key = 'church.contact_email'), '')
    ),
    -- Só quem aceitou lembretes por e-mail e não revogou.
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.member_id, 'name', s.display_name, 'email', s.email, 'role', s.role,
        'onboarded_at', s.onboarded_at, 'last_activity_at', s.last_activity_at, 'status', s.status))
      from public.member_situation_core() s
      where s.onboarded_at is not null
        and exists (select 1 from public.consents c
                    where c.user_id = s.member_id and c.purpose = 'email_reminders' and c.revoked_at is null)
    ), '[]'::jsonb),
    'cycles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'title', c.title, 'position', c.position,
        'release_interval_days', c.release_interval_days, 'max_lessons_per_week', c.max_lessons_per_week))
      from public.cycles c where c.active
    ), '[]'::jsonb),
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'cycle_id', l.cycle_id, 'slug', l.slug, 'title', l.title, 'position', l.position, 'required', l.required))
      from public.lessons l join public.cycles c on c.id = l.cycle_id
      where l.status = 'published' and c.active
    ), '[]'::jsonb),
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', lp.user_id, 'lesson_id', lp.lesson_id, 'released_at', lp.released_at,
        'started_at', lp.started_at, 'completed_at', lp.completed_at))
      from public.lesson_progress lp
      where exists (select 1 from public.consents c
                    where c.user_id = lp.user_id and c.purpose = 'email_reminders' and c.revoked_at is null)
    ), '[]'::jsonb),
    'cycle_progress', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', cp.user_id, 'cycle_id', cp.cycle_id, 'completed_at', cp.completed_at))
      from public.cycle_progress cp
      where cp.status = 'completed'
        and exists (select 1 from public.consents c
                    where c.user_id = cp.user_id and c.purpose = 'email_reminders' and c.revoked_at is null)
    ), '[]'::jsonb),
    'sent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', n.user_id, 'kind', n.kind, 'dedupe_key', n.dedupe_key, 'status', n.status, 'created_at', n.created_at))
      from public.notifications n where n.created_at > now() - interval '60 days'
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object('member_id', a.member_id, 'caregiver_id', a.caregiver_id))
      from public.care_assignments a where a.active
    ), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(jsonb_build_object('id', al.id, 'member_id', al.member_id, 'member_name', p.display_name, 'opened_at', al.opened_at))
      from public.care_alerts al join public.profiles p on p.id = al.member_id
      where al.status <> 'resolved'
    ), '[]'::jsonb),
    -- Números da semana de cada cuidador, sem nomes: quem está ativo, quem parou, quantas lições foram concluídas.
    'summaries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'caregiver_id', x.caregiver_id, 'members', x.members, 'active', x.active,
        'stalled', x.stalled, 'completed_lessons', x.completed_lessons))
      from (
        select a.caregiver_id,
               count(*)::int as members,
               count(*) filter (where s.last_activity_at > now() - interval '7 days')::int as active,
               count(*) filter (where s.status = 'stalled')::int as stalled,
               coalesce(sum((select count(*) from public.lesson_progress lp
                             where lp.user_id = a.member_id and lp.status = 'completed'
                               and lp.completed_at > now() - interval '7 days')), 0)::int as completed_lessons
        from public.care_assignments a
        join public.member_situation_core() s on s.member_id = a.member_id
        where a.active
        group by a.caregiver_id
      ) x
    ), '[]'::jsonb),
    'templates', coalesce((select jsonb_agg(jsonb_build_object('kind', t.kind, 'subject', t.subject, 'body', t.body)) from public.email_templates t), '[]'::jsonb),
    'admins', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'email', p.email))
      from public.profiles p
      where p.role = 'admin' and p.onboarded_at is not null
        and exists (select 1 from public.consents c
                    where c.user_id = p.id and c.purpose = 'email_reminders' and c.revoked_at is null)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end
$$;
revoke execute on function public.cron_snapshot(text) from public;
grant execute on function public.cron_snapshot(text) to anon, authenticated;

-- Grava as mensagens que serão enviadas agora. Repetir o mesmo aviso (mesma ocorrência) é ignorado (exceto
-- reenviar um que falhou nos últimos 2 dias), e o
-- limite de 2 lembretes por semana é conferido de novo aqui, mesmo que o planejador erre.
-- p_items: [{"user_id": "...", "kind": "...", "dedupe_key": "...", "subject": "..."}]
-- Devolve só o que entrou, com o e-mail e o código de descadastro de cada pessoa.
create function public.cron_enqueue(p_secret text, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_out jsonb := '[]'::jsonb;
  v_user uuid;
  v_kind text;
  v_token uuid;
  v_email text;
begin
  perform public.check_cron_secret(p_secret);
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Lista de mensagens inválida.' using errcode = 'P0001';
  end if;
  if not public.feature_enabled('feature.reminders') then
    return v_out;
  end if;
  perform pg_advisory_xact_lock(hashtext('cron_enqueue'));

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_user := (v_item ->> 'user_id')::uuid;
    v_kind := v_item ->> 'kind';

    -- Só para quem ainda tem o consentimento ligado.
    if not exists (select 1 from public.consents c
                   where c.user_id = v_user and c.purpose = 'email_reminders' and c.revoked_at is null) then
      continue;
    end if;
    -- No máximo 2 lembretes (avisos de lição e convites para voltar) a cada 7 dias.
    if v_kind in ('new_lesson', 'nudge_3d', 'nudge_7d') and (
         select count(*) from public.notifications n
         where n.user_id = v_user and n.kind in ('new_lesson', 'nudge_3d', 'nudge_7d')
           and n.status in ('pending', 'sent') and n.created_at > now() - interval '7 days'
       ) >= 2 then
      continue;
    end if;

    insert into public.notifications (user_id, kind, dedupe_key, subject)
    values (v_user, v_kind, v_item ->> 'dedupe_key', left(v_item ->> 'subject', 150))
    on conflict (user_id, kind, dedupe_key) do update
      set status = 'pending', error = null, scheduled_for = now()
      where public.notifications.status = 'failed' and public.notifications.created_at > now() - interval '2 days'
    returning id into v_id;
    if v_id is null then
      continue;
    end if;

    insert into public.email_unsubscribe_tokens (user_id) values (v_user) on conflict (user_id) do nothing;
    select t.token into v_token from public.email_unsubscribe_tokens t where t.user_id = v_user;
    select p.email into v_email from public.profiles p where p.id = v_user;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', v_id, 'user_id', v_user, 'kind', v_kind, 'dedupe_key', v_item ->> 'dedupe_key',
      'email', v_email, 'unsubscribe_token', v_token));
    v_id := null;
  end loop;

  return v_out;
end
$$;
revoke execute on function public.cron_enqueue(text, jsonb) from public;
grant execute on function public.cron_enqueue(text, jsonb) to anon, authenticated;

-- Anota o resultado do envio.
create function public.cron_report(p_secret text, p_id uuid, p_status text, p_error text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.check_cron_secret(p_secret);
  if p_status not in ('sent', 'failed') then
    raise exception 'Situação inválida.' using errcode = '22023';
  end if;
  update public.notifications
  set status = p_status,
      sent_at = case when p_status = 'sent' then now() else null end,
      error = case when p_status = 'failed' then left(coalesce(p_error, 'erro desconhecido'), 300) else null end
  where id = p_id and status = 'pending';
end
$$;
revoke execute on function public.cron_report(text, uuid, text, text) from public;
grant execute on function public.cron_report(text, uuid, text, text) to anon, authenticated;

------------------------------------------------------------------------------
-- Descadastro em um clique (sem login): usa o código do e-mail, nunca o endereço.
------------------------------------------------------------------------------
create function public.unsubscribe_email(p_token uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
  v_changed int;
begin
  select t.user_id into v_user from public.email_unsubscribe_tokens t where t.token = p_token;
  if v_user is null then
    return false;
  end if;
  update public.consents set revoked_at = now()
  where user_id = v_user and purpose = 'email_reminders' and revoked_at is null;
  get diagnostics v_changed = row_count;
  if v_changed > 0 then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values (null, 'email_unsubscribed', 'profile', v_user::text, '{}'::jsonb);
  end if;
  return true;
end
$$;
revoke execute on function public.unsubscribe_email(uuid) from public;
grant execute on function public.unsubscribe_email(uuid) to anon, authenticated;
