# Discipulado · Vertical Church

Aplicativo web (PWA) de discipulado da Vertical Church: leva o novo convertido, em ciclos, dos primeiros passos à frutificação, mede o progresso e chama a equipe pastoral quando alguém para ou pede ajuda.

## Documentação

| Arquivo | Para quê |
| --- | --- |
| [docs/HANDOFF.md](docs/HANDOFF.md) | Especificação completa e conteúdo das lições (leia a Parte 0 primeiro) |
| [docs/CONTAS.md](docs/CONTAS.md) | Passo a passo para criar as contas e ligar o login com Google |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Onde ficam as contas, como publicar, backup e emergências |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisões técnicas e o que ainda falta |

## Rodar no computador

Precisa de Node 20 ou mais novo (testado com Node 24).

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do Supabase (veja docs/CONTAS.md)
npm run dev                  # http://localhost:3000
```

Sem `.env.local` o app abre e mostra avisos de "em preparação"; o login só funciona depois de configurar o Supabase.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm test` | Testes das regras de negócio e das regras de acesso do banco |
| `npm run typecheck` | Confere os tipos |
| `npm run lint` | Confere o estilo do código |
| `npm run build` | Versão de produção |
| `npm run import:sql` | Gera o SQL de importação das lições (`-- --cycle 1`) |
| `npm run icons` | Gera ícones provisórios do PWA |

## Estrutura

```
docs/         especificação, guias e decisões
supabase/     migrations/ (SQL versionado, com RLS desde a primeira)
tests/db/     testes das regras de acesso (Postgres em memória)
scripts/      importador de conteúdo e gerador de ícones
src/app/      telas: login, onboarding, (member)/ trilha, ciclo, lição, Nossa Igreja;
              admin/ painel (trilha, editor, prévia, pessoas e fichas);
              dev/ pré-visualizações (só em desenvolvimento)
src/lib/      supabase/ (clientes), bible/ (provedor de texto bíblico),
              content/ (leitura do handoff, SQL de importação, conversão do editor),
              admin/ (regras de status, erros, consultas do painel),
              lessons/ (liberação e progresso), trail/ (modelo da trilha),
              onboarding, legal
src/proxy.ts  renova a sessão e protege as rotas
```

## Status

Fase 1 (MVP) em andamento. Pronto e testado: banco com RLS, login Google (código), onboarding com consentimentos, importador dos Ciclos 1 a 3, trilha, ciclo, lição com leitura ajustável e "Concluir lição", Nossa Igreja, o **editor de lições** e a área **Pessoas** (lista com situação e filtros, ficha com progresso e troca de perfil pelo Admin). Falta: perfil do membro, exportar/excluir os próprios dados (RF-27), editor de "Nossa Igreja" e o painel de indicadores. Detalhes e perguntas em aberto em [docs/DECISIONS.md](docs/DECISIONS.md).

Para ver as telas sem Supabase: `npm run dev` e abra `/dev/trilha`, `/dev/ciclo/c1`, `/dev/licao/c1-l01`, `/dev/editor/c1-l02` (aceita `?role=editor&status=published`), `/dev/admin`, `/dev/pessoas` e `/dev/pessoas/00000000-0000-4000-8000-000000000001`.

## Regras que não podem ser quebradas

Nunca colar o texto literal da NVI ou da NTLH; RLS em todas as tabelas; lições com `[PREENCHER]` não publicam; campos internos nunca chegam ao membro. Lista completa: [HANDOFF.md, seção 0.4](docs/HANDOFF.md).
