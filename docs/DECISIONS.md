# Decisões técnicas

Registro das escolhas feitas na construção, com o motivo. As decisões de produto (perfis, regras da trilha, LGPD) estão em [HANDOFF.md](HANDOFF.md), seção 0.3, e não se repetem aqui.

## Aprovadas pelo pastor em 19/09/2026

| Tema | Decisão |
| --- | --- |
| Pasta do projeto | `Documents/github/vertical-discipulado`, separada do projeto `diretorio-igreja` |
| Stack | Next.js 16 (App Router) + TypeScript + Tailwind 4, Supabase, Vercel. Gerenciador de pacotes: `npm` |
| Idioma do código | Identificadores em inglês (`profiles`, `lessons`…). Interface, mensagens e conteúdo em português do Brasil |
| Editor de blocos | TipTap, salvando JSON (a construir) |
| Ambientes | Homologação e produção na nuvem; desenvolvimento no computador |

## Tomadas durante a construção

### Banco de dados

- **RLS em tudo, com privilégios explícitos.** Cada tabela ativa RLS, revoga tudo de `anon` e `authenticated` e concede só o necessário. O Supabase concede tudo por padrão, então esquecer um `revoke` abriria a tabela.
- **Papel só muda por função.** `profiles.role` não é editável pelo membro (privilégio por coluna). A promoção passa por `admin_set_role()`, que só o Admin executa, impede remover o último Admin e grava no log.
- **Primeiro Admin por e-mail** em `app_config` (`initial_admin_email`), lido pelo gatilho de criação de perfil. Só vale com e-mail confirmado. `app_config` não tem policy: só o SQL Editor acessa.
- **Auditoria só de inserção.** Um gatilho bloqueia UPDATE e DELETE, exceto anular `actor_id` quando a conta do autor é excluída. Assim a exclusão de conta (LGPD) não quebra o log. Não gravar dados pessoais em `details`.
- **Campos internos em tabela separada** (`lesson_internal_notes`: nota para revisão pastoral, sugestão de vídeo, aviso de rascunho). RLS filtra linhas, não colunas; separar é a forma segura de garantir que o membro nunca os receba (regra 0.4.7).
- **`quiz_questions` só para a equipe** por enquanto, porque a tabela guarda a resposta certa. Na V2 o membro recebe as perguntas por uma função que omite o gabarito.
- **Editor não publica** e só edita lição em rascunho ou revisão; isso é imposto por policy, não só pela interface.
- **Lição com `[PREENCHER]` não publica:** `check` no banco (`lessons_no_publish_with_placeholders`), valendo até para o Admin.
- **Lição com progresso não é apagada:** chave estrangeira `RESTRICT`. Só arquiva (RN-11).
- **Políticas sem ciclo.** `lessons` e `lesson_progress` se referenciam; o Postgres recusa isso como recursão infinita. `has_progress_on_lesson()` (`SECURITY DEFINER`) quebra o ciclo. Foi um bug real, achado pelos testes.
- **`church_pages`** é tabela nova (não estava na seção 8 do handoff) para o conteúdo editável de "Nossa Igreja". Os textos de visão e missão vêm dos cartazes e **precisam da conferência do pastor**; as outras páginas ficam vazias (nada é inventado).
- **`bible_versions.rights_holder` fica em branco** até a licença ser confirmada por escrito. O banco guarda só metadados e um modelo de URL de leitor externo, nunca texto bíblico.

### Regras de negócio

- **Liberação de lições (RN-01) no TypeScript**, em `src/lib/lessons/release.ts`, como funções puras com testes. O banco só garante que cada um lê e grava o próprio progresso.
  - *Custo:* um membro que chame a API diretamente poderia marcar uma lição como concluída sem cumprir o prazo. Isso só afeta o próprio progresso e o painel dele.
  - *Reforço futuro, se preciso:* mover a conclusão para uma função no banco (RPC) que valide a regra.
