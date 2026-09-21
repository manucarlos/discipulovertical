# Expansão: servir outras igrejas, cada uma com a sua identidade

Este documento registra a análise e o que já foi feito para a plataforma poder servir **outras igrejas**, cada uma com a sua marca. Em 21/09/2026 foram implantados os quatro itens de preparação (seção 3). O que falta são **decisões de negócio e jurídicas**, registradas na seção 4 para evolução posterior.

## 1. O modelo escolhido: uma instalação por igreja

Cada igreja tem o **seu site e o seu banco**, do mesmo código. Por quê:

- **Dados sensíveis.** Convicção religiosa é dado sensível na LGPD. Com bancos separados, um erro numa igreja não alcança outra. Numa plataforma única, uma regra de acesso errada vaza dados entre igrejas, e esse é o pior erro possível neste produto.
- **O código serve como está.** Uma plataforma única exigiria reescrever o acesso a 35 tabelas e 101 regras (o mesmo trabalho do RF-29, "vários campi").
- Cada igreja leva os seus dados se sair; dá para cobrar ou desligar por igreja.
- **Custo:** fixo e mais alto por igreja (banco e hospedagem pagos por cada uma), e cada atualização precisa ser aplicada em cada instalação (automatizável). Serve até algumas dezenas de igrejas.

**Quando reavaliar a plataforma única (multi-tenant):** acima de 15 a 20 igrejas, ou se atualizar cada instalação virar o gargalo. Nesse ponto já haverá casos reais para desenhá-la com segurança.

### Amarração de hoje (medida em 21/09/2026)

| Camada | Situação | Se trocar |
| --- | --- | --- |
| Hospedagem (Vercel) | Só o agendador (`vercel.json`) e variáveis de ambiente | Fácil: é um Next.js comum, roda em qualquer servidor Node |
| Supabase | 136 consultas e 53 chamadas de função em 32 arquivos; 88 funções SQL; 101 regras de acesso por `auth.uid()`; login pelo Supabase Auth | Grande: semanas, porque as regras de quem vê o quê vivem no banco |
| Nome da igreja | Vem da configuração; nenhum texto do aplicativo repete "Vertical Church" | Nada a fazer |

## 2. Comparação dos caminhos

| | **A. Uma instalação por igreja** (escolhido) | **B. Uma plataforma para todas** (multi-tenant) |
| --- | --- | --- |
| Isolamento dos dados | **Total** | Por regras: um erro vaza entre igrejas |
| Esforço para construir | **Pouco** (o kit de instalação, seção 3) | **Grande** (35 tabelas e 101 regras passam a considerar a igreja) |
| Identidade própria | Cores, logo, domínio e login do Google por instalação | Cores e logo por igreja no banco; domínio e login por igreja são mais complexos |
| Custo por igreja | Fixo e mais alto | Menor, dividido |
| Atualizações | Em cada instalação (script) | Uma vez, para todas |
| Serve até | Algumas dezenas de igrejas | Centenas |

## 3. O que foi implantado (21/09/2026)

1. **Nome da igreja fora do código.** O nome vem de **Administração > Configurações** (`church.name`) e chega ao título das páginas, ao manifesto do app, aos Termos de Uso e à Política de Privacidade, ao texto de consentimento, ao arquivo "Baixar meus dados", aos e-mails e às lições (o marcador `{{igreja}}` é trocado no importador). O nome de reserva, se o banco não responder, é o da variável `NEXT_PUBLIC_CHURCH_NAME` (ou "Igreja").
2. **Tela de Marca no painel** (**Administração > Marca**): as 3 cores (o site calcula o resto e só aceita o que for legível), o logotipo (com todos os ícones gerados dele), exportar e importar a identidade, e voltar ao padrão. Detalhes e o que foi feito para **não amarrar** a nenhum serviço: [MARCA.md](MARCA.md).
3. **Kit de instalação** (`npm run kit -- exemplo`): a partir de um arquivo `churches/<igreja>.json` (nome, contato, administrador inicial, endereço, 3 cores, ciclos), gera em `content/generated/kit-<igreja>/` o banco completo, a identidade (nome, primeiro administrador, cores, e a limpeza dos textos de exemplo de Nossa Igreja), as lições com o nome da igreja, as variáveis do site e um **roteiro em Markdown personalizado**. Não usa contas nem chaves: só gera arquivos. O SQL do kit é testado contra um banco novo, inclusive com nomes de igreja com aspas e comandos SQL.
4. **Conteúdo separado do código.** Os textos das lições que citavam a Vertical usam `{{igreja}}`. O Ciclo 3 e o Nossa Igreja continuam sendo **da própria igreja** (`[PREENCHER]` e páginas vazias): o kit não inventa nada no lugar. Os Termos e a Política são minutas com campos `[A PREENCHER PELA IGREJA]` (razão social, CNPJ, encarregado de dados).

**O que o kit não faz (evolução futura):** criar os projetos no Supabase e na Vercel por conta própria. Isso exigiria guardar chaves de API de quem opera, e hoje quem cola os SQLs e cria as contas é uma pessoa, seguindo o roteiro. Automatizar pelas APIs dos dois serviços é possível depois, se o número de igrejas justificar.

## 4. Decisões registradas para evolução posterior

Nenhuma destas é código. Ficam anotadas para quando o projeto for oferecido a outras igrejas.

- **Papel na LGPD:** cada igreja é a **controladora** dos dados dos seus membros; quem vende a plataforma é **operador**. Isso pede contrato (DPA), política própria e encarregado de dados.
- **Hospedagem comercial:** o plano gratuito da Vercel é para uso não comercial. Vender exige plano pago (conferir os termos atuais), além do custo do Supabase por instalação.
- **Licença do conteúdo:** as lições são da Vertical Church. É preciso decidir o que se pode repassar e em que termos. O texto bíblico (NVI, NTLH) exige autorização por uso e por igreja; a plataforma hoje só mostra referências e links.
- **Login do Google:** cada igreja precisa da própria tela de consentimento, com o nome e o logo dela (e a verificação do Google, que leva dias), ou usa-se uma conta única com nome neutro.
- **Preço, suporte, prazo de resposta, backup e retenção de dados.**
- **Plataforma única (multi-tenant)** e **automação da criação dos projetos**: só quando a demanda real pedir (ver seção 1).
