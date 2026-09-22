# Guia completo: criar as contas, montar o banco e colocar o site no ar

Este guia é para o pastor. Você faz cada passo com calma; o Claude acompanha e tira dúvidas. **Não precisa saber programar.** Onde aparece um comando, você pode pedir ao Claude para rodá-lo por você.

> Os sites mudam o desenho dos menus de vez em quando. Se um nome de botão estiver um pouco diferente do que está aqui, procure o parecido. Se travar, tire uma foto da tela (sem senhas nem chaves visíveis) e descreva ao Claude o que aparece.

---

## 0. Antes de começar

### Regras de ouro (leia duas vezes)

1. **Nunca cole senhas, chaves ou segredos no chat.** Nem uma parte. Cole só nos campos do site indicado ou no arquivo `.env.local` do seu computador. O Claude nunca precisa vê-los.
2. **Use um e-mail da igreja** (por exemplo `tecnologia@suaigreja.com.br`) para criar as contas, e não o pessoal. Assim a igreja não perde o acesso se alguém sair.
3. **Ative a verificação em duas etapas** em toda conta (o celular confirma cada entrada). Guarde os **códigos de recuperação** que o site mostrar.
4. **Use um gerenciador de senhas** (Bitwarden, 1Password, o do Google…) e anote lá cada conta e cada chave. Copie o resumo para a tabela do [RUNBOOK](RUNBOOK.md), seção 1 (sem as senhas).
5. **Dê acesso de emergência a uma segunda pessoa de confiança** (um segundo administrador em cada conta) assim que as contas existirem.

### O que você vai precisar

- O **computador onde está a pasta do projeto** (`vertical-discipulado`).
- Um **e-mail da igreja** e o **celular** para a verificação em duas etapas.
- Um **cartão de crédito** só se você escolher um plano pago (o começo cabe em planos gratuitos; veja a tabela abaixo).
- **1 a 2 horas** para as fases 1 a 5. As demais podem ficar para outro dia.

### O mapa: o que criar, em que ordem, e quanto custa

| Fase | O que fazer | Para quê | Custo para começar | Tempo |
| --- | --- | --- | --- | --- |
| **1** | Conta no **GitHub** e enviar o código | Guarda o código com segurança e alimenta a Vercel | Grátis | 15 min |
| **2** | Conta no **Supabase** e criar o projeto | O banco de dados e o login | Grátis (veja o aviso sobre pausa) | 15 min |
| **3** | Aplicar as **27 migrações** (um arquivo só) | Cria as tabelas e as regras de segurança | Grátis | 10 min |
| **4** | **Google Cloud** e ligar ao Supabase | O botão "Entrar com Google" | Grátis | 30 min |
| **5** | Testar no seu computador | Ver tudo funcionando antes de publicar | Grátis | 15 min |
| **6** | **Vercel**: colocar o site no ar | O endereço que as pessoas vão abrir | Grátis (confira os termos do plano) | 20 min |
| **7** | **Importar o conteúdo** (Ciclos e biblioteca) | As lições dentro do banco | Grátis | 15 min |
| **8** | **Domínio** próprio | `discipulado.suaigreja.com.br` | Já é da igreja ou ~R$ 40/ano | 20 min |
| **9** | **Resend** e o agendador (e-mails) | Lembretes por e-mail, só quando for ligar | Grátis até um limite (confira) | 30 min |
| **10** | **Entrar com e-mail** (opcional) | Alternativa para quem não tem Google | Grátis | 5 min |

> **Os planos gratuitos e seus limites mudam.** Antes de contratar cada serviço, abra a página de preços e confira: limites de usuários, de armazenamento, e se o projeto é **pausado quando fica sem uso** (o gratuito do Supabase pausa projetos inativos: para uso real, considere o plano pago). Anote o que descobrir no RUNBOOK, seção 9.

**O MVP (o que abre para os primeiros convertidos) precisa só das fases 1 a 7.** As fases 8 a 10 e todos os recursos além do MVP entram depois, um por vez (veja [PENDENCIAS.md](PENDENCIAS.md)).

