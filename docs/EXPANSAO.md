# Expansão: servir outras igrejas, no mesmo banco

Este documento registra a decisão e o que já foi feito para a plataforma poder servir **outras igrejas**, cada uma com a sua identidade e os seus dados isolados. Em 22/09/2026 foi decidido e implantado o **banco único multi-igreja** (Fase 1, abaixo), substituindo a ideia anterior de uma instalação (site e banco) por igreja.

## 1. O modelo escolhido: banco único, uma linha `churches` por igreja

Um **só** banco Postgres (o mesmo Supabase de hoje) e um **só** site, administrados pelo operador (você). Cada igreja é uma linha na tabela `churches`; cada tabela de dados (perfis, lições, progresso, grupos...) ganhou uma coluna `church_id`, e o Postgres (RLS — Row Level Security) impede, na consulta, que uma igreja veja ou grave dado de outra. Três níveis de acesso, do mais amplo ao mais restrito:

- **Super Admin** (o operador): não pertence a nenhuma igreja em particular, lê e escreve em todas. Cadastro manual (tabela `platform_admins`, só pelo SQL Editor) — ver a nota operacional na migração 0026.
- **Admin local**: administra só a própria igreja (conteúdo, pessoas, configurações, marca) — exatamente como hoje, só que agora isolado por `church_id`.
- **Editor/Cuidador/Membro**: dentro da própria igreja, como já era.

Por que este caminho, e não uma instalação por igreja (a ideia anterior, descartada):

- **Operação.** Uma instalação por igreja significa um projeto Supabase, um site Vercel e um app do Google Cloud por igreja — o operador administra `N` vezes tudo, e cada atualização de código precisa ser aplicada em cada instalação. Banco único: uma vez só, para todas.
- **Custo.** Uma instalação por igreja tem custo fixo por igreja (banco e hospedagem pagos individualmente). Banco único: o custo é dividido.
- **Isolamento continua sendo por regra de acesso, não por infraestrutura separada** — é exatamente o ponto que pede mais cuidado (seção 2) e o motivo da Fase 2 (seção 3).

**Como uma pessoa nova entra na igreja certa:** dois caminhos, sem precisar de subdomínio nem site separado —
- **Administrador de uma igreja nova:** o operador cadastra a igreja (`churches`) e um e-mail "pendente" (`church_admins_pending`) antes do primeiro login; quem entrar com aquele e-mail (Google) vira Admin daquela igreja automaticamente.
- **Membro:** entra pelo **link de convite** da igreja (`churches.invite_code`, mesmo padrão do convite de Grupo de Discipulado hoje) e chama `claim_church()` no primeiro acesso.

**O que ainda não foi decidido:** como uma pessoa **sem login** (a página pública, antes de entrar) sabe "qual igreja" — hoje não há subdomínio nem caminho por igreja, então as telas públicas (identidade visual antes do login, formulário de feedback, lembretes por e-mail) ficam presas à igreja semente (`vertical-church`) até essa decisão ser tomada. Ver a nota nas seções 9 a 11 da migração 0026.

## 2. Isolamento: o que está garantido hoje, e o que ainda não está

| Camada | Situação |
| --- | --- |
| **Consultas diretas** (o que o app faz com `supabase.from(...)`) | **Isoladas.** Cada tabela de dado tem uma política RESTRITIVA (`church_id = current_church_id() OR is_super_admin()`), somada a QUALQUER política já existente, sem precisar reescrevê-las. Provado por teste direto: `tests/db/multi-tenant.test.ts` cria duas igrejas, tenta ler e escrever cruzado (inclusive "à força", passando o `church_id` de outra igreja na mão) e confirma que nada passa. |
| **As ~80 funções `security definer`** (save_lesson, admin_set_role, submit_feedback, os `cron_*`...) | **NÃO isoladas ainda.** Elas rodam como donas das tabelas e ignoram toda RLS, restritiva inclusive — confirmado por teste direto, não é suposição. Uma função de escrita pode, em teoria, alcançar o dado de outra igreja se alguém souber o UUID interno certo (nenhuma tela do app expõe esse UUID hoje). Isso é a **Fase 2** (seção 3). |
| Nome da igreja, cores e logotipo | Por igreja: `churches.name`/`contact_email` e uma linha de `church_brand`/`church_assets` por igreja (Administração > Configurações e > Marca) |
| Conteúdo (ciclos, lições, trilhas) | Por igreja: cada uma importa e edita o próprio; o mesmo identificador (`slug`) pode existir em igrejas diferentes sem colidir |

## 3. Fase 2 (sessões futuras): as funções `security definer`

Cada uma das ~50 funções pendentes precisa de uma checagem explícita de `church_id` no corpo — do mesmo jeito que hoje cada uma já confere `is_admin()`. Feito função por função, em grupos, cada grupo testado antes de passar para o próximo (não é uma migração só: risco demais para revisar de uma vez). O roteiro completo (os grupos, a ordem, o padrão de correção) está em [FASE2.md](FASE2.md); `tests/db/multi-tenant-checklist.test.ts` lista quais já foram cobertas e trava se uma função nova aparecer sem decisão.

## 4. Decisões registradas para evolução posterior

Nenhuma destas é código. Ficam anotadas para quando o projeto for oferecido a outras igrejas de verdade.

- **Papel na LGPD:** cada igreja é a **controladora** dos dados dos seus membros; quem opera a plataforma é **operador**. Isso pede contrato (DPA), política própria e encarregado de dados — e agora, com banco compartilhado, um cuidado extra: o contrato precisa deixar claro que os dados ficam logicamente segregados por igreja, não em bancos físicos separados.
- **Como uma pessoa sem login sabe "qual igreja"** (seção 1): subdomínio (`igreja.dominio.com`), caminho (`/i/igreja-slug`) ou parâmetro — ainda não decidido.
- **Hospedagem comercial:** o plano gratuito da Vercel é para uso não comercial. Vender exige plano pago (conferir os termos atuais).
- **Licença do conteúdo:** as lições são da Vertical Church. É preciso decidir o que se pode repassar e em que termos. O texto bíblico (NVI, NTLH) exige autorização por uso e por igreja; a plataforma hoje só mostra referências e links.
- **Login do Google:** hoje é uma tela de consentimento só, compartilhada por todas as igrejas (nome e logo neutros, ou os da primeira igreja). Uma tela por igreja exigiria voltar à ideia de projetos separados só para isso, ou um app do Google mais genérico.
- **Preço, suporte, prazo de resposta, backup e retenção de dados.**

## Histórico

- **21/09/2026:** primeira tentativa de preparo, com o modelo "uma instalação por igreja" (nome fora do código, tela de Marca, kit de instalação por projeto Supabase separado). Descartado no dia seguinte a pedido explícito: o caminho certo era banco único.
- **22/09/2026:** banco único decidido e implantado (Fase 1 desta migração 0026): `churches`, `church_id` em cada tabela, isolamento por RLS nas consultas diretas, entrada por convite/administrador pendente, e o papel de Super Admin. O kit de instalação (`npm run kit`) foi redesenhado: já não cria projeto Supabase novo, só cadastra a igreja no banco único.
