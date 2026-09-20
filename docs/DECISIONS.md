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

## Perguntas em aberto para o pastor

| Pergunta | Por quê |
| --- | --- |
| As lições têm de **355 a 616 palavras**, mas o molde da seção 15 pede **700 a 1.200**. Está bom assim ou devemos ampliar? | O texto mais curto combina com leitura no celular, mas foge do molde aprovado |
| Alguma lição dos Ciclos 1 a 3 deve ser marcada como **sensível** (aviso de que não substitui aconselhamento, botão "Pedir ajuda pastoral")? Candidatas: Ciclo 2, lições de finanças e de perdão | Hoje todas entram como não sensíveis; a lista de sensíveis do handoff (0.7) cobre só a biblioteca do Grupo de Discipulado |
| O "Botão sugerido" do batismo ("Quero me batizar", com link do formulário) deve virar chamada para ação real? | Está guardado como nota interna; precisa do link de inscrição |

## Ainda não feito (propositalmente)

| Item | Motivo |
| --- | --- |
| **Editor de lições e pré-visualização de rascunhos no painel** | Próximo passo. Sem ele, a revisão do pastor e a publicação só acontecem por SQL (ver RUNBOOK); é o que falta para o fluxo "revisar, editar e publicar" |
| Lista de membros, ficha do membro e painel (RF-22 a RF-24) | MVP, depois do editor |
| Exportar e excluir os próprios dados (RF-27) | MVP; a exclusão exige a chave `service_role` no servidor, então pede cuidado extra. As cascatas no banco já estão testadas |
| Perfil do membro (trocar versão da Bíblia, revogar consentimentos) | MVP |
| Service worker e uso offline | Com as telas de lição prontas, já dá para fazer; o manifesto e os ícones provisórios já permitem instalar o app |
| Ícones definitivos, cores e logotipo | Aguardam o material oficial da igreja (`npm run icons` gera os provisórios) |
| Termos de Uso e Política de Privacidade | Páginas com aviso "em elaboração"; o texto depende de revisão jurídica |
| Sentry e Resend | Sentry após o piloto; Resend na V2 |