### Os arquivos prontos que você vai colar

O Claude já gerou três arquivos na pasta `content/generated/` do projeto (se não estiverem lá, peça: "gere os arquivos SQL"):

| Arquivo | O que é | Fase |
| --- | --- | --- |
| `banco-completo.sql` | As **27 migrações juntas**: cria todas as tabelas e regras de segurança | 3 |
| `todos-os-ciclos.sql` | Os **Ciclos 1 a 3** (28 lições, em rascunho) | 7 |
| `biblioteca.sql` | A **biblioteca do Grupo de Discipulado** (28 lições e 6 trilhas, em rascunho) | 7 (só quando for abrir os grupos) |

Para abrir um deles: na pasta do projeto, `content` > `generated`, clique com o botão direito no arquivo > **Abrir com** > Bloco de Notas (ou VS Code). Depois **Ctrl+A** (seleciona tudo) e **Ctrl+C** (copia). Eles são grandes: colar e rodar pode levar alguns segundos, é normal.

---

## Fase 1. GitHub (guarda o código)

1. Entre em <https://github.com> e clique em **Sign up**. Use o e-mail da igreja. Escolha um nome de usuário (por exemplo `verticalchurch-tech`).
2. Ative a verificação em duas etapas: **foto do perfil > Settings > Password and authentication > Two-factor authentication**. Guarde os códigos de recuperação.
3. Crie o repositório: **+ (canto superior) > New repository**.
   - **Repository name:** `vertical-discipulado`.
   - **Private** (privado). Isso é importante.
   - **Não** marque "Add a README", "gitignore" nem "license" (o projeto já tem os seus).
   - Clique em **Create repository**.
4. A página seguinte mostra um endereço parecido com `https://github.com/SEU-USUARIO/vertical-discipulado.git`. **Copie esse endereço.**
5. **Envie o código.** O projeto já tem um histórico de versões no seu computador; falta só mandar para o GitHub. Duas formas:
   - **Peça ao Claude:** diga "envie o código para este repositório do GitHub: (cole o endereço)". Ele **vai pedir a sua confirmação** antes de enviar, porque publicar é uma ação externa. Na primeira vez, uma janelinha do navegador pede para você entrar no GitHub: entre normalmente (é a sua senha, digitada no site do GitHub, nunca no chat).
   - **Ou você mesmo**, num terminal aberto na pasta do projeto:

     ```bash
     git remote add origin https://github.com/SEU-USUARIO/vertical-discipulado.git
     git push -u origin main
     ```
6. Recarregue a página do repositório no GitHub: os arquivos devem aparecer.

**Conferência:** o arquivo `.env.local` (suas chaves) **não pode** aparecer no GitHub. Ele já é ignorado de propósito. Se você o vir lá, avise o Claude na hora.

---

## Fase 2. Supabase (banco de dados e login)

1. Entre em <https://supabase.com> > **Start your project** e entre **com o GitHub** (mais simples) ou com o e-mail da igreja. Ative a verificação em duas etapas em **Account > Security**.
2. Crie uma **organização** (o Supabase pede): nome "Vertical Church", tipo "Nonprofit" ou o que mais se aproximar, plano **Free** por enquanto.
3. **New project**:
   - **Name:** `vertical-discipulado-producao`.
   - **Database Password:** clique em **Generate a password**, **copie e guarde no gerenciador de senhas** (você raramente vai usá-la, mas não dá para recuperar).
   - **Region:** **South America (São Paulo)**. Mais perto das pessoas, mais rápido e melhor para a LGPD.
   - **Create new project.** Leva alguns minutos.
