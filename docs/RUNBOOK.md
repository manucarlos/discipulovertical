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
| Gerar o SQL de importação das lições | `npm run import:sql -- --igreja "Nome da igreja" --cycle 1` |

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

- O primeiro Admin é definido pelo e-mail em `app_config` antes do primeiro login (CONTAS.md, Fase 3).
- Depois disso, só um Admin promove outro (tela de usuários, a construir). Toda promoção fica no log de auditoria.
- Se ninguém for Admin (por exemplo, entrou antes de configurar), rode no SQL Editor:

  ```sql
  update public.profiles set role = 'admin' where email = 'SEU-EMAIL@gmail.com';
  ```

## 6b. Editar e publicar lições (painel de conteúdo)

Quem é **Editor** ou **Admin** vê o link **Conteúdo** no topo do app (ou abra `/admin/trilha`).

**Fluxo de trabalho**

1. **Trilha:** lista os ciclos e as lições, com o status de cada uma (rascunho, em revisão, publicada, arquivada) e um aviso amarelo nas que ainda têm `[PREENCHER]`. Use as setas para reordenar e o campo "Nova lição neste ciclo" para criar um rascunho.
2. **Abra a lição** e edite. O texto tem barra de formatação (título, negrito, listas, citação, tabela). Os trechos `[PREENCHER: ...]` aparecem em amarelo e no quadro "Pendências". Salve com o botão **Salvar** ou **Ctrl+S**.
3. **Ver como o membro vê:** abre a versão salva, idêntica à do membro. Salve antes para ver as mudanças.
4. **Editor:** ao terminar, clique em **Enviar para revisão**. **Admin/Pastor:** revise e clique em **Publicar**. O botão fica bloqueado, com o motivo, enquanto houver `[PREENCHER]`; o banco também recusa.
5. **Depois de publicada**, só o Admin edita, e cada salvamento vale na hora. Se errar, abra **Histórico de versões** e clique em **Restaurar** na versão anterior.
6. **Tirar do ar:** prefira **Arquivar** (quem já iniciou continua vendo). **Despublicar** faz a lição sumir para todos, inclusive para quem já começou.

**Avisos**

- Se aparecer "Outra pessoa salvou esta lição", recarregue a página; copie antes o que escreveu.
- O sistema avisa se você tentar sair com alterações não salvas.
- Preencha o versículo-chave só com a **referência** (ex.: `João 3.16`). Nunca cole o texto bíblico.

**Dar acesso a outra pessoa (só o Admin)**

A pessoa precisa ter entrado uma vez com o Google. Depois:

1. No topo, abra **Conteúdo > Pessoas** e busque pelo nome ou e-mail.
2. Abra a ficha, escolha o **Perfil** (Membro, Cuidador, Editor ou Administrador) e clique em **Salvar perfil**.
3. A mudança fica registrada no **Histórico de perfil** da própria ficha e no log de auditoria.

Regras: não dá para remover o **último administrador**, e você não altera o **seu próprio** perfil (peça a outro administrador). O perfil **Cuidador** ainda não dá acesso extra; ele vale a partir da próxima fase.

**Acompanhar as pessoas**

A lista mostra a **situação** de cada uma: primeiro acesso pendente, ainda não começou, em andamento, **parado** (14 dias ou mais sem atividade) e concluiu a trilha. Filtre por **Parado** para saber quem precisa de um contato pessoal. A ficha mostra o progresso lição a lição, o WhatsApp (se a pessoa informou) e os consentimentos.

_Se precisar, por SQL (SQL Editor do Supabase; não grava no log de auditoria):_ `update public.profiles set role = 'editor' where email = 'pessoa@gmail.com';`

## 6c. Pedidos das pessoas (LGPD) e Nossa Igreja

