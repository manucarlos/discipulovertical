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
   3. Repita, **nesta ordem**, com todos os outros arquivos da pasta `supabase/migrations` (a ordem é a do nome do arquivo):
      `…000002_content`, `…000003_progress`, `…000004_church_pages`, `…000005_lesson_button_suggestion`,
      `…000006_lesson_editor`, `20260920000007_member_overview`, `…000008_tighten_function_privileges`,
      `…000009_delete_my_account`, `…000010_member_situation`, `…000011_church_pages_audit`, `…000012_dashboard`,
      `…000013_search_and_access_log`, `…000014_app_settings`, `…000015_quiz_and_reflections`, `…000016_caregivers`,
      `…000017_email_reminders`, `…000018_closures_certificates`, `…000019_export_log`, `…000020_public_features`,
      `…000021_groups` e `…000022_group_roster`
      (são **22 arquivos** no total; a ordem é a do nome). Se algum der erro, **pare e avise o Claude**: não pule nenhum.
      As migrações 14 em diante criam os recursos além do MVP, que **nascem desligados**: aplicá-las não muda nada para as pessoas.
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
4. Para revisar e publicar, use o painel **Conteúdo** do app (veja o [RUNBOOK](RUNBOOK.md), seção 6b).

É seguro repetir: o que já existe é ignorado, então suas edições nunca são sobrescritas. Para os Ciclos 2 e 3, use `--cycle 2` e `--cycle 3` (as lições do Ciclo 3 com `[PREENCHER]` entram, mas ficam **impedidas de publicar** até você preencher os dados da igreja).

### Passo 2c. Colocar a biblioteca do Grupo de Discipulado no banco (quando for abrir os grupos)

São 24 lições em 6 temas, 4 lições de formação do discipulador e 6 trilhas prontas, todas escritas como **rascunho**:

1. Rode na pasta do projeto: `npm run import:library`. Ele cria `content/generated/biblioteca.sql` e lista as 28 lições, marcando as **sensíveis** e as **bloqueadas para publicação** (com `[PREENCHER]`).
2. Cole **todo** o arquivo no **SQL Editor** do Supabase e clique em **Run**. É seguro repetir: o que já existe é ignorado.
3. Em **Administração > Grupos**, veja a tabela da biblioteca. Edite cada lição no editor, faça a revisão pastoral (e a de um profissional nas sensíveis), preencha os `[PREENCHER]`, publique e depois publique as trilhas.
4. Marque quem será discipulador (Grupos > Discipuladores) e ligue a chave **Grupo de Discipulado** em Configurações.

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

## Passo 8. E-mail de lembretes (só quando for ligar o recurso)

O envio usa o **Resend** (<https://resend.com>) e um **agendador** que chama o site de tempos em tempos. Nada disso é necessário para o MVP.

1. Crie a conta no Resend e **verifique o seu domínio** (o endereço de envio precisa ser dele, por exemplo `discipulado@suaigreja.com.br`). Crie uma chave de API do Resend.
2. Invente o **segredo do agendador**: um texto longo e aleatório (32 caracteres ou mais). Anote no gerenciador de senhas. **Não cole no chat.**
3. Guarde só o **resumo (hash)** do segredo no banco. No SQL Editor, troque `SEU-SEGREDO` pelo texto que você inventou e rode:

   ```sql
   insert into public.app_config (key, value)
   values ('cron_secret_hash', encode(sha256(convert_to('SEU-SEGREDO', 'UTF8')), 'hex'));
   ```

4. Na **Vercel** (Settings > Environment Variables), acrescente e faça um novo deploy:
   - `CRON_SECRET` = o mesmo segredo do passo 2;
   - `RESEND_API_KEY` = a chave do Resend;
   - `EMAIL_FROM` = por exemplo `Vertical Church <discipulado@suaigreja.com.br>`;
   - `NEXT_PUBLIC_SITE_URL` = o endereço do site, sem barra no fim.
5. O arquivo `vercel.json` já agenda uma chamada por dia (12h UTC, 9h em Brasília) a `/api/cron/lembretes`; a Vercel envia o `CRON_SECRET` sozinha. Chamadas mais frequentes exigem o plano Pro da Vercel, ou um serviço de agendamento externo que faça `GET` na mesma rota com o cabeçalho `Authorization: Bearer <CRON_SECRET>`.
6. Em **Administração > Lembretes**, confira o quadro "Situação", ajuste os textos e use **Enviar teste para mim**. Depois ligue **Lembretes por e-mail** em Configurações.

Regras que valem sempre: só para quem aceitou, das 8h às 20h de Brasília, no máximo 2 lembretes por semana por pessoa, e todo e-mail traz o link para desligar.

## Passo 9. Entrar com e-mail (opcional, V3)

No Supabase, em **Authentication > Providers > Email**, deixe o provedor ativo e escolha o envio de "Magic Link". Em **Authentication > URL Configuration**, o endereço do site e `/auth/callback` já devem estar nas URLs permitidas (o mesmo do login Google). Depois ligue **Entrar com e-mail** em Configurações. Para muitos e-mails por hora, configure um SMTP próprio no Supabase.

---

## Além das contas: o que a igreja precisa providenciar

Estes itens andam em paralelo e **não dependem de código**. Veja o detalhamento na [Parte 3 do handoff](HANDOFF.md).

- Pedir a **autorização por escrito** aos titulares da NVI e da NTLH.
- Contratar a **revisão jurídica** dos Termos de Uso e da Política de Privacidade (a plataforma trata convicção religiosa, dado sensível na LGPD).
- Designar o **encarregado de dados (DPO)** e um **segundo administrador** de confiança para acesso de emergência.
- Enviar **logotipo e cores oficiais**.
- Ler o mapa completo do que falta em [PENDENCIAS.md](PENDENCIAS.md).
- Enviar os **textos da igreja** (história, valores, declaração de fé, liderança, ministérios, membresia), que hoje aparecem como `[PREENCHER]` no Ciclo 3.