4. *(Recomendado)* Crie **um segundo projeto**, `vertical-discipulado-homologacao`, do mesmo jeito, para testar mudanças antes de ir ao ar. Se o plano gratuito não permitir dois projetos, comece só com o de produção e avise o Claude. **Repita as fases 3 e 4 em cada projeto.**
5. Anote **duas informações** (sem segredo, mas guarde): em **Project Settings (engrenagem) > API** (ou **Connect**):
   - **Project URL**: parecida com `https://abcdefgh.supabase.co`;
   - a chave **Publishable** (começa com `sb_publishable_`). É a chave pública do site; pode ficar no `.env.local` e na Vercel.
   - ⚠️ **Não use, não copie e não cole a chave `secret` / `service_role` em lugar nenhum.** O site foi feito para nunca precisar dela.

---

## Fase 3. Aplicar as 27 migrações (o banco)

As migrações criam as tabelas (pessoas, lições, progresso, grupos…) e, principalmente, as **regras de segurança**: quem pode ver o quê. Todas as tabelas já nascem protegidas.

1. No Supabase, abra o projeto e clique em **SQL Editor** (menu da esquerda) > **New query**.
2. Abra o arquivo **`content/generated/banco-completo.sql`**, copie **tudo** (Ctrl+A, Ctrl+C) e cole no editor.
3. Clique em **Run** (ou Ctrl+Enter). Se o Supabase perguntar se você confirma uma "operação destrutiva" (por causa de um `drop constraint`), é seguro: confirme (é o banco novo e vazio).
4. **Deve aparecer "Success"** e, embaixo, uma **tabela com todas as tabelas criadas**, todas com `rls = true`. Se aparecer alguma com `false`, **pare e avise o Claude.**
5. Confira em **Table Editor**: devem existir tabelas como `profiles`, `lessons`, `cycles`, `lesson_progress`, `discipleship_groups`, entre outras.

**Se der erro:** o arquivo roda como uma única transação, então **nada fica pela metade**: o banco continua vazio. Leia a mensagem (ela indica o nome da migração, pelo cabeçalho `-- ===== ... =====`), **copie só a mensagem de erro** (não há segredos nela) e mande ao Claude. Depois de corrigir, cole tudo de novo.

**Prefere uma migração de cada vez?** São 26 arquivos em `supabase/migrations`, na ordem do nome (`…0001_base` até `…0026_multi_tenant_foundation`). Cole e rode um por vez, em ordem, sem pular nenhum. O resultado é o mesmo.

> **Por que "22"?** As 13 primeiras formam o MVP; as 9 seguintes (14 a 22) criam os recursos além do MVP (chaves de liberação, quiz, cuidadores, lembretes, certificados, grupos…). Aplicar todas **não muda nada** para as pessoas: tudo isso nasce **desligado**.

### Definir o primeiro Administrador (antes do primeiro login!)

O banco já nasce com uma igreja cadastrada (`vertical-church`, criada pela própria migração). Ainda no **SQL Editor** > **New query**, rode (troque pelo e-mail Google **que você vai usar para entrar**, entre as aspas):

```sql
insert into public.church_admins_pending (email, church_id)
values ('seu-email@gmail.com', (select id from public.churches where slug = 'vertical-church'));
```

**O e-mail precisa estar em letras minúsculas.** Quem entrar pela primeira vez com esse e-mail vira Administrador automaticamente. Se você entrar antes de rodar isto, avise o Claude: dá para corrigir.

---

## Fase 4. Google Cloud e o botão "Entrar com Google"

### 4a. Criar o projeto e a tela de permissão

1. Entre em <https://console.cloud.google.com> com a conta Google da igreja. Aceite os termos.
2. No topo, clique no seletor de projetos > **Novo projeto**. Nome: `vertical-discipulado`. **Criar.** Depois, selecione o projeto criado.
3. Abra o menu (☰) > **Google Auth Platform** (ou **APIs e serviços > Tela de permissão OAuth**) > **Começar** e preencha:
   - **Nome do app:** `Discipulado Vertical Church`.
   - **E-mail de suporte:** o e-mail da igreja.
   - **Público:** **Externo**.
   - **Informações de contato:** o e-mail da igreja.
   - Aceite a política de dados e **Criar**.
