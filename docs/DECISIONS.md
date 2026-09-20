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

## Ainda não feito (propositalmente)

| Item | Motivo |
| --- | --- |
| Tela "Minha trilha", ciclo, lição, "Concluir lição" | Próximo passo do MVP |
| Importador do Ciclo 1 (`scripts/import-content.ts`) | Próximo passo; a lição vai como rascunho |
| Editor de lições, lista e ficha de membros, painel | MVP, depois das telas do membro |
| Exportar e excluir os próprios dados (RF-27) | MVP; a exclusão exige a chave `service_role` no servidor, então pede cuidado extra. As cascatas no banco já estão testadas |
| Service worker e uso offline | Só faz sentido com as telas de lição prontas. O manifesto e os ícones provisórios já permitem instalar o app |
| Ícones definitivos, cores e logotipo | Aguardam o material oficial da igreja (`npm run icons` gera os provisórios) |
| Termos de Uso e Política de Privacidade | Páginas com aviso "em elaboração"; o texto depende de revisão jurídica |
| Sentry e Resend | Sentry após o piloto; Resend na V2 |