- **"Quero meus dados":** a própria pessoa baixa em **Meu perfil > Baixar meus dados**. Você não precisa fazer nada.
- **"Quero excluir minha conta":** a própria pessoa faz em **Meu perfil > Excluir minha conta**. Apaga o perfil, os consentimentos, o progresso, as reflexões, as notas, as presenças, os certificados e a participação em grupos. Se for **o único administrador**, o sistema não deixa: promova outra pessoa antes.
- **Corrigir dados de alguém:** a pessoa corrige em **Meu perfil**. O Admin vê tudo em **Pessoas**, mas não altera nome nem e-mail de terceiros.
- **Textos de Nossa Igreja:** **Conteúdo > Nossa Igreja** (só o Admin). Cada mudança fica no log de auditoria.

## 6d. O painel de indicadores

**Conteúdo > Painel** (Admin) mostra quantos chegaram, quantos começaram em 7 dias, **quantos estão parados**, quantos concluíram, e em que lições mais gente para. O Editor vê só o painel de conteúdo, sem dados de pessoas. Use o filtro **Parado** em Pessoas para saber quem precisa de um contato. Como cada número é calculado está no rodapé do painel.

## 6e. Ligar e desligar recursos (Configurações)

**Administração > Configurações** (só o Admin). Cada recurso além do MVP tem uma caixa; **todos nascem desligados**. Desligar esconde o recurso na hora e **não apaga nada**: os dados voltam quando você religar. Cada mudança fica no log de auditoria. Ordem sugerida na [PENDENCIAS.md](PENDENCIAS.md). Aqui também ficam o **nome da igreja** e o e-mail de contato.

## 6f. Cuidadores e alertas

1. Dê o perfil **Cuidador** a alguém em **Pessoas** (a ficha explica o que cada perfil pode).
2. **Cuidado** (Admin): **Distribuir por rodízio** atribui a fila sem cuidador a quem tem menos membros; ou atribua um a um (também na ficha da pessoa).
3. O cuidador vê **Meus membros**: contato, progresso, reflexões, alerta e **notas de cuidado** (só ele e o Admin leem).
4. Quem passa de **14 dias** sem ler abre um alerta (aberto, em contato, resolvido). Sem cuidador, o alerta é seu, em **Cuidado**. Quem volta a ler tem o alerta fechado sozinho.
5. Quem deixa de ser cuidador devolve os membros para a fila.

## 6g. Lembretes por e-mail

- Configure uma vez ([CONTAS.md](CONTAS.md), Fase 9). Depois, **Administração > Lembretes** mostra a **Situação** (o que falta), os **textos** (edite com tom de cuidado; as palavras entre chaves, como `{{nome}}`, são trocadas sozinhas) e os **últimos envios** com erro, se houver. **Enviar teste para mim** confere o serviço.
- Regras que o sistema aplica sozinho: só para quem aceitou; das 8h às 20h de Brasília; no máximo 2 lembretes por semana por pessoa; uma mensagem por ocorrência; quem voltou a ler não recebe convite.
- **Se um e-mail falhar,** o motivo aparece na lista (por exemplo, "Resend respondeu 422": domínio não verificado). Falhas recentes são tentadas de novo por 2 dias.
- **Se alguém pedir para parar:** cada e-mail tem o link para desligar; a pessoa também desliga em **Meu perfil**. Nunca reative por conta própria.
- **Trocar o segredo do agendador:** invente outro, atualize `CRON_SECRET` na Vercel e rode de novo o `insert` da Fase 9b com `update` no lugar (o valor guardado é só o resumo do segredo).

## 6h. Encerramentos e certificados

1. **Administração > Encerramentos**: crie o encontro de cada ciclo (título, data e hora de Brasília, local).
2. O membro que concluiu o ciclo vê o encontro na tela do ciclo. **O encontro não trava o ciclo seguinte:** sem presença confirmada, é só um "marco pendente".
3. Depois do encontro, marque a **presença** de quem esteve e clique em **Emitir certificados**: saem só para quem **concluiu o ciclo e teve presença**. Cada um recebe um código; o membro baixa o PDF em **Certificados**, e qualquer pessoa confere o código em `/verificar`.
4. Um erro no nome do certificado: o nome fica como estava no dia da emissão. Se precisar corrigir, fale com o Claude (não há tela para reemitir, de propósito).