4. Em **Acesso a dados** (Escopos), deixe **só** os básicos: `email`, `profile` e `openid`. **Não adicione outros.**
5. **Enquanto o site não está no ar, fique em modo "Testando":** em **Público** (Audience), em **Usuários de teste**, clique em **Add users** e cadastre o seu e-mail (o do primeiro Administrador) e o de quem for testar. Só essas pessoas conseguem entrar (até 100).
6. **Antes de abrir para a igreja, publique o app.** **Isto é essencial:** em modo de teste só entra quem você cadastrou à mão, e o login de novos convertidos falharia. O botão **Publicar app** fica **desativado** ("conclua a configuração na página de branding") enquanto o **Branding** estiver incompleto. Com o site no ar (Fase 6, e de preferência um domínio próprio, Fase 8), preencha em **Branding**:
   - **Página inicial do aplicativo:** o endereço do site.
   - **Política de Privacidade:** `endereço-do-site/privacidade`. **Termos de Serviço:** `endereço-do-site/termos`.
   - **Domínios autorizados:** o domínio do site (o Google **não aceita `vercel.app`**).
   - **Não envie logotipo** por enquanto: subir um logotipo faz o Google exigir uma verificação do app, que demora dias. Os escopos `email`, `profile` e `openid` sozinhos dispensam essa verificação.
   Salve o Branding e, então, clique em **Publicar app**.

### 4b. Criar as credenciais e ligar ao Supabase

1. Ainda no Google Cloud: **Clientes** (ou **Credenciais > Criar credenciais > ID do cliente OAuth**) > **Criar cliente**.
   - **Tipo de aplicativo:** **Aplicativo da Web**. Nome: `Discipulado Web`.
   - **Deixe aberta** esta página e não preencha as URLs ainda. Vá ao Supabase.
2. No **Supabase**: **Authentication > Sign In / Providers** (ou **Providers**) > **Google** > ative.
3. O Supabase mostra o **Callback URL (for OAuth)**, parecido com `https://abcdefgh.supabase.co/auth/v1/callback`. **Copie.**
4. Volte ao Google Cloud, no cliente que você estava criando, em **URIs de redirecionamento autorizados** > **Adicionar URI** > cole o endereço. Clique em **Criar**.
5. O Google mostra o **ID do cliente** e a **Chave secreta do cliente**. **Copie cada um e cole direto nos campos "Client ID" e "Client Secret" do Supabase** (Authentication > Providers > Google). Clique em **Save**. Não envie essas chaves a ninguém nem as cole no chat.
6. No Supabase, **Authentication > URL Configuration**:
   - **Site URL:** por enquanto `http://localhost:3000` (você troca na Fase 6).
   - **Redirect URLs:** adicione `http://localhost:3000/auth/callback`.
   - **Save.**
7. *(Recomendado)* Em **Authentication > Sign In / Providers > Email** (ou **Settings**), deixe a **confirmação de e-mail ativada**. Em **Authentication > Rate Limits**, confira que os limites estão ligados (protegem contra abuso).

---

## Fase 5. Testar no seu computador

1. Na pasta do projeto, **copie `.env.example` para `.env.local`** (no Windows: clique com o botão direito no arquivo `.env.example` > copiar e colar, e renomeie a cópia para `.env.local`). Abra com o Bloco de Notas e preencha só estas duas linhas, com os valores da Fase 2.5:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   Salve. **Este arquivo nunca vai para o GitHub** (é ignorado de propósito).
2. Peça ao Claude ("rode o site no meu computador") ou, num terminal na pasta do projeto, rode:

   ```bash
   npm install
   npm run dev
   ```

3. Abra <http://localhost:3000> no navegador. Clique em **Entrar com Google** e entre com **o mesmo e-mail** que você colocou como primeiro Administrador.
4. Você deve cair na tela **"Que bom ter você aqui"**. Preencha o primeiro acesso.
5. Confira no Supabase, em **Table Editor > profiles**: o seu perfil existe com `role = admin`.
6. Aparece no topo do site o link **Conteúdo**? Ótimo: você é o administrador.

