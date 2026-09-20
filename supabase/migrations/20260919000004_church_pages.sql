-- 0004 "Nossa Igreja" (RF-15): páginas editáveis pelo Admin, legíveis por qualquer pessoa logada.
-- Tabela não prevista na seção 8 do handoff; necessária para o conteúdo editável.

create table public.church_pages (
  slug text primary key,
  title text not null,
  body text not null default '',            -- Markdown simples
  position int not null default 0,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.church_pages enable row level security;

revoke all on public.church_pages from anon, authenticated;
grant select, insert, update, delete on public.church_pages to authenticated;

create policy church_pages_read on public.church_pages
  for select to authenticated using (true);
create policy church_pages_admin_write on public.church_pages
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Textos transcritos dos cartazes da igreja (handoff 0.2). O pastor deve confirmar a fidelidade.
-- Páginas sem texto oficial ainda ficam vazias: nada é inventado.
insert into public.church_pages (slug, title, body, position) values
  ('vision', 'Nossa visão',
   'Ser uma igreja relevante, influente, estabelecendo o Reino de Deus em todas as esferas da sociedade através do serviço e discipulado.', 1),
  ('mission', 'Nossa missão',
   'Levar pessoas a um encontro genuíno com Jesus, trazendo salvação, libertação, cura e restauração para suas famílias.', 2),
  ('mission-fulfilment', 'Como cumprimos a missão',
   'Fazemos isso por meio de conexões genuínas em pequenos grupos, do discipulado intencional e do ensino transformador da Palavra de Deus, capacitando cada pessoa a viver e compartilhar o evangelho.', 3),
  ('values', 'Nossos valores', '', 4),
  ('history', 'Nossa história', '', 5),
  ('ministries', 'Ministérios', '', 6);
