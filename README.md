# Discipulado · Vertical Church

Aplicativo web (PWA) de discipulado da Vertical Church: leva o novo convertido, em ciclos, dos primeiros passos à frutificação, mede o progresso e chama a equipe pastoral quando alguém para ou pede ajuda.

## Documentação

| Arquivo | Para quê |
| --- | --- |
| [docs/HANDOFF.md](docs/HANDOFF.md) | Especificação completa e conteúdo das lições (leia a Parte 0 primeiro) |
| [docs/CONTAS.md](docs/CONTAS.md) | Passo a passo para criar as contas e ligar o login com Google |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Onde ficam as contas, como publicar, backup e emergências |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decisões técnicas e o que ainda falta |
| [docs/RELATORIO_USABILIDADE.md](docs/RELATORIO_USABILIDADE.md) | Testes de usabilidade com Claudião, Claudinho e Claudio: o que foi testado e achado |
| [docs/MARCA.md](docs/MARCA.md) | Como trocar as cores e o logotipo (as cores ficam em `src/lib/brand.ts`) |
| [docs/PENDENCIAS.md](docs/PENDENCIAS.md) | O mapa do que está pronto, do que só o pastor e a igreja podem fazer e do que não foi construído |
| [docs/CHECKLIST_PILOTO.md](docs/CHECKLIST_PILOTO.md) | Roteiro para conferir no Supabase de verdade e o que falta antes do piloto |

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
| `npm run db:bundle` | Junta as 24 migrações num arquivo só para colar no Supabase (`content/generated/banco-completo.sql`) |
| `npm run import:library` | Gera o SQL da biblioteca do Grupo de Discipulado (28 lições e 6 trilhas, em rascunho) |
| `npm run icons` | Gera as imagens da marca (logo do site, ícones do app e da aba, logo do certificado) a partir de `assets/brand/vertical-church-logo.jpg` |

## Estrutura

```
docs/         especificação, guias e decisões
supabase/     migrations/ (SQL versionado, com RLS desde a primeira)
tests/db/     testes das regras de acesso e de segurança (Postgres em memória)
tests/e2e/    testes de usabilidade com três pessoas e auditoria de acessibilidade
tests/security/ cobertura de autorização; tests/pwa/ service worker
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

**O plano inteiro está no código: MVP, V2, V3 e o Grupo de Discipulado.** Tudo além do MVP nasce **desligado**, atrás de chaves em Administração > Configurações (regra 0.6 do handoff: validar o MVP antes de abrir o resto).

- **MVP:** banco com RLS, login Google, primeiro acesso com consentimentos, importador dos Ciclos 1 a 3, trilha, ciclo, lição com leitura ajustável, Nossa Igreja editável, editor de lições, Pessoas, painel de indicadores, perfil do membro (baixar e excluir os próprios dados) e PWA.
- **V2 (desligado):** quiz, prática e reflexão, vídeo, cuidadores com alertas de quem parou, lembretes por e-mail (com agendador seguro e descadastro em um clique), encerramentos e presença, certificados em PDF com verificação pública, planilhas CSV.
- **V3 (desligado):** sequência de dias e marcos, entrar com e-mail.
- **Piloto (desligado):** formulário público de feedback em `/feedback` (sem login, com limite de 30 respostas por hora), lido pelo Admin em **Feedback**, e o roteiro do testador em `docs/ROTEIRO_TESTADOR.pdf`.
- **Grupo de Discipulado (desligado):** discipuladores, grupos com calendário diário (pausas, atraso, entrada tardia), painel, guia do encontro, presença, reflexões compartilhadas por escolha, pedidos de ajuda pastoral (com escalada), trilhas oficiais e a **biblioteca de 28 lições em rascunho** (`npm run import:library`).
- **Segurança:** política de conteúdo (CSP) com nonce, RLS conferida por testes em todo o schema, autorização conferida em todo o código.

**O que ainda não foi feito, e por quê:** nada disso rodou contra um Supabase real (as contas ainda não existem, e criá-las é com o pastor). O que foi provado: a lógica, o banco (Postgres em memória, com as regras de segurança reais), o código real das páginas e ações com pessoas simuladas, acessibilidade e segurança. **O mapa completo do que falta, e quem faz, está em [docs/PENDENCIAS.md](docs/PENDENCIAS.md).** Próximo passo: o roteiro de [docs/CHECKLIST_PILOTO.md](docs/CHECKLIST_PILOTO.md). Decisões em [docs/DECISIONS.md](docs/DECISIONS.md); testes de usabilidade em [docs/RELATORIO_USABILIDADE.md](docs/RELATORIO_USABILIDADE.md).

Para ver as telas sem Supabase: `npm run dev` e abra `/dev/trilha`, `/dev/ciclo/c1`, `/dev/licao/c1-l01`, `/dev/editor/c1-l02`, `/dev/admin`, `/dev/pessoas`, `/dev/painel` e `/dev/cabecalhos`.

## Regras que não podem ser quebradas

Nunca colar o texto literal da NVI ou da NTLH; RLS em todas as tabelas; lições com `[PREENCHER]` não publicam; campos internos nunca chegam ao membro. Lista completa: [HANDOFF.md, seção 0.4](docs/HANDOFF.md).