**Deu "Não foi possível entrar"?** Revise: (a) o **Callback URL** no Google é exatamente o do Supabase; (b) o **Client ID/Secret** estão no Supabase; (c) o seu e-mail está em **Usuários de teste** no Google (ou o app está **publicado**); (d) `http://localhost:3000/auth/callback` está nas Redirect URLs.

---

## Fase 6. Vercel (coloca o site no ar)

1. Entre em <https://vercel.com> > **Sign Up** > **Continue with GitHub** (com a conta da igreja). Ative a verificação em duas etapas.
2. **Add New > Project**. Autorize o acesso ao GitHub e **importe** o repositório `vertical-discipulado`.
3. Em **Environment Variables**, adicione **as duas** variáveis (uma de cada vez, com os valores do projeto de **produção**):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - **Só essas duas por enquanto.** A Vercel pré-preenche outros nomes (`NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`) com valor vazio: **não os preencha agora** (eles entram na Fase 9). `NEXT_PUBLIC_SITE_URL` só é usada pelos lembretes por e-mail.
   - Variáveis que começam com `NEXT_PUBLIC_` são **públicas** (vão para o navegador): deixe o tipo como **Config** (não "Secret") e o ambiente **Production and Preview**.
4. Clique em **Deploy** (se a tela tiver dois botões, **Create Project** primeiro e depois **Deploy**). Em 1 a 3 minutos a Vercel mostra um endereço como `https://vertical-discipulado.vercel.app`. Se o deploy não iniciar, um envio qualquer à branch `main` no GitHub dispara o build de produção.
5. **Volte ao Supabase** > **Authentication > URL Configuration** e ajuste:
   - **Site URL:** o endereço da Vercel;
   - **Redirect URLs:** **acrescente** `https://SEU-ENDERECO/auth/callback` (mantenha a de `localhost`).
6. Se você não tinha preenchido, na Vercel abra **Settings > Environment Variables**, coloque `NEXT_PUBLIC_SITE_URL` (sem barra no fim) e faça **Redeploy** (aba Deployments > ⋯ > Redeploy).
7. Abra o endereço no **celular** e entre com Google. Deve funcionar como no computador.

**Dica:** cada vez que o código for atualizado no GitHub, a Vercel publica sozinha uma versão nova.

---

## Fase 7. Importar o conteúdo (as lições)

O conteúdo entra **como rascunho**: nenhum membro vê rascunhos. Você revisa e publica pelo painel **Conteúdo**. Rodar de novo é seguro: o que já existe é ignorado, então **as suas edições nunca são sobrescritas**.

### 7a. Os Ciclos 1 a 3 (trilha de novos convertidos)

1. No **SQL Editor** do Supabase > **New query**, cole **todo** o arquivo **`content/generated/todos-os-ciclos.sql`** e clique em **Run**.
2. No fim aparece uma tabela com as 28 lições, todas `draft`.
3. Repare: 10 lições do Ciclo 3 têm **`[PREENCHER]`** (dados da igreja que só você tem). Elas ficam **impedidas de publicar** até você preencher no editor. É proposital.
4. Para revisar e publicar: **Conteúdo > Trilha** no site (veja o [RUNBOOK](RUNBOOK.md), seção 6b).

### 7b. A biblioteca do Grupo de Discipulado (só quando for abrir os grupos)

1. Cole **todo** o arquivo **`content/generated/biblioteca.sql`** no SQL Editor > **Run**.
2. Cria 28 lições (24 da biblioteca + 4 de formação do discipulador) e 6 trilhas prontas, tudo em rascunho.
3. Em **Administração > Grupos** você vê a tabela da biblioteca. **Revise cada lição** (as sensíveis também com um profissional), preencha os `[PREENCHER]`, publique e depois publique as trilhas.

