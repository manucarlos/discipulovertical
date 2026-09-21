# Decisões técnicas

Registro das escolhas feitas na construção, com o motivo. As decisões de produto (perfis, regras da trilha, LGPD) estão em [HANDOFF.md](HANDOFF.md), seção 0.3, e não se repetem aqui.

## Aprovadas pelo pastor em 19/09/2026

| Tema | Decisão |
| --- | --- |
| Pasta do projeto | `Documents/github/vertical-discipulado`, separada do projeto `diretorio-igreja` |
| Stack | Next.js 16 (App Router) + TypeScript + Tailwind 4, Supabase, Vercel. Gerenciador de pacotes: `npm` |
| Idioma do código | Identificadores em inglês (`profiles`, `lessons`…). Interface, mensagens e conteúdo em português do Brasil |
| Editor de blocos | TipTap, salvando JSON |
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

### Perfil do membro e exclusão de conta (RF-27)

- **Exclusão feita por uma função do banco** (`delete_my_account`, migração 0009), não pela API administrativa. Assim o site **nunca guarda a chave secreta** (`service_role`): um teste garante que nenhum código do app a menciona. A função só age sobre quem a chama (`auth.uid()`), não recebe "qual conta".
- **O que some:** perfil, consentimentos, progresso das lições e dos ciclos, e a sessão. **O que fica, sem vínculo com a pessoa:** o histórico de versões de lições que ela escreveu (`author_id` vira nulo) e o log de auditoria (`actor_id` vira nulo). O registro `account_deleted` guarda só o perfil que ela tinha, sem identificador nenhum (testado).
- **O único administrador não exclui a própria conta** (a mensagem diz para promover outra pessoa antes). Quem exclui e depois entra de novo começa do zero.
- **Confirmação por digitação** (`EXCLUIR`, em qualquer caixa) antes de excluir.
- **Baixar meus dados** (`/perfil/exportar`): arquivo JSON em português com perfil, consentimentos e progresso, montado só com as linhas da própria pessoa (a RLS já garante), com `Cache-Control: no-store`.
- **Lembretes:** cada canal tem consentimento próprio. Ligar grava um aceite novo (com a versão do termo); desligar revoga sem apagar o histórico. Apagar o número de WhatsApp revoga o lembrete de WhatsApp junto, e não dá para ligá-lo sem número. **O envio dos lembretes é V2**: hoje só os consentimentos são gravados.
- **Consentimento de dados não é "desligável"**: retirá-lo equivale a sair da plataforma, e o caminho é excluir a conta.

### Nossa Igreja editável (RF-15)

- Tela `/admin/igreja`, só Admin. Quem e quando editou (`updated_by`, `updated_at`) são carimbados **por gatilho no banco**, então o navegador não forja; cada mudança de texto entra no log (`church_page_updated`).
- Texto simples: linha em branco separa parágrafos. Página sem texto aparece ao membro como "Em breve".

### Painel de indicadores (seção 11)

- **Formas escolhidas pelo guia de visualização:** números-chave em blocos (não gráficos); "onde as pessoas estão" em barras horizontais com **ênfase** (só "Parado" na cor da igreja, com ícone e rótulo; o resto em cinza); funil por lição e por ciclo em **tabelas com barra dentro da célula**, então todo valor também está em texto e a tabela é o "gêmeo de leitura". Uma cor só, sem arco-íris.
- **Duas funções no banco.** `admin_dashboard()` (só Admin) e `content_metrics()` (Editor e Admin, **sem nenhum dado pessoal**, provado por teste). Só **membros** contam; a equipe fica de fora dos números.
- **Situação das pessoas numa função interna única** (`member_situation()`, migração 0010), usada pela lista, pela ficha e pelo painel, então os três nunca discordam. Corrige uma regra descoberta nos testes de usabilidade: **Admin e Editor nunca aparecem como "parados"**; o alerta é para membros e cuidadores.
- **Indicadores:** novos no período (7, 30 ou 90 dias), começaram em até 7 dias (só conta quem já teve 7 dias), parados, concluíram a trilha, conhecem a visão (RN-12: as 7 lições com a etiqueta "visão"), conclusão e tempo médio por ciclo, funil por lição e "onde mais gente parou". Sem base para a conta, aparece "—" em vez de um 0% enganoso.
- **Ainda não há** o indicador "contato em 3 dias" nem "encerramentos pendentes": dependem dos alertas e dos encerramentos da V2.

