# Marca: cores e logotipo (como trocar)

A marca da igreja (cores, logotipo e ícones) pode ser trocada de **duas formas**. O site usa a primeira que existir:

1. **Pelo painel, sem código:** **Administração > Marca** (só o Administrador). É o caminho normal.
2. **O padrão do projeto**, escrito no código: vale enquanto a igreja não personalizar nada no painel, e também se o banco estiver fora do ar. Serve de rede de segurança.

## Trocar pelo painel (Administração > Marca)

**Cores.** Você escolhe só **3 cores**: a **cor da igreja** (botões, links, destaques), a **cor do texto** (escura) e a **cor do fundo** (clara). O site calcula o resto (botão em foco, faixas suaves, texto secundário, bordas e o modo escuro da leitura) e mostra uma **prévia ao vivo** nos dois temas.

- **Só salva uma combinação legível.** São 24 combinações conferidas pelo padrão de acessibilidade WCAG AA. Se a cor da igreja for clara demais para servir de botão e de link (um amarelo, por exemplo), o site a **escurece o mínimo necessário** e avisa qual cor passou a usar.
- O fundo precisa ser claro e o texto precisa contrastar com ele. Cores mal escritas são recusadas.
- Vale para o site inteiro na hora (as telas leem a marca a cada minuto, no máximo).

**Logotipo e ícones.** Envie um **PNG ou JPG** (até 2 MB, mínimo de 128 pixels), de preferência com fundo branco ou transparente e o desenho centralizado. O site gera, sozinho:

- o logotipo transparente das telas;
- os ícones do app instalado no celular (inclusive o "maskable", com margem de segurança para o recorte do sistema);
- o ícone do iPhone e o ícone da aba do navegador;
- o logotipo do certificado em PDF.

O ícone da aba (16 a 32 pixels) não comporta o nome inteiro. Por isso há o campo opcional **Símbolo**: um desenho simples (uma cruz, um monograma). Sem ele, a aba usa o logotipo. **SVG não é aceito** (pode carregar código). Tudo o que é enviado é decodificado e recodificado; o arquivo original nunca é guardado.

**Backup e outras instalações.** **Baixar a identidade** gera um arquivo com as 3 cores e as imagens; **Importar** aplica esse arquivo (em outra instalação, ou depois de um problema). As cores são sempre recalculadas na importação; nada do arquivo é confiado.

**Voltar ao padrão** apaga as cores e as imagens personalizadas.

Quem mudou o quê fica no registro de auditoria (`brand_changed`, `brand_reset`).

**O nome da igreja** não está aqui: troca-se em **Administração > Configurações**. Ele aparece no site, nos termos, no consentimento, nos e-mails e no arquivo "Baixar meus dados".

## Onde ficam os dados (para quem mantém o sistema)

- Duas tabelas comuns do banco: `church_brand` (as 3 cores, a paleta calculada e a versão) e `church_assets` (as imagens em base64). Sem Storage nem recurso próprio do Supabase: dá para exportar com `pg_dump` e levar a outro banco.
- **Um módulo só** lê a identidade: `src/lib/brand-store.ts` (e `src/app/admin/marca/actions.ts` grava). Trocar de banco no futuro é trocar esses arquivos.
- O servidor guarda a leitura na memória por 1 minuto. Se o banco não responder, o site usa o padrão do código: a marca **nunca** derruba uma página.
- Só entra no CSS uma paleta que passe na validação (`#rrggbb` nos 9 papéis, no servidor **e** por restrição no banco).
- As imagens saem de `/marca/logo.png`, `/marca/icone-192.png` etc. Sem imagem própria, essas rotas entregam a imagem padrão.

## Mudar o padrão do projeto (para desenvolvedores)

**Cores padrão:** `src/lib/brand.ts` (`PALETTE` e `READING_DARK`, cores por **papel**, cada uma explicada no arquivo). Depois rode `npm test`: o teste de contraste diz **qual par** ficou ilegível. Nenhum outro arquivo escreve cores da marca à mão (um teste falha se isso acontecer).

**Logotipo padrão:** substitua `assets/brand/vertical-church-logo.jpg` e rode `npm run icons`. Ele gera as imagens padrão em `public/` e o logotipo do certificado (`src/lib/certificates/logo-data.ts`), com o mesmo processamento da tela. O ícone da aba usa só a **cruz laranja** do logotipo atual, isolada pela cor (`scripts/make-brand-assets.ts`); se o novo logotipo tiver outra cor de destaque, ajuste a cor `ORANGE` lá.

## O que NÃO muda sozinho

- **Tela "Entrar com Google":** tem logotipo e cores próprios dentro do Google Cloud. Mudar lá é opcional e exige verificação do app (veja [CONTAS.md](CONTAS.md), Fase 4a).
- **Roteiro do testador (`docs/ROTEIRO_TESTADOR.html` e `.pdf`):** é um documento à parte, com as cores escritas no próprio arquivo.
- **E-mails de lembrete:** usam cores neutras (texto escuro sobre branco) de propósito, para ler bem em qualquer aplicativo de e-mail.
- **App já instalado no celular:** pode continuar mostrando o ícone antigo até ser reinstalado.
