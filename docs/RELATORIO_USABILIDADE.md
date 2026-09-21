# Relatório dos testes de usabilidade

Data: 20/09/2026. Três pessoas simuladas percorrem o sistema pelo **código real do aplicativo** (as telas e as ações do servidor), sobre um banco Postgres em memória com **as mesmas migrações e regras de segurança** que irão para o Supabase.

## Leia primeiro: o que este teste é e o que não é

| É | Não é |
| --- | --- |
| O código real de cada tela e de cada ação, rodando de ponta a ponta | Um teste no Supabase de verdade (as contas ainda não existem) |
| As regras de acesso do banco valendo de verdade (RLS, permissões, funções) | Um teste do login com Google, da rede ou do PostgREST |
| Um roteiro na ordem em que uma igreja usaria o sistema | Um teste com pessoas reais, com leitor de tela ou com teclado |

As pessoas **não são contas reais**: são usuários de um banco em memória, criados no mesmo formato que o login do Google criaria. Não é possível criar contas reais daqui (o login é do Google e o Supabase ainda não existe). O roteiro de conferência no ambiente real está em [CHECKLIST_PILOTO.md](CHECKLIST_PILOTO.md).

**Sobre o "Claudio, discípulo":** nas primeiras histórias ele é um **membro avançado**, que percorre os três ciclos. Nas histórias da segunda rodada (abaixo) ele também vira **cuidador** e **discipulador**, e o Claudinho vira discípulo do grupo dele.

## As três pessoas

| Pessoa | Perfil | O que faz |
| --- | --- | --- |
| **Claudião** | Administrador (o pastor) | Prepara o conteúdo, publica, ajusta regras, acompanha as pessoas, edita Nossa Igreja e consulta o painel |
| **Claudinho** | Membro novo | Primeiro acesso, primeiros passos da trilha, cuida do perfil, baixa os dados e, no fim, exclui a conta |
| **Claudio** | Discípulo avançado | Percorre as 28 lições dos três ciclos; depois vira editor por um tempo, e volta a membro |

## O que foi percorrido

**Todas as trilhas: os 3 ciclos e as 28 lições.**

- **Claudião:** primeiro login vira administrador; primeiro acesso com consentimento; painel vazio antes da importação; importação do conteúdo (28 lições em rascunho, 10 com `[PREENCHER]`); edição de lição, salvamento e prévia; conflito de edição; histórico e restauração de versão; publicação bloqueada enquanto houver `[PREENCHER]`; **resolução das 10 pendências do Ciclo 3 no editor** e publicação das 28 lições; ajuste das regras de liberação de um ciclo; criação, reordenação e arquivamento de lição; lista de pessoas com situação e filtros; ficha; troca de perfil; painel de indicadores; edição dos textos de Nossa Igreja.
- **Claudinho:** visita sem login; primeiro acesso com cada tipo de erro; tela inicial; lição bloqueada; leitura de uma lição (versículo com link, sem nenhum material interno); retomar de onde parou; concluir; tentativa de adiantar a próxima; limite de lições por semana; Nossa Igreja; edição do perfil e troca de Bíblia; lembretes; **baixar os dados**; **excluir a conta**.
- **Claudio:** primeiro acesso escolhendo a NVI; **as 28 lições em ordem** (sem nunca ficar preso); anúncio de ciclo concluído só na última lição de cada ciclo (8, 8 e 12); ciclo seguinte abre sem exigir o encontro presencial; tela final reconhece a conquista; relê lição concluída; vira editor, vê o painel de conteúdo sem dados de pessoas e não publica.
- **Cruzamentos entre as três:** o administrador muda uma regra e o membro sente na hora; o membro troca a Bíblia e a ficha do administrador mostra a mudança; o membro exclui a conta e a lista do pastor diminui, sem identificar ninguém no log; o membro tenta alcançar o painel e é barrado nas telas, nas ações e no banco.

