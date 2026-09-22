/**
 * MINUTAS dos Termos de Uso e da Política de Privacidade (handoff 0.4.2 e seção 12).
 *
 * São textos-base escritos para acelerar o trabalho do advogado da igreja: NÃO são aconselhamento jurídico e
 * precisam de revisão e aprovação de um advogado (com experiência em LGPD) antes do lançamento. Tudo o que depende
 * de dados da igreja (razão social, CNPJ, endereço, encarregado de dados, contatos, foro) aparece como
 * [A PREENCHER PELA IGREJA: ...] e NÃO foi inventado.
 *
 * Quando o texto for aprovado, troque TERMS_VERSION em legal.ts (tirando o "-rascunho"): os aceites passam a valer
 * para a versão aprovada.
 */
import { withChurchDeep } from "./church";

export interface LegalSection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  sections: LegalSection[];
}

export const PLACEHOLDER_PREFIX = "[A PREENCHER PELA IGREJA:";

export const TERMS: LegalDocument = {
  title: "Termos de Uso",
  intro:
    "Estes termos explicam como usar a plataforma de discipulado da {{igreja}}. Ao entrar, você declara que leu e concorda com eles e com a Política de Privacidade.",
  sections: [
    {
      title: "1. Quem somos",
      paragraphs: [
        "A plataforma é mantida pela {{igreja}} ([A PREENCHER PELA IGREJA: razão social, CNPJ e endereço da igreja]), a que chamamos de \"a igreja\".",
      ],
    },
    {
      title: "2. O que é a plataforma",
      paragraphs: [
        "É um aplicativo para acompanhar a caminhada de discipulado: lições em ciclos liberadas aos poucos, registro do seu progresso, páginas sobre a igreja e, quando a igreja ativar, recursos opcionais como quiz, reflexão, lembretes por e-mail, acompanhamento por um cuidador, encontros de encerramento, certificados e Grupos de Discipulado.",
        "O serviço é oferecido sem custo e pode mudar ou ser interrompido para manutenção ou por decisão da igreja.",
      ],
    },
    {
      title: "3. Quem pode usar",
      paragraphs: ["A plataforma é para pessoas com 18 anos ou mais. Ao entrar, você confirma que tem essa idade."],
    },
    {
      title: "4. Sua conta",
      paragraphs: [
        "Você entra com a sua conta Google (ou, quando ativado, por um link enviado ao seu e-mail). Você é responsável por manter o acesso à sua conta em segurança e por tudo o que é feito com ela. Avise a igreja se suspeitar de uso indevido.",
      ],
    },
    {
      title: "5. Uso adequado",
      paragraphs: ["Ao usar a plataforma, você se compromete a:"],
      bullets: [
        "usar as informações com respeito às outras pessoas, sem ofender, ameaçar ou expor ninguém;",
        "não tentar acessar dados de outras pessoas nem burlar as regras de acesso;",
        "não copiar em massa nem revender o conteúdo das lições;",
        "manter em sigilo o que ouvir ou ler sobre a vida de outras pessoas no grupo ou no acompanhamento.",
      ],
    },
    {
      title: "6. Conteúdo e Bíblia",
      paragraphs: [
        "As lições e os textos da plataforma pertencem à igreja e aos seus autores e são para o seu uso pessoal de estudo. A plataforma não reproduz o texto das versões bíblicas: mostra apenas as referências e leva você, por links, a sites que têm autorização para publicar as versões escolhidas. As versões e as marcas citadas pertencem aos seus titulares.",
      ],
    },
    {
      title: "7. O que a plataforma não é",
      paragraphs: [
        "As lições são estudos bíblicos e não substituem o acompanhamento de um profissional de saúde, de direito ou de finanças, nem o atendimento de emergência. Em risco imediato, ligue 192 (SAMU) ou 188 (CVV, apoio emocional, 24 horas). Em caso de violência, ligue 190 ou, se for mulher, 180.",
        "Os pedidos de ajuda pastoral e as notas de cuidado registram apenas o que você ou a equipe escrevem: a igreja procura atender com cuidado, mas não garante um prazo nem um resultado.",
      ],
    },
    {
      title: "8. Suas informações",
      paragraphs: [
        "A forma como tratamos os seus dados está na Política de Privacidade. Você pode ver, corrigir, baixar e excluir os seus dados na página Meu perfil, a qualquer momento.",
      ],
    },
    {
      title: "9. Encerramento",
      paragraphs: [
        "Você pode excluir a sua conta quando quiser, em Meu perfil. A igreja pode suspender ou encerrar contas que violem estes termos, avisando a pessoa sempre que possível.",
      ],
    },
    {
      title: "10. Mudanças nestes termos",
      paragraphs: [
        "Podemos atualizar estes termos. Quando houver mudança importante, avisaremos na plataforma e, se necessário, pediremos um novo aceite. A versão que você aceitou fica registrada.",
      ],
    },
    {
      title: "11. Contato e lei aplicável",
      paragraphs: [
        "Dúvidas sobre estes termos: [A PREENCHER PELA IGREJA: canal de contato oficial da igreja].",
        "Estes termos são regidos pelas leis do Brasil. [A PREENCHER PELA IGREJA: foro escolhido, conforme orientação do advogado].",
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  title: "Política de Privacidade",
  intro:
    "Esta política explica, em linguagem simples, quais dados pessoais a plataforma de discipulado da {{igreja}} guarda, para quê, por quanto tempo e quais são os seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).",
  sections: [
    {
      title: "1. Quem é o responsável",
      paragraphs: [
        "O responsável (\"controlador\") pelos seus dados é a {{igreja}} ([A PREENCHER PELA IGREJA: razão social, CNPJ e endereço]).",
        "O encarregado pelo tratamento de dados pessoais (DPO) é Manoel Carlos Gomes (manoelcarlosgomes@gmail.com). É a ele que você pode dirigir dúvidas e pedidos sobre os seus dados.",
      ],
    },
    {
      title: "2. Quais dados coletamos",
      paragraphs: ["Coletamos apenas o que precisamos para o discipulado:"],
      bullets: [
        "**Da sua conta Google ou do seu e-mail:** nome, e-mail e foto de perfil.",
        "**Que você informa:** nome de exibição, WhatsApp (opcional), versão da Bíblia preferida e as suas escolhas de consentimento.",
        "**Da sua caminhada:** lições abertas e concluídas, datas, até onde leu, respostas de quiz, prática feita e reflexões que você escrever.",
        "**Do acompanhamento (quando a igreja ativar):** cuidador atribuído, alertas de quem parou de ler, notas de cuidado escritas pelo seu cuidador, presença em encerramentos e certificados.",
        "**Dos Grupos de Discipulado (quando a igreja ativar):** o grupo de que você participa, a sua leitura, a presença nos encontros, as reflexões que você escolher compartilhar e os pedidos de ajuda que enviar.",
        "**Técnicos:** registros de acesso e de ações importantes (por exemplo, quem consultou a ficha de uma pessoa), para segurança e prestação de contas.",
      ],
    },
    {
      title: "3. Dados sensíveis",
      paragraphs: [
        "Participar de uma igreja e as suas reflexões e pedidos de ajuda podem revelar a sua convicção religiosa, o que a LGPD trata como dado pessoal sensível, e podem conter informações sobre saúde, família ou finanças. Por isso tratamos esses dados com mais cuidado: só com o seu consentimento, acesso restrito a quem precisa e registro de quem os consulta.",
      ],
    },
    {
      title: "4. Para que usamos e em que base legal",
      paragraphs: [],
      bullets: [
        "**Oferecer o discipulado** (entrar, liberar lições, guardar o seu progresso): consentimento e execução do serviço que você pediu.",
        "**Cuidar de você** (cuidador, alertas, pedidos de ajuda, grupos): consentimento, e proteção da vida e da incolumidade física quando houver risco.",
        "**Enviar lembretes por e-mail:** somente com o seu consentimento, que você pode retirar em Meu perfil ou pelo link no fim de cada e-mail.",
        "**Emitir certificados:** para registrar a sua conclusão de um ciclo, com o seu consentimento.",
        "**Segurança e prevenção a fraudes:** legítimo interesse, com o mínimo de dados.",
      ],
    },
    {
      title: "5. Quem vê os seus dados",
      paragraphs: ["Cada pessoa vê só o que a sua função exige:"],
      bullets: [
        "**Você** vê tudo o que é seu.",
        "**Seu cuidador** vê o seu progresso, os alertas e as suas reflexões, e escreve notas que só ele e a administração leem.",
        "**Seu discipulador** vê a sua leitura e presença no grupo e apenas as reflexões que você compartilhar. Ao sair do grupo, ele perde esse acesso.",
        "**A administração (pastor e equipe)** vê os dados necessários para acompanhar as pessoas, e cada consulta a dados de outra pessoa fica registrada.",
        "**Editores de conteúdo** não veem dados pessoais.",
        "Um pedido de ajuda enviado direto à equipe pastoral não é visto pelo seu discipulador.",
      ],
    },
    {
      title: "6. Com quem compartilhamos",
      paragraphs: [
        "Não vendemos os seus dados. Usamos empresas de tecnologia que tratam dados em nome da igreja (\"operadores\"), com contratos que exigem proteção:",
      ],
      bullets: [
        "**Supabase** (banco de dados e login), **Vercel** (hospedagem do aplicativo), **Google** (login com a conta Google) e **Resend** (envio de e-mails, quando ativado).",
        "Esses serviços podem guardar dados em servidores fora do Brasil. [A PREENCHER PELA IGREJA: países e salvaguardas de transferência internacional, conforme o advogado e os contratos vigentes].",
      ],
    },
    {
      title: "7. Por quanto tempo guardamos",
      paragraphs: [
        "Guardamos os seus dados enquanto a sua conta existir. Se você excluir a conta, apagamos o seu perfil, o seu progresso, as suas reflexões, notas, presenças e certificados. Ficam apenas registros técnicos de segurança sem identificação da pessoa. [A PREENCHER PELA IGREJA: prazos legais específicos, se o advogado indicar].",
      ],
    },
    {
      title: "8. Seus direitos",
      paragraphs: ["Você pode, a qualquer momento:"],
      bullets: [
        "saber se tratamos os seus dados e **acessá-los**, baixando uma cópia em Meu perfil;",
        "**corrigir** dados incorretos, em Meu perfil;",
        "**excluir a sua conta e os seus dados**, em Meu perfil;",
        "**retirar o consentimento** dos lembretes e de outros usos, sem prejuízo do acesso à trilha;",
        "pedir informações sobre com quem compartilhamos os dados;",
        "reclamar à Autoridade Nacional de Proteção de Dados (ANPD).",
      ],
    },
    {
      title: "9. Segurança",
      paragraphs: [
        "Usamos conexão segura, controle de acesso por perfil no próprio banco de dados, registro de acessos sensíveis. Nenhum sistema é totalmente livre de riscos: se houver um incidente que afete você, avisaremos como a lei exige.",
      ],
    },
    {
      title: "10. Cookies e armazenamento no aparelho",
      paragraphs: [
        "Usamos apenas o que é necessário para o funcionamento: cookies de sessão para manter você conectado e o armazenamento do aparelho para guardar as suas preferências de leitura (tamanho da letra e modo escuro). Não usamos cookies de publicidade nem de rastreamento.",
      ],
    },
    {
      title: "11. Menores de idade",
      paragraphs: ["A plataforma é para maiores de 18 anos. Se soubermos de um cadastro de menor, a conta será encerrada."],
    },
    {
      title: "12. Mudanças nesta política",
      paragraphs: ["Podemos atualizar esta política. Quando a mudança for relevante, avisaremos na plataforma e, se necessário, pediremos um novo consentimento. A versão que você aceitou fica registrada."],
    },
    {
      title: "13. Fale com a gente",
      paragraphs: ["Para exercer os seus direitos ou tirar dúvidas: fale com o encarregado de dados, Manoel Carlos Gomes, em manoelcarlosgomes@gmail.com."],
    },
  ],
};

/** Os Termos com o nome da igreja no lugar do marcador {{igreja}}. */
export const termsFor = (churchName: string): LegalDocument => withChurchDeep(TERMS, churchName);
/** A Política de Privacidade com o nome da igreja no lugar do marcador {{igreja}}. */
export const privacyFor = (churchName: string): LegalDocument => withChurchDeep(PRIVACY, churchName);