*(Se precisar gerar os arquivos de novo: `npm run db:bundle`, `npm run import:sql -- --igreja "Nome da igreja" --slug vertical-church` e `npm run import:library -- --igreja "Nome da igreja" --slug vertical-church`, ou peça ao Claude.)*

---

## Fase 8. Domínio (pode vir depois)

1. Escolha o endereço, por exemplo `discipulado.suaigreja.com.br` (um **subdomínio** do site da igreja).
2. Na Vercel: **Settings > Domains > Add** e digite o endereço. A Vercel mostra o registro DNS a criar (normalmente um **CNAME** `discipulado` apontando para `cname.vercel-dns.com`).
3. No site onde o domínio da igreja está registrado (Registro.br, GoDaddy, Hostinger…), abra o **DNS** e crie exatamente esse registro. Pode levar de minutos a algumas horas.
4. Quando a Vercel mostrar o domínio como válido, **troque o endereço nos três lugares**:
   - Supabase > **Authentication > URL Configuration**: **Site URL** e **Redirect URLs** (`https://discipulado.suaigreja.com.br/auth/callback`);
   - Vercel: `NEXT_PUBLIC_SITE_URL` (e **Redeploy**);
   - Google Cloud não precisa mudar (o retorno passa pelo Supabase).

Se preferir, peça ao Claude para guiar esta fase com o seu provedor de domínio.

---

## Fase 9. E-mail de lembretes: Resend e o agendador (só quando for ligar o recurso)

Nada disto é necessário para o MVP. Faça quando decidir ligar **Lembretes por e-mail** em Configurações.

### 9a. Resend (o serviço que envia os e-mails)

1. Entre em <https://resend.com> e crie a conta (e-mail da igreja, verificação em duas etapas).
2. **Domains > Add Domain**: digite o domínio da igreja (ou um subdomínio só para e-mails, como `mail.suaigreja.com.br`).
3. O Resend mostra alguns **registros DNS** (SPF, DKIM…). Crie **todos** no DNS do seu domínio (o mesmo lugar da Fase 8). Volte ao Resend e clique em **Verify**. Fica **Verified** em minutos ou horas. **Sem domínio verificado os e-mails não saem** ou caem no spam.
4. **API Keys > Create API Key**: nome `discipulado`, permissão **Sending access**. **Copie a chave (`re_...`) uma única vez** e guarde no gerenciador de senhas. Não cole no chat.

### 9b. O segredo do agendador

Um "agendador" é quem acorda o site todo dia para enviar os lembretes. Ele precisa provar quem é, com um segredo que só o site e o banco conhecem.

1. **Invente o segredo:** um texto longo e aleatório, **32 caracteres ou mais** (o gerenciador de senhas tem "gerar senha"). Guarde lá. **Não cole no chat.**
2. **Guarde só o "resumo" (hash) do segredo no banco.** No SQL Editor, troque `SEU-SEGREDO` pelo texto inventado e rode:

   ```sql
   insert into public.app_config (key, value)
   values ('cron_secret_hash', encode(sha256(convert_to('SEU-SEGREDO', 'UTF8')), 'hex'));
   ```

   (O banco guarda só o resumo; nem você consegue "ler" o segredo de volta dali.)
3. Na **Vercel** > **Settings > Environment Variables**, acrescente (e faça **Redeploy**):

   | Variável | Valor |
   | --- | --- |
   | `CRON_SECRET` | o mesmo segredo do passo 1 |
   | `RESEND_API_KEY` | a chave do Resend (`re_...`) |
   | `EMAIL_FROM` | por exemplo `Vertical Church <discipulado@suaigreja.com.br>` (o domínio precisa estar verificado) |
   | `NEXT_PUBLIC_SITE_URL` | o endereço do site, sem barra no fim |

4. O arquivo `vercel.json` já agenda **uma chamada por dia** (12h UTC, 9h em Brasília) a `/api/cron/lembretes`. A Vercel envia o `CRON_SECRET` sozinha. **Mais de uma vez por dia** exige o plano pago da Vercel ou um serviço de agendamento externo que faça `GET` na mesma rota com o cabeçalho `Authorization: Bearer <CRON_SECRET>`.