Além do roteiro, **todas as telas** (cerca de 40, vistas por cada perfil) passaram por uma auditoria de acessibilidade, e as cores e os alvos de toque foram medidos.

## Segunda rodada: os recursos além do MVP

Depois do MVP, cada recurso novo ganhou uma história com as mesmas três pessoas, ligando e desligando a chave em **Configurações** (o estado é devolvido ao fim de cada história):

- **Configurações:** o Claudião liga e desliga recursos; a mudança vale para todos, fica no log, e um membro não altera nem pelo banco.
- **Quiz, prática e reflexão:** o Claudinho erra o quiz (não conclui, vê a explicação), acerta 2 de 3, conclui, marca a prática e escreve uma reflexão; o Claudião a lê na ficha (e a consulta fica no log); o gabarito nunca chega ao membro; concluir sem ser aprovado é recusado **pelo banco**.
- **Cuidado:** o Claudio vira cuidador e recebe o Claudinho (fila, atribuição, rodízio); vê contato, progresso e reflexões só dele; escreve uma nota (o Claudião a lê, outro cuidador não); com 20 dias parado o alerta abre sozinho e o Claudio o resolve; perder o perfil devolve o membro à fila.
- **Lembretes por e-mail:** o Claudinho some por 5 dias e recebe um convite gentil (um envio que falha aparece no registro e é tentado de novo); o mesmo aviso não se repete; fora das 8h às 20h nada sai; o link de descadastro só desliga com confirmação, e depois disso nada mais é enviado; a rota do agendador recusa quem não tem o segredo.
- **Encerramento e certificados:** o Claudio conclui o Ciclo 1 e recebe o certificado (PDF aberto num leitor real para conferir); o Claudinho, que não concluiu, não recebe; o encontro não trava o ciclo seguinte; a página pública confere o código; excluir o encontro não apaga o certificado.
- **Planilhas, vídeo, sequência de dias e entrar com e-mail:** CSV sem WhatsApp e à prova de fórmula; vídeo só em modo de privacidade; marcos só comemoram.
- **Grupo de Discipulado:** o Claudião prepara a trilha e marca o Claudio como discipulador; o Claudio cria o grupo; o Claudinho recebe o convite, lê o que o discipulador vai ver e só entra se aceitar; a lição do dia libera pelo calendário (a do dia seguinte não abre, nem pela ação); a lição sensível traz o aviso e o pedido de ajuda, com a reflexão **privada por padrão**; a reflexão só chega ao discipulador quando compartilhada; o pedido direto à equipe pastoral **não aparece para o discipulador**, e o escalado sim para o Admin; encontro, presença e notas; pausa; ao sair do grupo, o discipulador perde o acesso.

Todas as telas novas (cerca de 40 a mais) passaram pela mesma auditoria de acessibilidade.

## O que os testes acharam (e foi corrigido)

| # | Achado | Gravidade | Correção |
| --- | --- | --- | --- |
| 1 | **Concluir uma lição que já estava concluída** comemorava "ciclo concluído" de novo e **reescrevia a data de conclusão do ciclo** | Média (dado) | A ação agora não grava nada e só volta ao ciclo |
| 2 | **O administrador aparecia como "Parado"** no filtro que o pastor mais usa (ele nunca fez a trilha) | Média (ruído no alerta principal) | "Parado" vale só para membros e cuidadores; situação calculada por uma função única |
| 3 | **O editor de lições não tinha título principal**: quem usa leitor de tela não sabia onde estava | Média (acessibilidade) | Título só para leitores de tela |
| 4 | **Botão de destaque no modo escuro** (letra selecionada e o **"Concluir lição"**): texto branco sobre rosa, contraste abaixo de 4,5:1 | Média (acessibilidade) | Cor de texto própria para "sobre a cor da igreja" (`--on-brand`) |
| 5 | **Links e botões dos cabeçalhos com 20px de altura** no celular (mínimo do WCAG 2.2: 24px; recomendado: 44px) | Média (usabilidade, público idoso) | 44px de altura de toque; outros alvos pequenos também ajustados |
| 6 | Dois links que abrem em outra aba **sem `rel="noopener"`** | Baixa | Corrigidos |
| 7 | **7 funções do banco podiam ser chamadas por usuário anônimo** (sem dano possível, mas indevido) | Baixa (segurança) | Migração 0008; teste passa a exigir isso de toda função futura |

