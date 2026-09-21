# Marca: cores e logotipo (como trocar)

As cores do site vêm de **um único arquivo**: [`src/lib/brand.ts`](../src/lib/brand.ts). As telas, a barra do navegador no celular, a abertura do app instalado e o certificado em PDF leem tudo dele. O logotipo e os ícones vêm de **uma única imagem** (`assets/brand/`).

## Trocar as cores (5 minutos)

1. Abra `src/lib/brand.ts` e troque os valores de `PALETTE` (tema normal). Cada cor tem um **papel**, explicado no próprio arquivo:

   | Papel | Onde aparece | Cor hoje |
   | --- | --- | --- |
   | `brand` | botões, links, destaques, barra de progresso, anel de foco | `#c14602` (laranja do logotipo) |
   | `brandStrong` | botão ao passar o mouse | `#9b3902` |
   | `onBrand` | texto dentro dos botões | `#ffffff` |
   | `foreground` | texto principal | `#171717` (preto do logotipo) |
   | `muted` | texto secundário | `#5d5751` |
   | `background` | fundo das telas | `#fbf9f7` |
   | `card` | fundo dos cartões | `#ffffff` |
   | `tint` | faixas suaves: avisos, cabeçalho de tabela, trilha de progresso | `#f9f1ea` |
   | `line` | bordas e divisórias | `#d8cfc6` |

2. Se quiser, ajuste também `READING_DARK` (o modo escuro da leitura da lição). Nele a cor da igreja precisa ser **mais clara**, porque o escuro não se lê sobre fundo escuro.
3. Rode os testes:

   ```bash
   npm test
   ```

   Se alguma combinação ficar **difícil de ler** (contraste abaixo do padrão de acessibilidade WCAG AA, 4,5 para 1), o teste `contrast.test.ts` diz **qual par** falhou e o valor medido. Ajuste aquela cor e rode de novo. Se tudo passar, a paleta é acessível.
4. Envie ao GitHub. A Vercel publica sozinha, e as cores mudam no site inteiro.

**Dicas**
- Use sempre 6 dígitos em minúsculas (`#c14602`). O teste recusa outros formatos.
- Não escreva cores à mão em outros arquivos: um teste falha se algum arquivo de `src/` repetir uma cor da paleta em vez de usar o `brand.ts`.
- Cores de **situação** (verde de "concluída", vermelho de erro, amarelo de pendência) são independentes da marca e não mudam com a paleta.

## Trocar o logotipo

1. Substitua `assets/brand/vertical-church-logo.jpg` pelo novo arquivo (quadrado, de preferência com fundo branco e o desenho centralizado).
2. Rode `npm run icons`. Ele gera de novo o logotipo transparente do site, os ícones do app (inclusive o "maskable"), o ícone do iPhone, o ícone da aba e o logotipo do certificado.
3. Confira o resultado (o site local, `npm run dev`) e envie ao GitHub.

**Atenção ao ícone da aba do navegador.** Ele usa só a **cruz laranja** do logotipo, isolada pela cor do desenho (`scripts/make-brand-assets.mjs`, bloco "Ícone da aba"). Se o novo logotipo tiver outra cor de destaque, ajuste a cor `ORANGE` nesse trecho.

## O que NÃO muda sozinho

- **Google (tela de "Entrar com Google"):** o Google Cloud tem o próprio logotipo e cores; mudar lá é opcional e exige verificação do app (veja [CONTAS.md](CONTAS.md), Fase 4a).
- **Roteiro do testador (`docs/ROTEIRO_TESTADOR.html` e `.pdf`):** é um documento à parte, com as cores escritas no próprio arquivo.
- **E-mails de lembrete:** usam cores neutras (texto escuro sobre branco) de propósito, para ler bem em qualquer aplicativo de e-mail.
