# Pendências: o que está pronto, o que falta e quem faz

Este é o mapa único do que sobra. Em uma frase: **todo o código do plano (MVP, V2, V3 e o Grupo de Discipulado) está escrito e testado**. Falta o que só a igreja e o pastor podem fazer (contas, licenças, textos, decisões) e uma conferência num ambiente de verdade.

> **Como os recursos novos ficam:** tudo o que vai além do MVP nasce **desligado**, atrás de chaves em **Administração > Configurações** (regra 0.6 do handoff: não abrir V2, V3 e Grupos antes de validar o MVP). Ligue uma por vez, conforme o piloto avançar.

## 1. Pronto no código (e como ligar)

| Recurso | Onde | Chave em Configurações | Antes de ligar |
| --- | --- | --- | --- |
| **MVP**: login Google, trilha, lições, editor, pessoas, painel, perfil, PWA | tudo | sempre ligado | Ver o [passo a passo](CONTAS.md) |
| Quiz (2 de 3, refazer sem limite) | lição | Quiz das lições | Escrever as perguntas no editor |
| Prática e reflexão | lição | Prática e reflexão | Avisar as pessoas de que cuidador e liderança leem a reflexão |
| Vídeo (YouTube/Vimeo) | editor + lição | Vídeo nas lições | Ter os vídeos e a transcrição |
| Cuidadores e alertas | Cuidado, Meus membros | Cuidadores e alertas | Dar o perfil de Cuidador a alguém; rodar o rodízio |
| Lembretes por e-mail | Lembretes | Lembretes por e-mail | Contas do Resend e do agendador ([CONTAS.md](CONTAS.md), Fase 9) |
| Encerramentos e presença | Encerramentos | Encerramentos presenciais | Marcar o encontro de cada ciclo |
| Certificados em PDF + verificação pública | Encerramentos, Certificados, /verificar | Certificados | Conferir o desenho do PDF; logotipo (opcional) |
| Planilhas CSV | Pessoas | sempre ligado (só Admin) | Nada |
| Sequência de dias e marcos | Minha trilha | Sequência de dias e marcos | Nada |
| Entrar com e-mail | Login | Entrar com e-mail | Ativar o provedor de e-mail no Supabase |
| **Grupo de Discipulado** (grupos, calendário, painel, guia, presença, pedidos de ajuda) | Meu grupo, Discipulado, Admin > Grupos | Grupo de Discipulado | Importar a biblioteca ([CONTAS.md](CONTAS.md), Fase 7b), revisar as lições, marcar os discipuladores |
| Segurança do navegador (CSP) | todas as páginas | sempre ligado | Nada (já conferido num build de produção) |

## 2. O que só o pastor e a igreja podem fazer

Nenhum destes itens pode ser feito por mim: envolvem contas em seu nome, pagamentos, contratos ou decisões pastorais.

