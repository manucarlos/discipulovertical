-- 0024 Formulário de feedback do piloto (RF-32): uma página pública, sem login, para o testador contar como foi.
--
-- Público de propósito: quem não consegue nem entrar precisa conseguir avisar. Para isso não ser um convite a
-- abuso, o formulário nasce DESLIGADO (chave feature.feedback) e:
--   - ninguém grava direto na tabela: só pela função submit_feedback, que confere a chave, o formato e um
--     limite de 30 respostas por hora;
--   - só o Admin lê e apaga as respostas (RLS).

-- A chave nova precisa constar na lista de chaves conhecidas.
alter table public.app_settings drop constraint app_settings_known_keys;
alter table public.app_settings add constraint app_settings_known_keys check (
  key in (
    'church.name', 'church.contact_email',
    'feature.quiz', 'feature.reflections', 'feature.video', 'feature.reminders', 'feature.caregivers',
    'feature.closures', 'feature.certificates', 'feature.groups', 'feature.gamification', 'feature.email_login',
    'feature.feedback'
  )
);
insert into public.app_settings (key, value) values ('feature.feedback', 'false');

create table public.feedback_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  device text not null check (device in ('android', 'iphone', 'computador', 'outro')),
  entered text not null check (entered in ('sim', 'com_dificuldade', 'nao')),
  lesson_done text not null check (lesson_done in ('sim', 'em_parte', 'nao', 'nao_cheguei')),
  ease smallint not null check (ease between 1 and 5),
  alone text not null check (alone in ('sim', 'com_ajuda', 'nao')),
  liked text check (char_length(liked) between 1 and 1000),
  confusing text check (char_length(confusing) between 1 and 1000),
  suggestion text check (char_length(suggestion) between 1 and 1000),
  contact_name text check (char_length(contact_name) between 1 and 80),
  contact text check (char_length(contact) between 1 and 120)
);
create index feedback_responses_created_idx on public.feedback_responses (created_at desc);
alter table public.feedback_responses enable row level security;

revoke all on public.feedback_responses from anon, authenticated;
grant select, delete on public.feedback_responses to authenticated;

create policy feedback_admin_read on public.feedback_responses
  for select to authenticated using (public.is_admin());
create policy feedback_admin_delete on public.feedback_responses
  for delete to authenticated using (public.is_admin());

-- Único caminho de escrita. Textos vazios viram nulo; o tamanho é conferido pelas restrições da tabela.
create function public.submit_feedback(
  p_device text,
  p_entered text,
  p_lesson_done text,
  p_ease int,
  p_alone text,
  p_liked text,
  p_confusing text,
  p_suggestion text,
  p_contact_name text,
  p_contact text
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.feature_enabled('feature.feedback') then
    raise exception 'O formulário de feedback está fechado no momento.' using errcode = 'P0001';
  end if;

  if (select count(*) from public.feedback_responses where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Recebemos muitas respostas agora. Tente de novo daqui a pouco.' using errcode = 'P0001';
  end if;

  insert into public.feedback_responses
    (device, entered, lesson_done, ease, alone, liked, confusing, suggestion, contact_name, contact)
  values (
    p_device, p_entered, p_lesson_done, p_ease, p_alone,
    nullif(btrim(p_liked), ''), nullif(btrim(p_confusing), ''), nullif(btrim(p_suggestion), ''),
    nullif(btrim(p_contact_name), ''), nullif(btrim(p_contact), '')
  );
end
$$;
revoke execute on function public.submit_feedback(text, text, text, int, text, text, text, text, text, text) from public;
grant execute on function public.submit_feedback(text, text, text, int, text, text, text, text, text, text) to anon, authenticated;

-- A página pública precisa saber se o formulário está aberto (app_settings só é legível por quem entrou).
create or replace function public.public_features()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'email_login', public.feature_enabled('feature.email_login'),
    'feedback', public.feature_enabled('feature.feedback')
  )
$$;