### Testes de usabilidade com três pessoas (`tests/e2e`)

- **Claudião** (administrador), **Claudinho** (membro novo) e **Claudio** (discípulo avançado) percorrem o sistema **rodando o código real** das páginas e das ações do servidor, sobre o banco em memória com as regras de segurança reais. Detalhes e achados em [RELATORIO_USABILIDADE.md](RELATORIO_USABILIDADE.md).
- **Como funciona:** `tests/e2e/supabase-pg.ts` imita o subconjunto do cliente do Supabase que o app usa. Cada chamada roda numa transação com o papel `authenticated` e a identidade da pessoa, como o PostgREST faz. `tests/e2e/world.ts` cria as pessoas "como o Google faria", faz o tempo passar (deslocando os carimbos de data do progresso) e renderiza as páginas.
- **É uma simulação fiel, não a homologação.** Não cobre a rede, o login do Google nem o PostgREST em si. Por isso o [CHECKLIST_PILOTO.md](CHECKLIST_PILOTO.md) traz um roteiro para repetir o essencial no Supabase de verdade.

### Acessibilidade e usabilidade

- **Contraste WCAG AA calculado a partir de `globals.css`** (`src/lib/contrast.test.ts`, 31 pares): tema claro, modo escuro da leitura, selos coloridos e barras. Achou o botão de destaque do modo escuro (branco sobre rosa); agora existe a cor `--on-brand`.
- **Auditoria estrutural de cada tela** (`tests/e2e/a11y.ts`, ~40 telas vistas por cada perfil): um `<h1>` por página, níveis de título sem pular, todo campo e botão com nome, links com texto, `rel="noopener"`, IDs únicos, barras de progresso com nome e valor, tabelas com cabeçalhos, formulários com botão de envio. O teste prova que o auditor pega cada falha (com um HTML propositalmente ruim).
- **Alvos de toque medidos no navegador em 375px:** os cabeçalhos tinham 20px de altura e passaram a 44px; botões da leitura e links do painel também. Nenhuma tela tem rolagem horizontal da página.
- **Não coberto:** teste com leitor de tela e com teclado de verdade, e contraste de imagens (o app quase não tem). Recomenda-se uma rodada com pessoas reais no piloto.

### Uso offline (PWA)

- **Versão conservadora, de propósito.** O service worker guarda só os arquivos estáticos (nomes que mudam a cada versão) e a página `/offline`, e **nunca guarda páginas com dados da pessoa**. Motivos: celular compartilhado não pode mostrar a lição ou o progresso de outra pessoa (LGPD), e uma página em cache mostraria progresso desatualizado.
- **O que o handoff pedia** (lições já abertas disponíveis offline, com o progresso sincronizando depois) **fica para depois**: pede um desenho de privacidade (limpar o cache ao sair, uma pessoa por aparelho) e de sincronização.
- Testado por simulação (`tests/pwa/sw.test.ts`), inclusive o que ele **não** faz. **O navegador embutido do aplicativo não deixa registrar service workers**, então o registro real precisa ser conferido no Chrome do celular (roteiro no checklist).

### Segurança

