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
