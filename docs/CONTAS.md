# Passo a passo: criar as contas e ligar o login

Este guia é para o pastor. Você faz cada passo; o Claude acompanha e tira dúvidas.

**Regras de ouro**

- **Nunca cole senhas, chaves ou segredos no chat.** Se algum passo pedir para "copiar uma chave", cole só no lugar indicado (o campo do site, ou o arquivo `.env.local` no seu computador).
- Use **um e-mail da igreja** para as contas (por exemplo `tecnologia@…`), não o pessoal. Assim a igreja não perde o acesso se alguém sair.
- Ative a **verificação em duas etapas** em todas as contas.
- Anote cada conta na tabela do [RUNBOOK](RUNBOOK.md).

**O que o MVP precisa:** GitHub, Supabase, Google Cloud e Vercel. O **Resend** (e-mails) só é necessário na V2 e o **Sentry** (monitoramento de erros) depois do piloto. Não crie agora.

> Os planos gratuitos e seus limites mudam. Confira a página de preços de cada serviço antes de contratar.

---

## Passo 1. GitHub (guarda o código)

1. Entre em <https://github.com> e crie a conta (ou use a da igreja).
2. Crie uma organização ou um repositório **privado** chamado `vertical-discipulado`.
3. Avise o Claude quando estiver pronto. Ele conecta a pasta do projeto a esse repositório, com a sua confirmação.

## Passo 2. Supabase (banco de dados e login)

1. Entre em <https://supabase.com> e crie a conta.
2. Crie uma **organização** e, dentro dela, o projeto **`vertical-discipulado-producao`**:
   - Região: **South America (São Paulo)**.
   - Crie uma **senha do banco** forte e guarde no gerenciador de senhas. Você raramente vai usá-la.
3. Depois, crie um segundo projeto, **`vertical-discipulado-homologacao`**, para testar mudanças antes de ir ao ar. (Se o plano gratuito não permitir dois projetos, comece só com o de produção e avise o Claude.)
4. Em cada projeto, aplique o banco de dados:
   1. Abra **SQL Editor > New query**.
   2. Abra o arquivo `supabase/migrations/20260919000001_base.sql`, copie **todo** o conteúdo, cole no editor e clique em **Run**. Deve aparecer "Success".
   3. Repita, **nesta ordem**, com os arquivos `…000002_content.sql`, `…000003_progress.sql`, `…000004_church_pages.sql` e `…000005_lesson_button_suggestion.sql`.
5. **Defina quem é o primeiro Administrador, antes de entrar pela primeira vez.** No SQL Editor, rode (troque pelo e-mail Google que você vai usar para entrar):

   ```sql
   insert into public.app_config (key, value)
   values ('initial_admin_email', 'SEU-EMAIL@gmail.com');
   ```

   Quem entrar com esse e-mail vira Admin automaticamente. Se você entrar antes de rodar isto, avise o Claude: dá para corrigir.
6. Anote, em **Project Settings > API**, o **Project URL** e a chave **Publishable** (começa com `sb_publishable_`). São essas que vão no `.env.local` (Passo 5). **Não use** a chave `secret` / `service_role` em lugar nenhum por enquanto.

### Passo 2b. Colocar o conteúdo do Ciclo 1 no banco

Os textos das lições já estão escritos (Parte 2 do [handoff](HANDOFF.md)). Para levá-los ao banco, **sem nenhuma chave**:

1. Peça ao Claude para gerar o arquivo, ou rode na pasta do projeto: `npm run import:sql -- --cycle 1`. Ele cria `content/generated/ciclo-1.sql` e lista as 8 lições.
2. Abra o arquivo, copie **todo** o conteúdo e cole em **SQL Editor > New query** do Supabase. Clique em **Run**.
3. No final aparece uma tabela com as 8 lições, todas como `draft` (rascunho). Nenhum membro vê rascunhos.

