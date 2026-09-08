// ==========================================
// Planos do Mensalli — fonte única
//
// A grade estava copiada em 4 lugares (UpgradePage, aba de upgrade da
// Configuração, LandingPage, LandingEscolinha) e o preço em mais 3
// (`precos` do checkout, PRECOS_FALLBACK do /admin, a view
// vw_mensalli_cobranca_saas). Toda vez que um preço ou uma feature mudava,
// alguém ficava pra trás — e o cliente via um valor na tela e outro no Pix.
//
// Aqui é o lado do app. O espelho no banco é o CASE de
// vw_mensalli_cobranca_saas: se mexer no preço, mexa nos dois.
//
// `preco` é o valor REALMENTE cobrado (49,90 / 99,90 / 149,90). As landings
// mostram o valor redondo (R$49) como vitrine; dentro do app, onde a pessoa
// está decidindo pagar, o número tem que bater com o que vai sair no Pix.
// ==========================================

export const PLANOS = [
  {
    id: 'starter',
    nome: 'Starter',
    subtitulo: 'Ideal para começar',
    preco: 49.90,
    perMsg: 'R$0,25 por mensagem',
    limiteClientes: 50,
    limiteMensagens: 200,
    destaque: false,
    cta: 'Assinar o Starter',
    features: [
      'Até 50 clientes ativos',
      '200 mensagens/mês',
      'Mensagem automática no vencimento',
      '1 template personalizado',
      'Dashboard básico'
    ]
  },
  {
    id: 'pro',
    nome: 'Pro',
    subtitulo: 'Para negócios em crescimento',
    preco: 99.90,
    perMsg: 'R$0,17 por mensagem',
    limiteClientes: 150,
    limiteMensagens: 600,
    destaque: false,
    cta: 'Assinar o Pro',
    features: [
      'Até 150 clientes ativos',
      '600 mensagens/mês',
      '3 templates personalizados',
      'Régua de cobrança completa',
      'Dashboard com gráficos',
      'Contratos com assinatura',
      'Anamnese / Ficha do aluno',
      'Suporte via WhatsApp'
    ]
  },
  {
    id: 'premium',
    nome: 'Premium',
    subtitulo: 'Gestão profissional',
    preco: 149.90,
    perMsg: 'R$0,05 por mensagem',
    limiteClientes: 500,
    limiteMensagens: 3000,
    destaque: true,
    cta: 'Assinar o Premium',
    features: [
      'Até 500 clientes ativos',
      '3.000 mensagens/mês',
      'Tudo do plano Pro',
      'Criador de Sites',
      'CRM completo',
      'Bot de WhatsApp',
      'Agendamento online (link de agendamento)',
      'Campanhas de WhatsApp',
      'Templates ilimitados',
      'Consultoria inicial (1h)',
      'Suporte prioritário'
    ]
  }
]

export const IDS_PLANOS = PLANOS.map((p) => p.id)

// Nomes legados que ainda aparecem em contas antigas (mesma tradução do
// useUserPlan — se mudar um, mude o outro).
const APELIDOS = { basico: 'starter', enterprise: 'premium', business: 'premium' }

export function normalizarPlano(plano) {
  const id = String(plano || '').toLowerCase().trim()
  return APELIDOS[id] || id
}

export function planoPorId(plano) {
  const id = normalizarPlano(plano)
  return PLANOS.find((p) => p.id === id) || null
}

export function precoDoPlano(plano) {
  return planoPorId(plano)?.preco ?? 0
}

export function nomeDoPlano(plano) {
  return planoPorId(plano)?.nome || (plano ? String(plano) : '—')
}

// starter (1) < pro (2) < premium (3). 0 = plano desconhecido.
export function nivelDoPlano(plano) {
  const i = IDS_PLANOS.indexOf(normalizarPlano(plano))
  return i === -1 ? 0 : i + 1
}

export function formatarBRL(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}
