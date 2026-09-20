-- 0005 Guarda o "Botão sugerido" das lições (chamada para ação a implementar).
-- É material interno da equipe: a tabela lesson_internal_notes já é só da equipe (RLS da 0002).

alter table public.lesson_internal_notes add column button_suggestion text;