- **Invariantes em todo o schema** (`tests/db/invariants.test.ts`): toda tabela tem RLS; o papel anônimo não tem privilégio em nenhuma tabela e só executa uma lista **fechada** de sete funções (agendador, descadastro, verificação de certificado e `public_features`, cada uma protegida por um segredo ou código); ninguém recebe TRUNCATE, REFERENCES ou TRIGGER; só onze tabelas aceitam DELETE por usuário logado, sempre atrás de política; nenhuma política de escrita libera tudo; toda função `SECURITY DEFINER` fixa o `search_path`. Vale para migrações futuras.
- **Achou:** 7 funções executáveis pelo papel anônimo (sem dano possível, mas indevidas). Migração 0008 fechou e passou a fechar por padrão as futuras.
- **Autorização em código** (`tests/security/authorization.test.ts`, mais de 100 verificações, que crescem sozinhas com cada ação e tela nova): toda ação do servidor confere a identidade, as ações do painel exigem equipe e as de dados de outras pessoas exigem administrador, toda tela do painel confere de novo (além do layout), rotas de dados exigem login, o retorno do Google valida o destino (sem redirecionamento aberto), páginas `/dev` somem em produção e nenhum código usa a chave secreta.
- **Cabeçalhos de segurança** (`next.config.ts`): `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- **Dependências:** `npm audit` sem vulnerabilidades. Nenhum `dangerouslySetInnerHTML`, `eval` ou similar no código.
- **Política de conteúdo (CSP)** feita em `src/proxy.ts` + `src/lib/csp.ts`, com um *nonce* novo por requisição. Scripts: só os da página (sem `unsafe-inline` nem `unsafe-eval` em produção); conexões: o site e o Supabase; vídeo: só YouTube em modo de privacidade e Vimeo; ninguém embute o app; formulários só para o próprio site. Estilos usam `unsafe-inline` (um atributo `style` não aceita nonce, e o editor injeta estilos): risco bem menor que script. **Conferido num build de produção no navegador:** todos os scripts levam o nonce, o botão do login hidrata e funciona, sem violações. Efeito colateral: as páginas que eram estáticas (`/termos`, `/privacidade`, `/offline`) passam a ser renderizadas a cada acesso.
- Limites de tentativas de login e proteção de bots são do Supabase e do Google (ver checklist).

### Recursos que nascem desligados (RF-28)

- **Chaves em `app_settings`** (Administração > Configurações), só o Admin grava, cada mudança no log. A regra 0.6 do handoff manda não abrir V2, V3 e Grupos antes de validar o MVP; assim tudo está pronto, mas **desligado**. O banco confere a chave (função `feature_enabled`) dentro das políticas e funções, então desligar esconde tudo mesmo que alguém chame a API direto.
- Chaves: quiz, reflexão, vídeo, cuidadores, lembretes, encerramentos, certificados, grupos, sequência de dias, entrar com e-mail. Só chaves conhecidas e valores do tipo certo entram (restrições no banco).
- Leitura com falha = tudo desligado (nunca liga "por engano").

### Quiz, prática e reflexão (RF-12, RF-13, RN-02, RN-03)

- **O gabarito nunca sai do banco:** o membro pede as perguntas por `get_quiz()` (sem resposta certa nem explicação) e corrige por `submit_quiz()`, que devolve só acertou/errou e a explicação. Aprovação: 2 de 3 (arredondando para cima; nunca menos de 1). Refazer é ilimitado.
- Com o quiz ligado, uma lição que tem perguntas só conclui com tentativa aprovada, **no banco** (gatilho em `lesson_progress`), não só na tela. Quem já tinha concluído antes de o quiz ser ligado não é afetado.
- Reflexão privada (uma por lição); o dono a lê, o cuidador e o Admin leem por `person_reflections()`, que **registra cada consulta** (sem o conteúdo). A pergunta de reflexão da lição aparece acima do campo. Excluir a conta apaga tudo.

### Cuidadores e alertas (RF-20, RF-21, RF-25, RN-07, RN-13)

- O cuidador vê **só os membros atribuídos**, pelo banco: progresso por política em `lesson_progress`; contato e reflexões por funções que conferem a atribuição e registram a consulta. **Notas de cuidado**: só o autor e o Admin leem; só acrescentar e apagar as próprias.
- Um cuidador ativo por membro; rodízio por menor carga; quem deixa de ser cuidador devolve os membros para a fila do Admin.
- **Alertas** (14 dias parado): abertos e fechados pela função `sync_stalled_alerts()`, chamada ao abrir as telas. Depois de resolvido por uma pessoa, não abre outro por 14 dias; quem volta a ler tem o alerta fechado sozinho. Sem cuidador, o alerta é do Admin.

### Lembretes por e-mail (RF-16, seção 10)

- **Sem a chave secreta do Supabase no site.** O agendador chama `/api/cron/lembretes` com `CRON_SECRET`; a rota fala com o banco só por três funções (`cron_snapshot`, `cron_enqueue`, `cron_report`, mais `cron_certificates`) que exigem o mesmo segredo, guardado **só como hash** em `app_config`. Quem tem o segredo lê o necessário para montar os avisos; nada mais. Elas são as únicas funções (além do descadastro, da verificação de certificado e de `public_features`) executáveis sem login, e um teste de invariantes trava essa lista.
- **Planejador puro** (`src/lib/reminders/plan.ts`, testado): consentimento; 8h a 20h de Brasília; **2 lembretes por semana** (conferido de novo no banco); uma mensagem por ocorrência; a espera pela lição não conta como ausência; quem voltou não recebe convite; falha recente é reenviada por 2 dias. Provedor trocável (`src/lib/email`): Resend por HTTP e um provedor de mentirinha nos testes.
- Textos editáveis pelo Admin (variáveis validadas ao salvar), rodapé de descadastro sempre presente, **descadastro em um clique** por código do e-mail (GET nunca descadastra; POST ou botão sim), registro de cada envio com status e erro.
- O agendador diário do `vercel.json` cabe no plano gratuito; frequência maior pede plano Pro ou um agendador externo.

### Encerramentos e certificados (RF-18, RF-19, RN-05, RN-06)

- O encontro **não trava** o ciclo seguinte (RN-05); vira "marco pendente". Presença confirmada pelo Admin por lista; certificado só para quem **concluiu o ciclo e teve presença** (RN-06), com código único `VC-XXXX-XXXX-XXXX` e o nome gravado como estava.
- **PDF sem biblioteca:** gerado à mão (Helvetica, A4 na horizontal), com tabela de referências calculada; um teste confere offsets e comprimentos, e o arquivo foi aberto num leitor de PDF de verdade (MuPDF) para conferir acentos e centralização. Limite: alfabetos fora do latino viram "?".
- **Verificação pública** `/verificar`: só nome, ciclo e data, por código (48 bits). Excluir a conta apaga o certificado.
- O "não haverá certificado" da seção 17 vale para as **trilhas do grupo** (RG-14); o handoff prevê certificado nos ciclos (RF-19, RN-06).

### Planilhas CSV (RF-26)

- Só o Admin; UTF-8 com BOM, separador `;` (Excel em português), **neutralização de fórmulas** (`=`, `+`, `-`, `@` ganham apóstrofo: um nome cadastrado não vira fórmula). Sem WhatsApp (mínimo necessário). **Sem registro, sem arquivo:** se o log falhar, nada é baixado.

### Vídeo, sequência de dias e entrar com e-mail (RF-11, RF-30, RF-31)

- **Vídeo:** só YouTube e Vimeo, guardando tipo e código (nunca o link inteiro), em modo de privacidade (`youtube-nocookie`, `dnt=1`), com transcrição. Link inválido é recusado ao salvar, nunca descartado em silêncio.
- **Sequência e marcos:** discretos, só comemoram (sem "você perdeu a sequência").
- **Entrar com e-mail:** link sem senha, feito no navegador (o Supabase guarda ali o código de verificação). A tela de login sabe se está ligado por `public_features()`, que devolve só essa informação.

### Grupo de Discipulado (seções 17 a 20)

- **Progresso do grupo em tabela própria** (`group_progress`, `group_reflections`), em vez de mudar a chave de `lesson_progress`, como a seção 18 descrevia: não mexe no progresso da trilha de novos convertidos, que já está em uso.
- **O discipulador** é uma marca (`is_discipler`) que o Admin dá; a mesma pessoa acumula perfis. Lições da **biblioteca** (`kind = 'library'`, sem ciclo) só abrem para quem está, ou conduz, um grupo cuja trilha as inclui.
- **Privacidade no banco:** o discipulador lê só dados de quem **ainda está** no grupo (sair tira o acesso) e, das reflexões, **só as compartilhadas**; nem o Admin lê as reflexões do grupo. Nome dos membros vem por `group_roster()`, sem e-mail nem WhatsApp. Um pedido de ajuda **direto à equipe pastoral não é visto pelo discipulador**. O calendário (uma lição por dia ativo, pausas, "em atraso", entrada tardia) é código puro testado (`src/lib/groups/calendar.ts`).
- **Biblioteca:** 24 lições + 4 de formação do discipulador + 6 trilhas prontas, geradas por `npm run import:library` como rascunho. Escrevi em linguagem pastoral, sem texto bíblico literal, sem inventar contato da igreja (`[PREENCHER]` bloqueia a publicação), com avisos de segurança nas sensíveis. **Precisam de revisão pastoral e, nas sensíveis, de um profissional.** Testes conferem títulos, temas, sensibilidade e trilhas contra a tabela do handoff.
- Alertas (RG-11) aparecem no painel do discipulador; o resumo semanal por e-mail do grupo fica para depois.

### Termos e Política (minutas)

- Textos-base completos em `src/lib/legal-text.ts`, exibidos em `/termos` e `/privacidade` com aviso de minuta e os pontos que dependem da igreja **em destaque** (`[A PREENCHER PELA IGREJA: ...]`). Não inventei razão social, CNPJ, encarregado, contato nem foro. Testes garantem que a política descreve os acessos como o sistema realmente funciona.

### Busca e log de consultas

- A busca em Pessoas ignora acentos e maiúsculas (função `normalize_text`). Consultar a ficha de alguém grava `person_viewed` (uma vez a cada 10 minutos por pessoa; se o registro falhar, a ficha não abre).

## Perguntas em aberto para o pastor

| Pergunta | Por quê |
| --- | --- |
| Editar uma lição **já publicada** deve valer na hora (como está) ou passar por revisão antes de ir ao ar? | Hoje só o Admin edita lição publicada e a mudança é imediata; o histórico permite desfazer |
| As lições têm de **355 a 616 palavras**, mas o molde da seção 15 pede **700 a 1.200**. Está bom assim ou devemos ampliar? | O texto mais curto combina com leitura no celular, mas foge do molde aprovado |
| Alguma lição dos Ciclos 1 a 3 deve ser marcada como **sensível**? Candidatas: Ciclo 2, lições de finanças e de perdão | A caixa existe no editor. O aviso e o botão "Pedir ajuda pastoral" já existem, mas só valem nas lições do **Grupo de Discipulado**; na trilha de novos convertidos a marcação ainda não muda nada para o membro |
| O "Botão sugerido" do batismo ("Quero me batizar") deve virar chamada para ação real? | Precisa do link do formulário de inscrição |
| ~~Registrar quem consultou a ficha de uma pessoa?~~ | **Feito (padrão adotado):** cada consulta do Admin ou do cuidador fica no log (`person_viewed`, uma vez a cada 10 minutos por pessoa), assim como a leitura de reflexões. Se preferir não registrar, é só dizer |
| ~~O que o membro vê depois de **arquivar** uma lição que já concluiu?~~ | **Feito (RN-11):** ela sai da trilha, mas quem a concluiu pode reabrir e reler (só leitura), numa seção "Lições que saíram da trilha" |
| As **28 lições da biblioteca** ficaram mais curtas (230 a 500 palavras) que o molde (400 a 700). Ampliar? | O texto curto combina com leitura diária no celular; a revisão pastoral decide |
| Quais telefones de emergência devem aparecer nas lições sensíveis? | Usei **CVV 188**, **SAMU 192**, **Ligue 180** e **190**. Precisam ser conferidos antes de publicar |
| O consentimento do grupo (o que o discipulador vê) está adequado? | Texto em `src/lib/groups/forms.ts`; passa pela revisão jurídica junto com os termos |

## Ainda não feito

Tudo o que o plano previa foi construído. O que sobra depende de contas, contratos ou decisões da igreja e está no mapa completo em [PENDENCIAS.md](PENDENCIAS.md): WhatsApp (RF-17, exige provedor), vários campi (RF-29), Ciclo 4, e-mails do Grupo de Discipulado, criar lição da biblioteca pela tela, montar trilha arrastando, monitoramento de erros e o uso offline das lições com sincronização.