## 6i. Grupo de Discipulado

- **Antes de abrir:** importe a biblioteca ([CONTAS.md](CONTAS.md), Fase 7b), revise e publique as lições e as trilhas (**Administração > Grupos**), marque os **discipuladores** e ligue a chave.
- **O discipulador** cria o grupo (**Discipulado > Criar grupo**), compartilha o **código do convite** e acompanha o **painel**: quem leu, quem está em atraso, quem merece um contato. Pode **pausar** o grupo (os dias da pausa não têm lição) e usa o **guia do encontro** para registrar presença e notas (só ele e o Admin leem).
- **O discípulo** entra pelo código, lê o que o discipulador vai ver e aceita. Sair do grupo tira o acesso do discipulador aos dados dele.
- **Pedidos de ajuda:** o discipulador atende e pode **escalar** com um botão; o discípulo também pode enviar **direto à equipe pastoral** (o discipulador não vê). Você atende em **Administração > Pedidos de ajuda** (os diretos aparecem primeiro). **Trate com sigilo**; cada atendimento fica no log, sem o texto.
- **Trocar o discipulador** de um grupo: **Administração > Grupos > Transferir**. Se o discipulador excluir a conta, o grupo fica sem discipulador até você transferir.

## 6j. Planilhas

**Pessoas** tem os links **Baixar planilha de pessoas** e **de progresso por lição** (CSV para Excel). Cada download fica no log. Trate o arquivo como dado pessoal: guarde em local seguro e apague quando terminar.

## 6k. Feedback do piloto

O formulário público (`/feedback`, sem login) nasce **desligado**. Para o piloto: **Administração > Configurações > "Formulário de feedback do piloto"**, salve, e envie o link e o roteiro (`docs/ROTEIRO_TESTADOR.pdf`) aos testadores. As respostas ficam em **Administração > Feedback**, com resumo no alto. Só a administração as vê.

- **Abuso:** o banco aceita no máximo 30 respostas por hora e ignora robôs simples. Se receber lixo, desligue a chave em Configurações.
- **LGPD:** as respostas podem ter nome e contato (opcionais) e texto livre. Quem pedir para apagar: use **Apagar** na resposta. Ao fim do piloto, exporte o que importa (copie os textos), apague as respostas e **desligue o formulário**.

## 6l. Marca da igreja

**Administração > Marca** (só o Admin): escolha as **3 cores** (o site calcula o resto e só salva se tudo ficar legível), envie o **logotipo** (PNG ou JPG, até 2 MB) e, se quiser, um **símbolo** para o ícone da aba. **Baixar a identidade** faz backup; **Restaurar o padrão** volta à marca do projeto. Cada mudança fica no log. Guia: [MARCA.md](MARCA.md). O nome da igreja está em **Configurações**.

## 6m. Instalar para outra igreja (kit)

1. Copie `churches/exemplo.json` para `churches/<igreja>.json` e preencha (nome, e-mail do primeiro administrador, endereço, 3 cores, ciclos). Esses arquivos **não vão para o GitHub** (só o exemplo).
2. Rode `npm run kit -- <igreja>`. Sai uma pasta `content/generated/kit-<igreja>/` com `1-banco.sql`, `2-identidade.sql`, `3-conteudo.sql`, `variaveis.env` e o **`roteiro.md`** personalizado.
3. Siga o `roteiro.md` na ordem: projeto no Supabase, os SQLs, o login do Google, o site na Vercel. Cada igreja tem o **seu próprio** Supabase e Vercel. Antes de vender, veja as decisões de [EXPANSAO.md](EXPANSAO.md), seção 4.

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
