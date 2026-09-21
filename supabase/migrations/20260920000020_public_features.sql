-- 0020 Recursos visíveis antes do login (RF-31): a tela de login precisa saber se "Entrar com e-mail" está
-- ligado, mas app_settings só é legível por quem já entrou. Esta função devolve SÓ essa informação, sem
-- nenhum outro dado, e pode ser chamada sem login.

create function public.public_features()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('email_login', public.feature_enabled('feature.email_login'))
$$;
revoke execute on function public.public_features() from public;
grant execute on function public.public_features() to anon, authenticated;