### 9c. Conferir e ligar

1. No site, **Administração > Lembretes**: o quadro **Situação** deve mostrar tudo configurado (sem valores). Ajuste os textos e use **Enviar teste para mim**. Confira no celular (e no spam) e o link de **desligar**.
2. Só então ligue **Lembretes por e-mail** em **Administração > Configurações**.

Regras que valem sempre: só para quem aceitou; das 8h às 20h de Brasília; no máximo 2 lembretes por semana por pessoa; todo e-mail traz o link para parar de receber.

---

## Fase 10. Entrar com e-mail (opcional)

Para quem não tem conta Google.

1. Supabase > **Authentication > Sign In / Providers > Email**: deixe **ativo** e o envio de link ("Magic Link") habilitado.
2. Confira que o endereço do site e `/auth/callback` estão nas **Redirect URLs** (Fase 4b.6 e Fase 6.5).
3. O envio de e-mail padrão do Supabase tem **limite baixo por hora**. Para uso real, configure um **SMTP próprio** em **Authentication > Emails > SMTP Settings** usando o **Resend** (ele mostra os dados de SMTP).
4. Ligue **Entrar com e-mail** em **Administração > Configurações**.

---

## Depois que tudo estiver no ar

1. **Segundo administrador:** em **Administração > Pessoas**, dê o perfil Administrador a uma pessoa de confiança (depois de ela entrar uma vez). Nas contas (GitHub, Supabase, Vercel, Google, Resend), adicione essa pessoa como membro.
2. **Conferência de verdade:** faça o roteiro do [CHECKLIST_PILOTO.md](CHECKLIST_PILOTO.md) (Fase B) na homologação, com duas contas Google.
3. **Ligar os recursos além do MVP,** um por vez, na ordem de [PENDENCIAS.md](PENDENCIAS.md).
4. **Backups:** confira no Supabase o que o plano oferece (Database > Backups) e faça um teste de restauração em homologação (RUNBOOK, seção 7).

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| "Não foi possível entrar" ao clicar em Entrar com Google | Callback do Google diferente do Supabase; app não publicado; Redirect URL faltando | Refaça 4b, confira as três coisas |
| Entra, mas não vê o link **Conteúdo** | Entrou antes de definir o primeiro administrador | Avise o Claude: dá para corrigir por SQL |
| O site abre, mas tudo pede login em loop | Variáveis do Supabase erradas na Vercel | Confira as duas variáveis e faça **Redeploy** |
| Erro ao rodar o `banco-completo.sql` | Banco não estava vazio, ou a colagem foi cortada | Copie só a mensagem de erro e mande ao Claude; cole de novo o arquivo inteiro |
| Lições não aparecem para o membro | Ainda estão como rascunho | **Conteúdo > Trilha**, revisar e publicar |
| E-mail não chega | Domínio não verificado no Resend, ou caiu no spam | Fase 9a; veja **Administração > Lembretes > Últimos envios** |
| O Supabase "pausou" o projeto | Plano gratuito inativo | No painel, **Restore project**; para uso real, considere o plano pago |

## Além das contas: o que a igreja precisa providenciar

Estes itens andam em paralelo e **não dependem de código**. O mapa completo, com quem faz o quê, está em [PENDENCIAS.md](PENDENCIAS.md) e o detalhamento na [Parte 3 do handoff](HANDOFF.md).

- Pedir a **autorização por escrito** aos titulares da NVI e da NTLH.
- Contratar a **revisão jurídica** dos Termos de Uso e da Política de Privacidade (a plataforma trata convicção religiosa, dado sensível na LGPD).
- Designar o **encarregado de dados (DPO)** e um **segundo administrador** de confiança.
- Enviar os **textos da igreja** (história, valores, declaração de fé, liderança, ministérios, membresia). O logotipo e as cores já estão no site.
- **Revisão pastoral** das lições da biblioteca e conferência dos telefones de emergência.
