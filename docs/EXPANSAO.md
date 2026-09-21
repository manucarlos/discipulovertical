# Futuro: tela de Marca e expansão para outras igrejas

Este documento registra duas ideias para **depois do piloto**. Nenhuma está construída, e nenhuma é necessária para a Vertical Church hoje. O que já existe: a paleta e o logotipo são trocados em um arquivo só ([MARCA.md](MARCA.md)).

## 1. Tela de Marca no painel (trocar cores e logo sem mexer em código)

**Quando vale a pena:** se a igreja quiser trocar a identidade sem depender de quem mexe no código, ou se o produto for servir várias igrejas (seção 2). Enquanto a marca muda raramente, editar `src/lib/brand.ts` (5 minutos, com os testes de contraste avisando) é mais simples e não tem risco de derrubar o site.

### Cores (etapa 1: pequena e segura)

- Página **Administração > Marca**: o Admin escolhe **2 ou 3 cores** (a da igreja, a do texto, a do fundo). O site **calcula o resto** (botão em foco, faixa suave, texto secundário, modo escuro da leitura) garantindo o contraste WCAG AA.
- Prévia ao vivo. O botão Salvar **recusa** combinação ilegível. **Restaurar o padrão** e histórico (quem mudou o quê, no log de auditoria).
- Guardada em **uma linha de uma tabela comum do Postgres** (jsonb), lida pelo layout com cache curto de alguns segundos. Se o banco falhar, o site usa o `brand.ts` atual, que continua existindo como **padrão de segurança**.
- Leitura pública por uma função do banco (como `public_features`), porque o login também usa as cores. Escrita só do Admin.
- **Segurança:** a cor vai para o CSS, então é validada como `#rrggbb` no servidor **e** por restrição no banco (nada de texto livre no CSS).

### Logo (etapa 2: maior)

- Envio de **PNG ou JPG** (SVG não: pode carregar código). O servidor gera as variações: logo transparente, ícones do app (inclusive o "maskable"), ícone do iPhone, ícone da aba e o logo do certificado (o que `npm run icons` faz hoje).
- Guardado **dentro do banco** (arquivo pequeno), não no Supabase Storage, e servido por rotas do próprio site com endereço versionado (cache). Assim não amarra a nenhum serviço.
- **Mais trabalho:** ícones e manifesto hoje são arquivos fixos e passariam a rotas; o service worker precisa de cache versionado; o ícone da aba (hoje só a cruz laranja, extraída pela cor) pede um **símbolo enviado à parte**; quem já instalou o app pode ver o ícone antigo até reinstalar.

### Para não aumentar a amarração com Supabase ou hospedagem

- **Um módulo só** (`brand-store`) lê e grava a marca: trocar de banco seria trocar um arquivo.
- Tabela SQL comum, exportável por `pg_dump`; sem Storage, realtime ou funções do Supabase.
- Cache **na memória do servidor**, nada específico da Vercel.
- **Exportar e importar a identidade** (arquivo com cores e logo), para backup e para levar a outra plataforma.

## 2. Servir outras igrejas, cada uma com identidade própria

### Amarração de hoje (medida em 21/09/2026)

| Camada | Situação | Se trocar |
| --- | --- | --- |
| Hospedagem (Vercel) | Só o agendador (`vercel.json`) e uma variável de ambiente | Fácil: é um Next.js comum, roda em qualquer servidor Node |
| Supabase | 136 consultas e 53 chamadas de função em 32 arquivos; 88 funções SQL; 101 regras de acesso por `auth.uid()`; login pelo Supabase Auth | Grande: semanas, porque as regras de quem vê o quê vivem no banco |
| "Vertical Church" fixo | ~15 pontos no código (títulos, manifesto, textos legais, consentimento, e-mails, página offline), mais o conteúdo das lições | Pequeno, mas precisa ser feito antes da primeira outra igreja |

### Três caminhos

| | **A. Uma instalação por igreja** | **B. Uma plataforma para todas** (multi-tenant) |
| --- | --- | --- |
| Como é | Cada igreja tem o seu site e o seu banco, do mesmo código | Um site e um banco; cada linha diz de qual igreja é |
| Isolamento dos dados | **Total.** Convicção religiosa é dado sensível (LGPD): um erro numa igreja não alcança outra | Por regras. **Um erro em uma regra vaza dados entre igrejas**, o pior erro possível neste produto |
| Esforço para construir | **Quase nenhum**: o código de hoje serve; falta o kit de instalação | **Grande**: 35 tabelas e 101 regras passam a considerar a igreja (o mesmo trabalho do RF-29, "vários campi") |
| Identidade própria | Cada instalação tem cores, logo, domínio e login do Google com o nome da igreja | Cores e logo por igreja no banco; domínio e login do Google por igreja são mais complexos |
| Custo por igreja | Fixo e mais alto (banco e hospedagem pagos por igreja) | Menor, dividido entre todas |
| Atualizações | Aplicar em cada instalação (automatizável com script) | Uma vez, para todas |
| Serve até | Algumas dezenas de igrejas | Centenas |

### Recomendação: começar em A e só considerar B com demanda real

1. **Comece em A** com um **kit de instalação**: roteiro e script que criam o projeto no Supabase, aplicam o `banco-completo.sql` (já existe), configuram a hospedagem e o login do Google. Hoje isso é o [CONTAS.md](CONTAS.md), feito à mão em cerca de 2 horas.
2. **Passe para B só se** passar de umas 15 a 20 igrejas, ou se a operação de atualizar cada instalação virar o gargalo. Nesse ponto já haverá casos reais para desenhar B com segurança.

### O que preparar agora (barato, mantém as duas portas abertas)

1. **Tirar o texto fixo:** o nome e os dados da igreja devem vir da configuração (`church.name` já existe em Configurações), não de texto no código.
2. **Tela de Marca** (seção 1): passa de "conforto" a necessária, para cada igreja se autoatender.
3. **Kit de instalação** (acima).
4. **Conteúdo separado do código:** os Ciclos e a biblioteca são da Vertical (o importador lê o `HANDOFF.md`). Outras igrejas precisam de um **pacote base neutro e editável**, e o Ciclo 3 (história, valores, liderança) é sempre da própria igreja.
5. **Textos legais como modelo com campos da igreja:** já são minutas com `[A PREENCHER PELA IGREJA]`.
6. **Continuar neutro de hospedagem e de banco**, como hoje.

### Decisões de negócio e jurídicas antes de vender

- **Papel na LGPD:** cada igreja é a controladora dos dados dos seus membros; quem vende a plataforma é operador. Isso pede contrato (DPA), política própria e encarregado de dados.
- **Hospedagem comercial:** o plano gratuito da Vercel é para uso não comercial. Vender exige plano pago (conferir os termos atuais), além do custo do Supabase por instalação.
- **Licença do conteúdo:** as lições são da Vertical Church. É preciso decidir o que se pode repassar e em que termos. O texto bíblico (NVI, NTLH) exige autorização por uso e por igreja; a plataforma hoje só mostra referências e links.
- **Login do Google:** cada igreja precisa da própria tela de consentimento, com o nome e o logo dela (e a verificação do Google, que leva dias), ou usa-se uma conta única com nome neutro.
- **Preço, suporte, prazo de resposta, backup e retenção de dados.**
