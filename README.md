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
| `npm run icons` | Gera ícones provisórios do PWA |

## Estrutura

```
docs/         especificação, guias e decisões
supabase/     migrations/ (SQL versionado, com RLS desde a primeira)
tests/db/     testes das regras de acesso (Postgres em memória)
scripts/      utilitários (ícones; importador de conteúdo, a fazer)
src/app/      telas: login, onboarding, início, termos, privacidade
src/lib/      supabase/ (clientes), bible/ (provedor de texto bíblico),
              lessons/ (liberação e progresso), onboarding, legal
src/proxy.ts  renova a sessão e protege as rotas
```

## Status

Fase 0 e início da Fase 1 (MVP). Pronto e testado: banco com RLS, login Google (código), onboarding com consentimentos, regras de liberação, provedor bíblico provisório. Próximo: trilha, lição e importador do Ciclo 1. Detalhes em [docs/DECISIONS.md](docs/DECISIONS.md).

## Regras que não podem ser quebradas

Nunca colar o texto literal da NVI ou da NTLH; RLS em todas as tabelas; lições com `[PREENCHER]` não publicam; campos internos nunca chegam ao membro. Lista completa: [HANDOFF.md, seção 0.4](docs/HANDOFF.md).