| # | Item | Quem | Por quê |
| --- | --- | --- | --- |
| 1 | Criar as contas: GitHub, Supabase, Google Cloud, Vercel (e Resend, se for usar e-mail) | Pastor | São contas suas, com a sua identidade e, às vezes, cartão. Guia em [CONTAS.md](CONTAS.md). **Nunca cole senhas ou chaves no chat** |
| 2 | Aplicar as 23 migrações e importar o conteúdo (Ciclos e biblioteca) | Pastor, com o guia | Um arquivo só (`banco-completo.sql`) cola no SQL Editor do seu Supabase; o guia tem o passo a passo |
| 3 | **Autorização por escrito** para a NVI e a NTLH | Igreja | Sem ela, a plataforma só mostra referências e links (é o que faz hoje) |
| 4 | **Revisão jurídica** dos Termos e da Política (as minutas estão em `/termos` e `/privacidade`) | Advogado da igreja | Convicção religiosa é dado sensível na LGPD. Trechos `[A PREENCHER PELA IGREJA]` não foram inventados |
| 5 | Designar o **encarregado de dados (DPO)** e um segundo administrador de emergência | Igreja | Exigência da LGPD e do handoff |
| 6 | **Logotipo e cores** oficiais | Igreja/comunicação | Os ícones atuais são provisórios (`npm run icons`) |
| 7 | Os **textos da igreja** (história, valores, declaração de fé, liderança, ministérios, membresia) | Pastor | Aparecem como `[PREENCHER]` no Ciclo 3 e em Nossa Igreja |
| 8 | **Revisão pastoral** de todas as lições da biblioteca (28 rascunhos) e, nas sensíveis (9, 10, 12, 13, 14, 16, 17 e 28), revisão de um profissional | Pastor + profissional | Regra 0.4.3 do handoff. O aviso de segurança e os telefones (CVV 188, SAMU 192, Ligue 180, 190) **precisam ser conferidos** antes de publicar |
| 9 | Preencher os `[PREENCHER]` da biblioteca: contato do aconselhamento, apoio da igreja a quem está endividado ou sem emprego, formas de contribuir, política de proteção | Pastor | Enquanto houver `[PREENCHER]`, o banco **impede** a publicação (é proposital) |
| 10 | Decidir as **perguntas em aberto** de [DECISIONS.md](DECISIONS.md) | Pastor | Já há um padrão escolhido para cada uma |
| 11 | Escolher a data e o local do **encerramento** de cada ciclo e cadastrá-los | Pastor | Alimenta o marco pendente e os certificados |
| 12 | Definir quem serão os **cuidadores** e os **discipuladores** | Pastor | Perfis dados em Pessoas e em Grupos |
| 13 | Contratar um serviço para o **WhatsApp** (se quiser) | Igreja | Depende de conta comercial, modelos aprovados pelo provedor e custo por conversa. Não foi construído (ver seção 3) |

## 3. O que não foi construído, e por quê

| Item | Motivo |
| --- | --- |
| Lembretes por **WhatsApp** (RF-17) | Exige contrato com um provedor oficial (conta comercial e modelos de mensagem aprovados), decisão de custo e novo consentimento. O consentimento por WhatsApp já é gravado, e o desenho de envio é o mesmo do e-mail (`src/lib/email`, `src/lib/reminders`): a interface de envio é trocável |
| **Vários campi** (RF-29) | Decisão de produto do handoff (V3): cada campus teria dados, cuidadores e conteúdo próprios. Mexe em todas as regras de acesso; só faz sentido com um segundo campus de verdade |
| **Ciclo 4** (temas de ministério) | O conteúdo depende dos ministérios da igreja e do resultado do piloto |
| E-mails do **Grupo de Discipulado** (alerta ao discipulador e resumo semanal do grupo, RG-11) | O alerta aparece no painel do discipulador; o e-mail reaproveita a estrutura de lembretes e fica para depois do piloto dos grupos |
| Criar lição da biblioteca pela tela | As 28 lições são importadas e editadas no editor; nova lição da biblioteca por tela fica para depois |
| Editor visual para montar trilhas (arrastar e soltar) | A trilha é montada por uma lista de identificadores; suficiente para o lançamento |
| Monitoramento de erros (Sentry) | Depende de conta e decisão de custo |
| Nada disso rodou contra um Supabase real | As contas ainda não existem. O que foi provado é descrito em [RELATORIO_USABILIDADE.md](RELATORIO_USABILIDADE.md) e conferido pelo [CHECKLIST_PILOTO.md](CHECKLIST_PILOTO.md) |

## 4. Ordem sugerida

1. Criar as contas e aplicar o banco ([CONTAS.md](CONTAS.md)).
2. Conferir o MVP com o [checklist](CHECKLIST_PILOTO.md) e fazer o piloto com poucas pessoas.
3. Só então ligar, **uma por vez**, as chaves de Configurações: Quiz e Reflexão → Cuidadores → Lembretes → Encerramentos e Certificados → Grupo de Discipulado.
4. Em paralelo, a igreja cuida dos itens 3 a 9 da seção 2.
