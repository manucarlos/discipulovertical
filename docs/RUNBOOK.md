# RUNBOOK: manter a plataforma funcionando

Documento vivo. Atualize sempre que uma conta, chave ou procedimento mudar.
**Nunca escreva senhas ou chaves aqui.** Registre só *onde* elas estão guardadas.

## 1. Onde ficam as contas

Preencha conforme criar (guia em [CONTAS.md](CONTAS.md)).

| Serviço | Para que serve | E-mail da conta | Quem tem acesso | Onde está a senha |
| --- | --- | --- | --- | --- |
| GitHub | Código do projeto | _a preencher_ | _a preencher_ | _gerenciador de senhas_ |
| Supabase | Banco de dados e login | _a preencher_ | _a preencher_ | _gerenciador de senhas_ |
| Google Cloud | Login com Google (OAuth) | _a preencher_ | _a preencher_ | _gerenciador de senhas_ |
| Vercel | Hospedagem do site | _a preencher_ | _a preencher_ | _gerenciador de senhas_ |
| Domínio | Endereço do site | _a preencher_ | _a preencher_ | _gerenciador de senhas_ |
| Resend (V2) | E-mails | _ainda não criado_ | | |
| Sentry (pós-piloto) | Alerta de erros | _ainda não criado_ | | |

**Acesso de emergência:** uma segunda pessoa de confiança deve ter acesso a **todas** as contas acima (decisão registrada no handoff). Nome: _a preencher_. Contato: _a preencher_.

## 2. Ambientes

| Ambiente | Para que serve | Banco |
| --- | --- | --- |
| Desenvolvimento | Seu computador, `npm run dev` | Projeto de homologação (ou um só, se o plano não permitir dois) |
| Homologação | Testar mudanças antes de ir ao ar | Supabase `…-homologacao` |
| Produção | O site que a igreja usa | Supabase `…-producao` |

## 3. Comandos do dia a dia

Na pasta do projeto:

| O que fazer | Comando |
| --- | --- |
| Rodar no seu computador | `npm run dev` (abre em <http://localhost:3000>) |
| Rodar todos os testes | `npm test` |
| Conferir tipos | `npm run typecheck` |
| Conferir estilo do código | `npm run lint` |
| Gerar a versão de produção | `npm run build` |
| Gerar o SQL de importação das lições | `npm run import:sql -- --cycle 1` |

Os testes incluem as **regras de acesso do banco** (quem pode ler e escrever o quê). Rode antes de qualquer mudança no banco.

## 4. Como publicar uma correção

1. Peça a mudança ao Claude e peça que ele rode `npm test` e `npm run build`.
2. Confirme que tudo passou.
3. Envie ao GitHub. A Vercel publica sozinha a cada alteração aprovada.
4. Abra o site e confira a tela que foi alterada.

## 5. Como mudar o banco de dados

1. O Claude cria um **novo arquivo** em `supabase/migrations/` (nunca edite um arquivo já aplicado).
2. Rode `npm test`.
3. Aplique primeiro na **homologação** (SQL Editor do Supabase), teste, e só depois na **produção**.

## 6. Primeiro administrador e promoções

- O primeiro Admin é definido pelo e-mail em `app_config` antes do primeiro login (CONTAS.md, Passo 2.5).
- Depois disso, só um Admin promove outro (tela de usuários, a construir). Toda promoção fica no log de auditoria.
- Se ninguém for Admin (por exemplo, entrou antes de configurar), rode no SQL Editor:

  ```sql
  update public.profiles set role = 'admin' where email = 'SEU-EMAIL@gmail.com';
  ```

## 6b. Ler e publicar lições enquanto o editor não existe

O painel de edição ainda não foi construído. Até lá:

- **Ler os rascunhos como o membro vê:** rode `npm run dev` e abra `http://localhost:3000/dev/licao/c1-l01` (troque o final por `c1-l02` etc.). Essas páginas usam os textos do handoff e só existem no seu computador; em produção dão erro 404.
- **Publicar depois de revisar** (SQL Editor do Supabase; troque a lista de lições):

  ```sql
  update public.lessons set status = 'published'
  where slug in ('c1-l01', 'c1-l02');
  ```

  Lições com `[PREENCHER]` o banco recusa publicar. Publique **só o que o pastor já revisou**; a publicação fica no log de auditoria.
- **Editar o texto** de uma lição ainda exige o editor. Enquanto isso, ajuste o `docs/HANDOFF.md` com o Claude **antes** de importar. A importação ignora lições que já existem, então, para trocar um rascunho ainda não publicado, peça ao Claude o procedimento.

## 7. Backup e restauração

_A definir com o pastor e conferir no plano contratado do Supabase:_

- [ ] Os backups automáticos do plano contratado (frequência e por quantos dias ficam guardados).
- [ ] Um teste de restauração **a cada trimestre**, em homologação. Registre a data aqui: _nunca feito_.
- [ ] Se o plano não incluir backup diário, agendar uma exportação manual do banco.

## 8. Incidente de segurança ou vazamento de dados

1. Não apague nada. Anote quando e como foi descoberto.
2. Avise o pastor e o encarregado de dados (DPO) imediatamente.
3. Troque as chaves e senhas envolvidas (Supabase, Google Cloud, Vercel).
4. Com o advogado, decida se é preciso comunicar os titulares e a ANPD (a LGPD prevê comunicação quando há risco relevante).

_Plano completo (quem avisa, em quanto tempo): a redigir com a revisão jurídica._

## 9. Serviços gratuitos e seus limites

Planos gratuitos podem **pausar projetos inativos**, limitar armazenamento e usuários. Antes do piloto, confira os limites atuais do plano contratado de cada serviço e anote aqui: _a preencher_.
