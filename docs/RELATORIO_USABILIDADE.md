# Relatório dos testes de usabilidade

Data: 20/09/2026. Três pessoas simuladas percorrem o sistema pelo **código real do aplicativo** (as telas e as ações do servidor), sobre um banco Postgres em memória com **as mesmas migrações e regras de segurança** que irão para o Supabase.

## Leia primeiro: o que este teste é e o que não é

| É | Não é |
| --- | --- |
| O código real de cada tela e de cada ação, rodando de ponta a ponta | Um teste no Supabase de verdade (as contas ainda não existem) |
| As regras de acesso do banco valendo de verdade (RLS, permissões, funções) | Um teste do login com Google, da rede ou do PostgREST |
| Um roteiro na ordem em que uma igreja usaria o sistema | Um teste com pessoas reais, com leitor de tela ou com teclado |

As pessoas **não são contas reais**: são usuários de um banco em memória, criados no mesmo formato que o login do Google criaria. Não é possível criar contas reais daqui (o login é do Google e o Supabase ainda não existe). O roteiro de conferência no ambiente real está em [CHECKLIST_PILOTO.md](CHECKLIST_PILOTO.md).

**Sobre o "Claudio, discípulo":** o **Grupo de Discipulado** (discipulador, grupos, biblioteca de 24 lições e 5 trilhas) é uma fase posterior do plano e não existe ainda. O Claudio é um **membro avançado**, que percorre os três ciclos.

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

Achados de etapas anteriores, no mesmo espírito (já corrigidos): recursão infinita em políticas de acesso; nível dos títulos das lições importadas; versículo-chave digitado sem acento ou em minúsculas era recusado; `/igreja`, `/admin` e outras telas tentavam ser pré-renderizadas sem login.

## O que funcionou bem

- Nenhuma tela estoura a largura do celular; a trilha e a lista de lições não têm nenhum alvo pequeno.
- Cada erro de preenchimento (primeiro acesso, perfil, editor, configurações) explica **o quê** e **como corrigir**, em português, e nada é gravado quando há erro.
- O membro **nunca** recebe material interno (nota pastoral, sugestão de vídeo, gabarito do quiz, `[PREENCHER]`), nem pela tela, nem pelo banco.
- O membro não avança por cima das regras de liberação, nem chamando a ação direto.
- O contraste de 31 pares de cores passa no WCAG AA.

## Limites e pontos de atenção

1. **Simulação, não homologação.** Repita o essencial no Supabase de verdade (roteiro no checklist).
2. **Grupo de Discipulado não existe.** Nenhuma das 5 trilhas da biblioteca foi testada porque não foram construídas.
3. **Lição arquivada:** quem já a concluiu **não consegue reabri-la** (o progresso continua no banco). Pergunta em aberto em [DECISIONS.md](DECISIONS.md).
4. A **busca em Pessoas diferencia acentos** ("Flavia" não acha "Flávia").
5. O texto colocado no lugar dos `[PREENCHER]` do Ciclo 3 ("INFORMAÇÃO DE TESTE") **existiu só dentro do teste**. Os dados reais da igreja continuam pendentes.
6. **Não testado:** leitor de tela e navegação só por teclado de verdade; celulares reais; conexão lenta.

## Números finais

| Área | Testes |
| --- | --- |
| Regras e componentes (`src`) | 182 |
| Banco: acesso, segurança, importação, editor, pessoas, painel, exclusão de conta (`tests/db`) | 109 |
| **Usabilidade com as três pessoas + auditoria de acessibilidade (`tests/e2e`)** | 67 |
| Autorização em código (`tests/security`) | 38 |
| Service worker (`tests/pwa`) | 7 |
| **Total** | **403, todos passando** |
