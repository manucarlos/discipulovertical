# Checklist: da homologação ao piloto

O código do MVP está pronto e testado, mas **nunca rodou contra um Supabase real**. Este roteiro leva você de "contas criadas" a "piloto com 20 a 30 pessoas". Cada etapa tem um critério de pronto que você mesmo confere.

> Regra de ouro: nunca cole senhas ou chaves no chat. Use os campos dos sites e o arquivo `.env.local`.

## Fase A: contas e banco (guia em [CONTAS.md](CONTAS.md))

- [ ] Contas criadas: GitHub, Supabase (produção e homologação), Google Cloud, Vercel. Verificação em duas etapas ligada em todas.
- [ ] As **12 migrações** aplicadas, em ordem, em cada projeto Supabase (CONTAS.md, passo 2). Nenhuma deu erro.
- [ ] Primeiro administrador definido **antes** do primeiro login (`app_config`).
- [ ] Login com Google ligado ao Supabase e o app do Google **publicado** ("Em produção").
- [ ] `.env.local` preenchido; `npm run dev` abre em <http://localhost:3000>.
- [ ] Conteúdo importado (`npm run import:sql`) e colado no SQL Editor.

## Fase B: conferir no ambiente de verdade

Faça **na homologação**, com duas contas Google (a sua, de administrador, e uma segunda de teste, de membro). É o que os testes simulados **não** cobrem.

| # | Passo | O que deve acontecer |
| --- | --- | --- |
| 1 | Entrar com a sua conta Google | Cai em "Que bom ter você aqui"; em **Table Editor > profiles** seu perfil tem `role = admin` |
| 2 | Concluir o primeiro acesso | Vai para "Minha trilha"; em `consents` há o aceite |
| 3 | **Conteúdo > Trilha**: abrir uma lição do Ciclo 1, editar, salvar | "Salvo às …"; em `lesson_versions` há uma versão nova |
| 4 | Ver a **prévia** e **publicar** as lições do Ciclo 1 | Aparecem para o membro; em `audit_log` há `lesson_published` |
| 5 | Tentar publicar uma lição do Ciclo 3 | Recusa, dizendo que há `[PREENCHER]` |
| 6 | Entrar com a **conta de teste** (janela anônima) | Vira membro; **não vê** o link "Conteúdo"; abrir `/admin/trilha` volta para o início |
| 7 | Conta de teste: primeiro acesso, ler, **concluir** a primeira lição | Volta ao ciclo com "Muito bem!"; a segunda lição mostra quando libera |
| 8 | Conta de teste: escolher a versão **NVI** no perfil | Os versículos passam a abrir na NVI |
| 9 | Administrador: **Pessoas** | A conta de teste aparece "Em andamento", com a lição concluída |
| 10 | Conta de teste: **Baixar meus dados** | Baixa um arquivo com os dados dela e só dela |
| 11 | Conta de teste: **Excluir minha conta** | Volta ao login com a confirmação; em **Authentication > Users** ela sumiu; em `profiles` e `lesson_progress` também |
| 12 | Tentar entrar de novo com essa conta | Entra como pessoa nova, do zero |

Se **qualquer passo falhar**, anote a mensagem e o passo e peça ao Claude para corrigir **antes** de seguir.

### Conferir também

- [ ] **PWA no celular (Chrome, Android):** abrir o site, "Instalar app"; desligar a internet e abrir de novo: deve aparecer "Você está sem internet". (Não dá para testar isso no navegador embutido do Claude.)
- [ ] **Celular de verdade:** ler uma lição inteira; tamanho da letra; modo escuro; o botão "Concluir lição" legível nos dois modos.
- [ ] **Leitor de tela:** ligar o TalkBack (Android) ou o VoiceOver (iPhone) e percorrer login, trilha e uma lição.
- [ ] **Segurança no Supabase (painel):** em **Authentication > URL Configuration** só os endereços do seu site; **e-mail confirmado obrigatório**; em **Authentication > Rate Limits** limites ativos; nenhum "service_role" copiado para lugar nenhum.
- [ ] **Backups:** anote o que o plano contratado do Supabase oferece e faça **um teste de restauração** em homologação.

## Fase C: o que só a igreja pode fazer (em paralelo, não depende de código)

- [ ] **Licenças NVI e NTLH** pedidas por escrito aos titulares. Enquanto isso o app mostra só a referência com link.
- [ ] **Advogado** revisa os Termos de Uso e a Política de Privacidade (a plataforma trata convicção religiosa, dado sensível na LGPD). Depois, trocar as páginas "em elaboração" e a constante `TERMS_VERSION` em `src/lib/legal.ts`.
- [ ] **Encarregado de dados (DPO)** designado, com contato na política de privacidade.
- [ ] **Segundo administrador** de confiança com acesso de emergência a todas as contas.
- [ ] **Logotipo e cores oficiais** enviados (o app usa cores provisórias).
- [ ] **Textos da igreja** enviados para resolver os `[PREENCHER]` do Ciclo 3 (história, valores, declaração de fé, liderança, ministérios, membresia) e para **Nossa Igreja** (pelo painel).
- [ ] **Números de emergência** das lições (CVV 188, Ligue 180, polícia 190) conferidos antes de publicar as lições sensíveis.
- [ ] Decisões pendentes de [DECISIONS.md](DECISIONS.md) respondidas (edição de lição publicada, tamanho das lições, lições sensíveis, botão do batismo).

## Fase D: piloto

- [ ] Ciclo 1 **revisado por você** no painel e publicado.
- [ ] 20 a 30 novos convertidos convidados; alguém da equipe acolhe (WhatsApp ou pessoalmente) enquanto não há lembretes automáticos.
- [ ] **Toda semana, por 4 semanas:** abrir **Conteúdo > Painel** e **Pessoas > Parado**; fazer contato pessoal com quem parou; anotar em **onde mais gente parou** (lições a rever).
- [ ] No fim: taxa de conclusão do Ciclo 1 (meta sugerida: 60%), início em 7 dias (meta: 70%). Ajustar as lições e o ritmo antes de começar a V2.

## Antes de abrir para toda a igreja

- [ ] Nada de `/dev` acessível em produção (deve dar "página não encontrada").
- [ ] Domínio próprio e o endereço novo nas duas listas de endereços permitidos (Supabase e Google).
- [ ] Você sabe onde estão as contas e quem tem acesso (tabela do [RUNBOOK](RUNBOOK.md) preenchida).
