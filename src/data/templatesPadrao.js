/**
 * Templates padrão de mensagem.
 *
 * Vive aqui (e não dentro do WhatsAppConexao.js) porque duas portas diferentes
 * precisam semear os mesmos textos:
 *   1. a página /app/whatsapp, no mount;
 *   2. a conexão feita pelo wizard de onboarding (services/whatsappConexao.js).
 *
 * Isso importa porque as views da régua (vw_parcelas_*) fazem
 * `JOIN mensallizap ON conectado = true` + `LEFT JOIN templates` com
 * `COALESCE(t.mensagem, '')`. Ou seja: conta conectada e sem template entra na
 * fila de cobrança com a mensagem VAZIA. Antes isso nunca acontecia porque
 * conectar exigia abrir a página, que semeava — as duas coisas eram a mesma ação.
 * Com o WhatsApp dentro do wizard elas se separaram, então a semeadura passou a
 * ter que acompanhar a conexão.
 */

// Templates padrão bonitos com emojis
export const TEMPLATES_PADRAO = {
  pre_due_3days: `Olá, {{nomeCliente}}! 👋

Passando para te ajudar na organização da semana: sua mensalidade vence em 3 dias. 😃

💰 Valor: {{valorMensalidade}}
📆 Vencimento: {{dataVencimento}}

🔑 Chave Pix: {{chavePix}}

Adiantar o pagamento garante sua tranquilidade e a continuidade dos seus planos sem correria! 💪`,

  due_day: `Oi, {{nomeCliente}}! Tudo bem? 😃

Hoje é o dia do vencimento da sua mensalidade.

💰 Valor: {{valorMensalidade}}
💳 Pix para pagamento: {{chavePix}}

Manter seu plano em dia garante que você continue aproveitando todos os nossos benefícios sem interrupções! 🚀

Qualquer dúvida, estou à disposição.`,

  overdue: `Olá, {{nomeCliente}}, como vai?

Notamos que o pagamento da sua mensalidade (vencida em {{dataVencimento}}) ainda não consta em nosso sistema.

Sabemos que a rotina é corrida, por isso trouxemos os dados aqui para facilitar sua regularização agora mesmo:

💰 Valor: {{valorMensalidade}}
🔑 Chave Pix: {{chavePix}}

Se você já realizou o pagamento e foi um atraso na nossa baixa manual, basta me enviar o comprovante por aqui! Obrigado! 🙏`,

  class_reminder: `Olá, {{nomeCliente}}!

Lembrete: sua aula de {{descricaoAula}} começa em 1 hora! 🕐

⏰ Horário: {{horarioAula}}
📍 Local: {{nomeEmpresa}}

Até já! 💪`,

  birthday: `Feliz aniversário, {{nomeCliente}}! 🎂🎉

A equipe {{nomeEmpresa}} deseja a você um dia incrível, cheio de saúde, alegria e conquistas!

Obrigado por fazer parte da nossa família. Conte sempre com a gente! 💪🎈`,

  payment_confirmed: `Olá, {{nomeCliente}}! ✅

Confirmamos o recebimento do seu pagamento.

💰 Valor: {{valorMensalidade}}
📅 Vencimento: {{dataVencimento}}

Obrigado pela pontualidade! - {{nomeEmpresa}}`,

  welcome: `Olá, {{nomeCliente}}! 👋

Seja muito bem-vindo(a) à {{nomeEmpresa}}!

Este é nosso canal oficial de comunicação pelo WhatsApp. Por aqui você receberá:

✅ Lembretes de vencimento
✅ Confirmações de pagamento
✅ Comunicados importantes

*Salve nosso número* para não perder nenhuma mensagem!

Qualquer dúvida, estamos à disposição.`,

  recuperacao_15: `Oi, {{nomeCliente}}! 👋

Sentimos sua falta aqui na *{{nomeEmpresa}}* 💛
Tá tudo bem por aí? Já faz {{diasSemAparecer}} dias que não te vemos em aula.

Qualquer coisa, me chama aqui que a gente te ajuda! 💪`,

  recuperacao_30: `Oi, {{nomeCliente}}, tudo bem? 😊

Estamos com saudades na *{{nomeEmpresa}}*!
Já faz {{diasSemAparecer}} dias desde sua última aula. Que tal voltar essa semana? Sua vaga ainda tá aqui! 🙌

Se precisar reagendar ou tiver alguma dificuldade, me conta que a gente ajuda a resolver.`,

  recuperacao_45: `{{nomeCliente}}, tudo bem? 💛

Tá fazendo {{diasSemAparecer}} dias que você não aparece e queremos saber como você está.

Se quiser voltar, a gente te ajuda a remarcar sua rotina. Se tá com alguma dificuldade, me conta — a gente pode achar uma solução juntos. 🤝

Qualquer coisa é só responder aqui!

_{{nomeEmpresa}}_`,

  nps_experimental: `Oi, {{nomeCliente}}! 👋

Vi que você teve sua primeira aula aqui na *{{nomeEmpresa}}* — espero que tenha curtido! 💛

*Como foi sua experiência?*
Me manda uma nota de 0 a 10:
0 = péssimo   10 = excelente

Se quiser, me conta numa mensagem o que mais gostou ou o que podemos melhorar — sua opinião é ouro pra nós! 🙏`,

  despesa_vencendo: `💸 *Alerta de Despesa — {{nomeEmpresa}}*

{{descricao}}
💰 Valor: {{valor}}
📆 Vencimento: {{dataVencimento}} ({{diasRestantesTexto}})
🏷️ Categoria: {{categoria}}

Não esqueça de quitar pra evitar juros/multa!`
}