Achados da segunda rodada (todos corrigidos):

- O **arquivo de dados pessoais do membro** poderia sair incompleto sem avisar se uma das consultas falhasse: agora, se qualquer parte falha, nada é entregue.
- Mensagens de erro do banco viravam um texto genérico ou, pior, uma frase sobre "lições publicadas" numa tela de grupo: as mensagens das funções do banco (já em português) passam a chegar à pessoa.
- **Páginas estáticas** (`/termos`, `/privacidade`, `/offline`) não recebem o código de segurança do navegador (CSP): passaram a ser renderizadas a cada acesso.
- O simulador de banco dos testes não entendia listas (`uuid[]`) nem colunas `jsonb`: ajustado, para os testes refletirem o cliente real.

Achados de etapas anteriores, no mesmo espírito (já corrigidos): recursão infinita em políticas de acesso; nível dos títulos das lições importadas; versículo-chave digitado sem acento ou em minúsculas era recusado; `/igreja`, `/admin` e outras telas tentavam ser pré-renderizadas sem login.

## O que funcionou bem

- Nenhuma tela estoura a largura do celular; a trilha e a lista de lições não têm nenhum alvo pequeno.
- Cada erro de preenchimento (primeiro acesso, perfil, editor, configurações) explica **o quê** e **como corrigir**, em português, e nada é gravado quando há erro.
- O membro **nunca** recebe material interno (nota pastoral, sugestão de vídeo, gabarito do quiz, `[PREENCHER]`), nem pela tela, nem pelo banco.
- O membro não avança por cima das regras de liberação, nem chamando a ação direto.
- O contraste de 31 pares de cores passa no WCAG AA.

## Limites e pontos de atenção

1. **Simulação, não homologação.** Repita o essencial no Supabase de verdade (roteiro no checklist). Vale também para o **envio real de e-mail** (o teste usa um provedor de mentirinha) e para o **agendador**.
2. **A biblioteca do Grupo de Discipulado é rascunho.** As 28 lições foram escritas por mim e conferidas contra a tabela do handoff, mas **precisam de revisão pastoral** (e as sensíveis, de um profissional) e do preenchimento dos `[PREENCHER]`. Os telefones de emergência precisam ser conferidos.
3. **Termos e Política são minutas** sem os dados da igreja (razão social, encarregado de dados, contato, foro).
4. O texto colocado no lugar dos `[PREENCHER]` do Ciclo 3 ("INFORMAÇÃO DE TESTE") **existiu só dentro do teste**. Os dados reais da igreja continuam pendentes.
5. **Não testado:** leitor de tela e navegação só por teclado de verdade; celulares reais; conexão lenta; o registro do service worker (o navegador embutido não permite).
6. **Não construído:** WhatsApp, vários campi, Ciclo 4, e-mails do grupo (veja [PENDENCIAS.md](PENDENCIAS.md)).

## Números finais

| Área | Testes |
| --- | --- |
| Regras e componentes (`src`) | 314 |
| Banco: acesso, segurança, importação, editor, pessoas, painel, conta, quiz, cuidado, lembretes, certificados, grupos, biblioteca (`tests/db`) | 239 |
| **Usabilidade com as três pessoas + auditoria de acessibilidade (`tests/e2e`)** | 139 |
| Autorização em código (`tests/security`) | 82 |
| Service worker (`tests/pwa`) | 7 |
| **Total** | **781, todos passando** |