- **Validação de onboarding** (`src/lib/onboarding.ts`) também é função pura e testada.
- **Consentimento:** cada finalidade é uma linha em `consents`, com a versão do termo (`TERMS_VERSION`). `accepted_at` não pode ser informado pelo cliente. Índice único parcial impede aceite duplicado enquanto ativo.

### Bíblia

- Interface `BibleProvider.getPassage(ref, versionCode)` em `src/lib/bible/`. A implementação atual só devolve **link para o BibleGateway** (NVI = `NVI-PT`, NTLH = `NTLH`; confirmado na lista de versões em português do site). Trocar por texto licenciado não exige mexer nas lições.
- As referências no texto das lições são detectadas por expressão regular (`findReferences`) e renderizadas como toque para abrir a passagem.

### Aplicação

- **Next.js 16:** `middleware` virou `proxy` (`src/proxy.ts`); `params`, `searchParams` e `cookies()` são assíncronos. O `AGENTS.md` do projeto manda consultar `node_modules/next/dist/docs/` antes de codar.
- **Sessão:** `proxy.ts` renova o cookie e redireciona quem não entrou; as páginas conferem o usuário de novo com `getUser()`. O proxy nunca é a única barreira.
- **Páginas dependentes de login usam `await connection()`.** Sem isso, e sem as variáveis de ambiente no build, o Next as prerenderiza como estáticas.
- **Sem o Supabase configurado, o app não quebra:** mostra avisos em vez de erro (útil enquanto as contas não existem).
- **Chave do Supabase:** usamos `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (a chave "publishable", que substitui a antiga `anon`). Nunca usar a chave `secret`/`service_role` no navegador.

### Testes

- **Regras de acesso do banco são testadas de verdade**, com o PGlite (Postgres em WebAssembly) em `tests/db/`. O harness imita o que o Supabase fornece (schema `auth`, `auth.uid()`, papéis, privilégios padrão). Não há Docker nem Supabase CLI nesta máquina, então essa foi a forma de testar sem eles.
  - *Limite:* o PGlite não é o Supabase. Antes de ir a produção, conferir os mesmos cenários no projeto de homologação real.
- Regras de negócio e Bíblia têm testes em `src/**/*.test.ts`. Rodar tudo: `npm test`.

### Importação do conteúdo (Parte 2 do handoff)

- **O importador gera SQL, não chama a API.** `npm run import:sql` lê a Parte 2 de `docs/HANDOFF.md` e escreve `content/generated/*.sql`. O pastor cola no SQL Editor do Supabase, que roda como dono do banco. Assim **nenhuma chave secreta** (`service_role`) é necessária.
- **Seguro para repetir:** ciclo ou lição que já existe é ignorado, então uma segunda importação nunca sobrescreve o que o pastor editou. Tudo roda em uma transação: se algo falhar, nada é gravado.
- **Tudo entra como rascunho.** `--publish` existe só para testar em homologação (e nunca publica lição com `[PREENCHER]`; o banco também barra).
- **O parser é estrito.** Ele quebra a importação, com o nome da lição, se: o YAML e o texto discordam (título, versículo-chave, quantidade de `[PREENCHER]`), o versículo-chave não é uma referência bíblica reconhecida, o quiz tem resposta inválida ou há conteúdo inesperado em prática, reflexão ou quiz.
- **`[PREENCHER]` conta em qualquer parte da lição**, inclusive nas notas internas. É por isso que `c3-l04` (cujo marcador está na nota pastoral) também fica bloqueada. Confere com a Parte 3: 38 marcadores em 10 lições.
- **`estimated_minutes` vem do YAML**, não do cálculo de 200 palavras por minuto. O YAML (5 a 9 min) cobre leitura, reflexão, prática e quiz; só o texto principal leva 2 a 4 min.
- **Formato dos blocos:** `heading` (nível 1 = seção da lição), `paragraph`, `list`, `quote` e `table`, com markdown inline mínimo (`**negrito**`, `*itálico*`). Referências bíblicas ficam como texto e são detectadas na exibição.
- **Material interno** (nota pastoral, sugestão de vídeo, aviso de rascunho, botão sugerido) vai para `lesson_internal_notes` (a migração 0005 acrescentou `button_suggestion`) e o **quiz com gabarito** para `quiz_questions`. Nenhum dos dois entra no JSON que o membro lê.

### Telas do membro

- **Rotas:** `/` (Minha trilha), `/ciclo/[slug]`, `/licao/[slug]`, `/igreja`. Ficam no grupo `(member)`, cujo layout exige login e primeiro acesso concluído.
- **Regras de liberação no servidor.** A página da lição e as três *server actions* (`openLesson`, `saveReadingPosition`, `completeLesson`) recalculam a trilha com `computeLessonStates` e recusam lição bloqueada. Lição bloqueada redireciona para o ciclo, que mostra quando ela abre.
  - *Limite conhecido:* a RLS deixa o membro ler o texto de qualquer lição **publicada**, então quem chamar a API diretamente lê uma lição antes da hora. O ritmo é pedagógico, não segredo. Se um dia for preciso trancar de verdade, o texto passa a ser entregue por função no banco.
- **"Abrir" a lição grava o progresso** (ação disparada pelo navegador ao abrir, nunca durante a renderização). Isso alimenta a cota semanal de liberações.
- **Retomar (RF-09):** a posição é a fração rolada da página (0 a 1), gravada com atraso de 1,5 s, ao esconder a aba e ao sair. É uma aproximação: se a pessoa mudar o tamanho da letra, o ponto pode variar um pouco.
- **Preferências de leitura** (tamanho da letra e modo escuro, RF-08) ficam no `localStorage` do aparelho, atrás de `useSyncExternalStore`, sem divergência de hidratação; se o armazenamento falhar, valem só na visita.
- **Não exibidos ainda, de propósito:** reflexão e quiz (RF-12 e RF-13 são V2). Os dados já estão no banco. No MVP, "Concluir lição" não exige quiz (RF-10).
- **Ciclo concluído** mostra o convite para o encontro presencial e **não bloqueia** o ciclo seguinte (RN-05). O registro do encerramento e o certificado são V2.
- **Referências bíblicas** viram links pelo `BibleProvider` (`resolvePassageLinks`), na versão escolhida pelo membro. O texto da Bíblia nunca é exibido.
- **Conteúdo do banco é validado antes de exibir** (`asLessonContent`): bloco malformado é descartado em vez de derrubar a tela, já que editores vão escrever esse JSON.
- **Pré-visualização em `/dev/*`** (trilha, ciclo e lição do handoff com progresso fictício) existe só em desenvolvimento: em produção as páginas dão 404 e o proxy não as libera. Serve para ver as telas sem Supabase.
- **Sem Supabase configurado**, as telas do membro redirecionam para `/login`, que explica o que falta, em vez de mostrar erro.

### Testes desta etapa

- `tests/db/import.test.ts` aplica o SQL gerado num banco em memória e confere contagens, rascunhos, idempotência e que o membro não lê rascunho, gabarito nem notas internas.
- `tests/db/lesson-flow.test.ts` executa, como membro (RLS ligada), o SQL equivalente ao que as *server actions* pedem ao PostgREST (upsert com e sem `ignoreDuplicates`, update de posição, conclusão) e confirma o isolamento entre membros.
  - *Limite:* isso prova que **as permissões do banco permitem o fluxo**; as *server actions* em si e a integração com o Supabase real ainda não foram executadas (não há projeto Supabase). Conferir na homologação.
- O build de produção pegou uma página que tentava ser pré-renderizada sem login (`/igreja`); todas as telas do membro agora chamam `connection()`.

### Editor de lições

- **Editor visual com TipTap**, como aprovado. Só oferece o que o formato de armazenamento representa: título, subtítulo, negrito, itálico, listas, citação e tabela. Recursos que o formato não guarda (sublinhado, link, código, riscado, linha horizontal) ficam desligados, para nada se perder ao salvar.
- **Conversão sem perdas, testada nas 28 lições.** `src/lib/content/tiptap.ts` converte blocos <-> documento do editor, e um teste confirma que `docToBlocks(blocksToDoc(x))` devolve exatamente o original para todas as lições do handoff. Limites conhecidos: negrito e itálico ao mesmo tempo viram só negrito, e quebra de linha dentro de um parágrafo vira espaço.
- **Asteriscos e barras literais** digitados no editor são escapados (`\*`, `\\`) para não virarem itálico ao reler. O texto inline aprendeu esse escape.
- **`[PREENCHER]` destacado em amarelo dentro do texto** (decoração visual, não muda o conteúdo) e listado no painel de pendências, com o lugar e o que falta.
- **Salvar é uma função do banco, não várias chamadas.** `save_lesson` grava, numa transação só: nova versão, campos, notas internas e quiz. Falhou no meio, nada fica gravado (testado). Roda com as permissões de quem chama (`SECURITY INVOKER`), então a RLS continua valendo: o editor só salva rascunho ou em revisão; só o Admin salva lição publicada.
- **Conflito de edição:** o editor envia a versão que viu; se outra pessoa salvou depois, o banco recusa em vez de sobrescrever em silêncio, e a tela pede para recarregar.
- **Cada salvamento cria uma versão** (histórico imutável). Restaurar (`restore_lesson_version`) cria uma versão *nova* com o texto antigo, então o histórico só cresce. Tempo de histórico mostrado: as 30 versões mais recentes.
- **Editar lição publicada vale na hora** (só o Admin pode). O histórico permite desfazer. Não existe "rascunho paralelo" de lição publicada: é uma simplificação do MVP.
- **`has_placeholders` é recalculado pelo banco** a partir do texto (conteúdo e notas), nunca aceito do navegador. E há uma **barreira final na publicação**: um gatilho confere o texto real e recusa publicar com `[PREENCHER]` mesmo que a coluna esteja errada, ou sem versão de conteúdo.
- **Status:** rascunho, em revisão, publicada, arquivada. Editor: rascunho <-> em revisão. Admin: também publica, despublica, arquiva e restaura. A regra está em um lugar (`src/lib/admin/status.ts`), usada pela tela e pelo servidor, e a RLS impõe a mesma coisa no banco. Toda mudança de status entra no log de auditoria (`lesson_status_changed`).
- **Despublicar avisa** que a lição some inclusive para quem já a iniciou; arquivar não (quem já iniciou continua vendo). Por isso arquivar é a opção recomendada.
- **Criar e reordenar lições** também são funções do banco (`create_lesson`, `move_lesson`). A troca de posição é atômica; o Editor só reordena rascunhos, o Admin reordena tudo. Não há exclusão de lição: só arquivar (lição com progresso nunca é apagada).
- **Configurações do ciclo** (nome, semanas, dias entre lições, máximo por semana, ativo) só para o Admin, na tela da trilha. Não há criação de ciclos pela tela ainda (o importador cria os três).
- **Prévia idêntica à do membro** em `/admin/licao/[slug]/previa`: usa os mesmos componentes da leitura (`LessonView` e `ReadingShell`) sobre a versão *salva*. Alterações não salvas não aparecem lá.
- **Validação no servidor** (`validateLessonDraft`): título, versículo-chave (tolerante a maiúsculas e acento, gravado na forma canônica), tempo (1 a 120), etiquetas, limites de tamanho, quiz (2 a 6 alternativas, resposta certa marcada) e **nenhum bloco é descartado em silêncio**. Mensagens de erro do banco viram texto claro em português (`describeEditorError`).
- **Versículo-chave digitado à mão** aceita "joao 3:16" e grava "João 3.16". A detecção de referências *dentro* do texto das lições continua estrita, para evitar falsos positivos.
- **Correção de um erro meu da etapa anterior:** os títulos de seção eram gravados com `level: 2` embora o tipo documentasse `1`. Agora são `1`, em todas as 149 seções das 28 lições.
- **Peculiaridade do TipTap 3:** com `immediatelyRender: false` (necessário no Next), o `useEditorState` só atualiza na primeira transação. O editor aparece assim que existe, com a barra "em repouso" até o primeiro evento, em vez de esperar um estado que só chegaria depois de um clique.
- **Alterações não salvas:** aviso ao sair da página, botão "Salvar" só ativo com mudança, atalho Ctrl+S (Cmd+S), e os botões de status ficam bloqueados até salvar.
- **Pré-visualizações de desenvolvimento** `/dev/editor/[slug]` (com `?role=` e `?status=`) e `/dev/admin`: usam ações de mentirinha, mas passam pela validação real. Em produção dão 404.

### Testes do editor

- `tests/db/editor.test.ts` (21 testes): salvar (tudo ou nada, permissões, conflito, recálculo de `[PREENCHER]`), barreira de publicação, log de status, criar, restaurar e reordenar lições.
- `src/lib/content/editor.test.ts`, `src/lib/admin/admin.test.ts`: conversão sem perdas das 28 lições, escape de asteriscos, pendências (38 marcadores, iguais aos do importador), validação do rascunho, regras de status, mensagens de erro e configurações do ciclo.
- No navegador (com a pré-visualização): o editor abre sem "alterações" falsas, digitar marca "não salvo", salvar limpa, erros de validação aparecem e somem ao corrigir, negrito, desfazer, tabela (inserir, linha, excluir), modo somente leitura do Editor numa lição publicada, e os destaques amarelos.
- **Limite:** as *server actions* do editor (`saveLesson` etc.) e a integração com o Supabase real ainda não rodaram (não há projeto). O que foi provado é a lógica, as funções do banco e a interface. Conferir na homologação.

### Pessoas: lista, ficha e perfis (RF-23 e RF-24)

- **Só o Admin.** A lista e a ficha têm dados pessoais (nome, e-mail, WhatsApp, consentimentos), e o handoff diz que o Editor vê apenas métricas de conteúdo. A função do banco `admin_member_overview` confere `is_admin()` (`SECURITY DEFINER`) e as telas usam `requireAdmin`; o Editor que abrir `/admin/pessoas` volta para a trilha.
- **A situação é calculada no banco**, por uma única função, e usada pela lista *e* pela ficha (a ficha chama a mesma função), então as duas telas nunca discordam. Situações, em ordem de precedência: primeiro acesso pendente, concluiu a trilha, **parado**, ainda não começou, em andamento.
- **"Parado" segue a RN-07:** 14 dias ou mais sem atividade (abrir, ler ou concluir uma lição), contados da última atividade; quem nunca começou conta desde o primeiro acesso. Quando entra uma lição obrigatória nova, quem tinha concluído tudo deixa de aparecer como "concluiu" (testado).
- **Busca sem curingas:** o texto digitado é comparado como texto comum (`position`), então `%` e `_` não viram filtros por acidente. A busca ainda diferencia acentos ("Flavia" não acha "Flávia"); o `unaccent` do Postgres resolveria e fica como melhoria.
- **Paginação no banco** (25 por página, com o total de todas as páginas na mesma consulta), pensada para 5.000 membros.
- **Filtros na URL** (`?q=&papel=&situacao=&pagina=`): links compartilháveis; qualquer valor inválido é ignorado em vez de dar erro.
- **Trocar perfil** passa pela função `admin_set_role` que já existia: só o Admin, **protege o último administrador** e **grava no log de auditoria**. A tela ainda impede o Admin de mudar o **próprio** perfil (peça a outro), para ninguém se tirar do painel sem querer; a proteção do último Admin continua no banco.
- **Perfil "Cuidador"** já pode ser atribuído, mas **não dá nenhum acesso extra** até a V2 (as ferramentas do cuidador dependem das tabelas de atribuição). A tela avisa disso.
- **A ficha mostra a trilha do ponto de vista da pessoa** (reusa `loadTrail` e as mesmas regras de liberação, aplicadas ao progresso dela), além de consentimentos e do histórico de mudanças de perfil. Reflexões, notas de cuidado e respostas de quiz ainda não existem (V2), então não aparecem.
- **Acesso do Admin a dados pessoais não é registrado no log** (só as mudanças de perfil). O handoff exige registro apenas para notas de cuidado e reflexões privadas, que chegam na V2; se o pastor quiser registrar também a consulta de fichas, é uma mudança pequena.
- **Pré-visualização** `/dev/pessoas` e `/dev/pessoas/[id]` (com `?eu=1`, `?ok=1`, `?erro=1`): pessoas fictícias e data fixa, com filtros funcionando em memória. Em produção dão 404.

### Testes de Pessoas

- `tests/db/people.test.ts` (10 testes): só o Admin executa; cada situação; contagens e última atividade; filtros por situação e perfil; busca (nome, e-mail, maiúsculas, `%` e `_`); filtros combinados; paginação com total; situação inválida; lição nova tirando alguém de "concluiu".
- `src/lib/admin/admin.test.ts`: leitura dos filtros da URL (valores inválidos), links de paginação, "há N dias" no calendário de Brasília, formato do WhatsApp e novas mensagens de erro.
- **Limite:** as *server actions* e a integração com o Supabase real seguem sem execução (não há projeto). A lógica, as funções do banco e a interface estão provadas.

## Perguntas em aberto para o pastor

| Pergunta | Por quê |
| --- | --- |
| As lições têm de **355 a 616 palavras**, mas o molde da seção 15 pede **700 a 1.200**. Está bom assim ou devemos ampliar? | O texto mais curto combina com leitura no celular, mas foge do molde aprovado |
| Alguma lição dos Ciclos 1 a 3 deve ser marcada como **sensível** (aviso de que não substitui aconselhamento, botão "Pedir ajuda pastoral")? Candidatas: Ciclo 2, lições de finanças e de perdão | Hoje todas entram como não sensíveis. Agora o próprio editor tem a caixa "Tema sensível", mas o aviso ao membro ainda não existe |
| O "Botão sugerido" do batismo ("Quero me batizar", com link do formulário) deve virar chamada para ação real? | Está guardado como nota interna; precisa do link de inscrição |
| Editar uma lição **já publicada** deve valer na hora (como está) ou passar por revisão antes de ir ao ar? | Hoje só o Admin edita lição publicada e a mudança é imediata; o histórico permite desfazer |

## Ainda não feito (propositalmente)

| Item | Motivo |
| --- | --- |
| Painel com indicadores (funil por ciclo, taxa de conclusão, lições com mais abandono) | O handoff prevê na seção 11; a lista de pessoas já mostra quem está parado |
| Filtro por ciclo na lista de pessoas e por cuidador | Por ciclo cabe agora; por cuidador depende da V2 |
| Editor de "Nossa Igreja" (RF-15 é editável) | Os textos existem e o membro os lê; falta a tela de edição do Admin |
| Exportar e excluir os próprios dados (RF-27) | MVP; a exclusão exige a chave `service_role` no servidor, então pede cuidado extra. As cascatas no banco já estão testadas |
| Perfil do membro (trocar versão da Bíblia, revogar consentimentos) | MVP |
| Criar ciclo pela tela; arrastar e soltar lições | O importador cria os ciclos; as setas reordenam |
| Aviso de "tema sensível" e botão de ajuda pastoral para o membro | A caixa existe no editor e é gravada; a exibição ao membro vem com o módulo de ajuda |
| Service worker e uso offline | Com as telas de lição prontas, já dá para fazer; o manifesto e os ícones provisórios já permitem instalar o app |
| Ícones definitivos, cores e logotipo | Aguardam o material oficial da igreja (`npm run icons` gera os provisórios) |
| Termos de Uso e Política de Privacidade | Páginas com aviso "em elaboração"; o texto depende de revisão jurídica |
| Sentry e Resend | Sentry após o piloto; Resend na V2 |
