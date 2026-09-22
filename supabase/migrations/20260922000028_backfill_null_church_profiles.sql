-- 0028 Conserta os perfis que ficaram sem igreja na janela quebrada entre as migrações 0026 e 0027 (achado
-- em produção: uma conta de teste criada nessa janela ficou com church_id nulo e, com o isolamento por
-- igreja, virou invisível até para o Admin — a ficha dela dava 404). A migração 0027 corrigiu o CADASTRO de
-- gente nova daqui para frente; esta aqui conserta quem já tinha ficado para trás. Como só existe uma
-- igreja hoje, todo mundo sem igreja é dela.
update public.profiles set church_id = (select id from public.churches where slug = 'vertical-church')
where church_id is null;