É seguro repetir: o que já existe é ignorado, então suas edições nunca são sobrescritas. Para os Ciclos 2 e 3, use `--cycle 2` e `--cycle 3` (as lições do Ciclo 3 com `[PREENCHER]` entram, mas ficam **impedidas de publicar** até você preencher os dados da igreja).

## Passo 3. Google Cloud (o botão "Entrar com Google")

1. Entre em <https://console.cloud.google.com> com a conta da igreja e crie um projeto chamado `vertical-discipulado`.
2. Abra **Google Auth Platform** (ou **APIs e serviços > Tela de permissão OAuth**) e configure:
   - Nome do app: **Discipulado Vertical Church**.
   - E-mail de suporte: o e-mail da igreja.
   - Público: **Externo**.
   - Escopos: apenas os básicos (**email**, **profile**, **openid**). Não adicione outros.
3. **Publique o app** ("Em produção"). Importante: em modo de teste o Google limita o número de pessoas que conseguem entrar, e o login de novos convertidos falharia.
4. Em **Clientes** (ou **Credenciais > Criar credenciais > ID do cliente OAuth**), crie um cliente do tipo **Aplicativo da Web**. Ainda **não** preencha as URLs de redirecionamento. Deixe a página aberta e vá ao Passo 4.

## Passo 4. Ligar o Google ao Supabase

1. No Supabase, abra **Authentication > Sign In / Providers > Google** e ative.
2. Copie o **Callback URL** que o Supabase mostra ali (algo como `https://xxxx.supabase.co/auth/v1/callback`).
3. Volte ao Google Cloud e cole esse endereço em **URIs de redirecionamento autorizados** do cliente OAuth. Salve.
4. O Google mostra o **ID do cliente** e a **chave secreta do cliente**. Cole os dois **direto nos campos do Supabase** (Client ID e Client Secret) e salve. Não os envie a ninguém.
5. Em **Authentication > URL Configuration** do Supabase:
   - **Site URL:** o endereço do site (no começo, `http://localhost:3000`; depois troque pelo endereço da Vercel ou do domínio).
   - **Redirect URLs:** adicione `http://localhost:3000/auth/callback` e, quando existir, `https://SEU-SITE/auth/callback`.

## Passo 5. Testar no seu computador

1. Na pasta do projeto, copie `.env.example` para `.env.local` e preencha o `NEXT_PUBLIC_SUPABASE_URL` e o `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Passo 2.6).
2. Rode `npm run dev` e abra <http://localhost:3000>.
3. Clique em **Entrar com Google**. Você deve cair na tela "Que bom ter você aqui" (onboarding).
4. Confira no Supabase, em **Table Editor > profiles**, que seu perfil existe com `role = admin`.

## Passo 6. Vercel (coloca o site no ar)

1. Entre em <https://vercel.com> com a conta do GitHub.
2. **Add New > Project**, escolha o repositório `vertical-discipulado`.
3. Em **Environment Variables**, adicione as duas variáveis do Passo 5 (`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) com os valores do projeto de **produção**.
4. Clique em **Deploy**. Depois, volte ao Passo 4.5 e coloque o endereço novo em Site URL e Redirect URLs.

## Passo 7. Domínio (pode vir depois)

Escolha o endereço (por exemplo `discipulado.suaigreja.com.br`) e avise o Claude. Ele guia a configuração na Vercel e no provedor do domínio.

---

## Além das contas: o que a igreja precisa providenciar

Estes itens andam em paralelo e **não dependem de código**. Veja o detalhamento na [Parte 3 do handoff](HANDOFF.md).

- Pedir a **autorização por escrito** aos titulares da NVI e da NTLH.
- Contratar a **revisão jurídica** dos Termos de Uso e da Política de Privacidade (a plataforma trata convicção religiosa, dado sensível na LGPD).
- Designar o **encarregado de dados (DPO)** e um **segundo administrador** de confiança para acesso de emergência.
- Enviar **logotipo e cores oficiais**.
- Enviar os **textos da igreja** (história, valores, declaração de fé, liderança, ministérios, membresia), que hoje aparecem como `[PREENCHER]` no Ciclo 3.