/**
 * Título padrão de cada tipo.
 *
 * Fonte única: a página usa isso pra preencher o campo "Título" quando a conta
 * ainda não tem template daquele tipo. Tipo que falta aqui abre o editor com
 * título vazio e o salvar morre em "Preencha o título e a mensagem".
 * Toda entrada nova de TEMPLATES_PADRAO precisa de uma entrada aqui.
 */
export const TITULOS_PADRAO = {
  pre_due_3days: 'Lembrete - 3 Dias Antes do Vencimento',
  due_day: 'Lembrete - Vencimento Hoje',
  overdue: 'Cobrança - 3 Dias Após o Vencimento',
  class_reminder: 'Lembrete de Aula',
  birthday: 'Mensagem de Aniversário',
  payment_confirmed: 'Confirmação de Pagamento',
  welcome: 'Boas-vindas',
  recuperacao_15: 'Recuperação - 15 dias',
  recuperacao_30: 'Recuperação - 30 dias',
  recuperacao_45: 'Recuperação - 45 dias',
  nps_experimental: 'NPS - Pós-Experimental',
  despesa_vencendo: 'Alerta de Despesa Vencendo'
}

/**
 * Lista efetivamente semeada numa conta nova.
 *
 * ATENÇÃO — os textos de recuperacao_* e nps_experimental são cópias literais do
 * que a página já inseria, e divergem de propósito do TEMPLATES_PADRAO acima
 * (pequenas diferenças de pontuação e fecho). A duplicação é anterior a este
 * arquivo; foi mantida como está para a extração não mudar o que a conta recebe.
 * Se for unificar, é uma decisão de conteúdo, não de refatoração.
 *
 * `class_reminder` e `birthday` NÃO estão aqui — nunca foram semeados. Existem
 * em poucas contas e só nascem se criados à mão.
 */
export const TEMPLATES_SEED = [
  { tipo: 'due_day', titulo: TITULOS_PADRAO.due_day, mensagem: TEMPLATES_PADRAO.due_day },
  { tipo: 'pre_due_3days', titulo: TITULOS_PADRAO.pre_due_3days, mensagem: TEMPLATES_PADRAO.pre_due_3days },
  { tipo: 'overdue', titulo: TITULOS_PADRAO.overdue, mensagem: TEMPLATES_PADRAO.overdue },
  { tipo: 'payment_confirmed', titulo: TITULOS_PADRAO.payment_confirmed, mensagem: TEMPLATES_PADRAO.payment_confirmed },
  { tipo: 'welcome', titulo: TITULOS_PADRAO.welcome, mensagem: TEMPLATES_PADRAO.welcome },
  { tipo: 'recuperacao_15', titulo: TITULOS_PADRAO.recuperacao_15, mensagem: 'Oi {{nomeCliente}}! 👋\n\nSentimos sua falta aqui na *{{nomeEmpresa}}* 💛\nTá tudo bem por aí? Já faz {{diasSemAparecer}} dias que não te vemos em aula.\n\nQualquer coisa, me chama aqui!' },
  { tipo: 'recuperacao_30', titulo: TITULOS_PADRAO.recuperacao_30, mensagem: 'Oi {{nomeCliente}}, tudo bem? 😊\n\nEstamos com saudades na *{{nomeEmpresa}}*!\nJá faz {{diasSemAparecer}} dias desde sua última aula. Que tal voltar essa semana? Sua vaga ainda tá aqui!\n\nSe precisar reagendar ou tiver alguma dificuldade, me conta que a gente ajuda 🙌' },
  { tipo: 'recuperacao_45', titulo: TITULOS_PADRAO.recuperacao_45, mensagem: '{{nomeCliente}}, tudo bem? 💛\n\nTá fazendo {{diasSemAparecer}} dias que você não aparece e queremos saber como você está.\n\nSe quiser voltar, a gente te ajuda a remarcar. Se tá com alguma dificuldade, me conta, a gente pode achar uma solução juntos.\n\nFalar com atendente é só responder aqui! 🤝\n\n_{{nomeEmpresa}}_' },
  { tipo: 'nps_experimental', titulo: TITULOS_PADRAO.nps_experimental, mensagem: 'Oi {{nomeCliente}}! 👋\n\nVi que você teve sua primeira aula aqui na *{{nomeEmpresa}}* — espero que tenha curtido! 💛\n\n*Como foi sua experiência?*\nMe manda uma nota de 0 a 10:\n0 = péssimo   10 = excelente\n\nSe quiser, me conta numa mensagem o que mais gostou ou o que podemos melhorar — sua opinião é ouro pra nós! 🙏' },
  { tipo: 'despesa_vencendo', titulo: TITULOS_PADRAO.despesa_vencendo, mensagem: TEMPLATES_PADRAO.despesa_vencendo }
]
