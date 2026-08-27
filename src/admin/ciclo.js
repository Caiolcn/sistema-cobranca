/* ============================================================
   Ciclo de vida da conta — taxonomia única do /admin

   Espelha exatamente o CASE da view `vw_admin_contas`
   (ver sql-ciclo-vida-conta.sql). O front NÃO recalcula status: ele lê
   `conta.ciclo` e traduz para rótulo, cor e ícone aqui.

   Antes disso o /admin tinha duas taxonomias próprias que discordavam entre si
   (o badge da tabela, com 4 estados e sem churn, e a segmentação dos filtros),
   e ainda divergiam da view de retenção e do UserContext. Ex-pagante aparecia
   como "Expirado" — o mesmo rótulo de quem nunca pagou.

   Se um estado novo nascer, ele nasce no SQL primeiro e chega aqui depois.
   ============================================================ */

export const CICLOS = {
  ativo: {
    label: 'Ativo',
    descricao: 'Pagante com o plano em dia',
    badge: 'success',
    accent: 'success',
    icon: 'mdi:check-decagram',
  },
  vencendo: {
    label: 'Vencendo',
    descricao: 'Pagante cujo plano vence nos próximos 3 dias',
    badge: 'warning',
    accent: 'warning',
    icon: 'mdi:calendar-alert',
  },
  inadimplente: {
    label: 'Inadimplente',
    descricao: 'Ainda marcado como pagante, mas o vencimento já passou',
    badge: 'danger',
    accent: 'danger',
    icon: 'mdi:alert-circle',
  },
  churn: {
    label: 'Churn',
    descricao: 'Já pagou alguma vez e hoje não paga mais',
    badge: 'danger',
    accent: 'danger',
    icon: 'mdi:account-off',
  },
  cancelado: {
    label: 'Cancelado',
    descricao: 'Cancelamento explícito — pelo admin ou a pedido do cliente',
    badge: 'default',
    accent: 'neutral',
    icon: 'mdi:cancel',
  },
  trial: {
    label: 'Trial',
    descricao: 'Período de teste em andamento, nunca pagou',
    badge: 'info',
    accent: 'info',
    icon: 'mdi:flask-outline',
  },
  trial_expirado: {
    label: 'Trial expirado',
    descricao: 'O teste acabou e a conta nunca pagou',
    badge: 'warning',
    accent: 'warning',
    icon: 'mdi:clock-alert-outline',
  },
}

const CICLO_DESCONHECIDO = {
  label: 'Sem status',
  descricao: 'Estado não reconhecido — a view mudou e o front não acompanhou',
  badge: 'default',
  accent: 'neutral',
  icon: 'mdi:help-circle-outline',
}

export function infoCiclo(ciclo) {
  return CICLOS[ciclo] || CICLO_DESCONHECIDO
}

// Ordem de exibição: começa pelo que gera receita, termina pelo que já saiu.
export const ORDEM_CICLOS = [
  'ativo', 'vencendo', 'inadimplente', 'trial', 'trial_expirado', 'churn', 'cancelado',
]

// Quem paga hoje (ou pagou até ontem e ainda está no trilho pagante).
export const CICLOS_PAGANTES = ['ativo', 'vencendo']
// Quem já foi pagante e hoje não é — o público de reativação.
export const CICLOS_EX_PAGANTES = ['churn', 'cancelado', 'inadimplente']

export const ORIGENS_PAGAMENTO = {
  mercadopago: { label: 'Mercado Pago', descricao: 'Pagamento aprovado registrado no gateway' },
  manual: {
    label: 'Venda na mão',
    descricao: 'Sem registro no gateway — a data de conversão foi inferida no backfill e vale revisar',
  },
  nenhum: { label: '—', descricao: 'Nunca pagou' },
}

/* ---------- Datas ---------- */

// Dias entre hoje e a data, em dia cheio (positivo = futuro, negativo = passado).
// Normaliza os dois lados para meia-noite local: sem isso, "vence hoje" vira
// "venceu ontem" dependendo da hora em que a página é aberta.
export function diasAte(iso) {
  if (!iso) return null
  const alvo = new Date(iso)
  if (isNaN(alvo.getTime())) return null
  alvo.setHours(0, 0, 0, 0)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.round((alvo - hoje) / (1000 * 60 * 60 * 24))
}

export function formatarData(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  })
}

export function formatarDataHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

// "vence em 3 dias" / "venceu há 12 dias" / "vence hoje" — a frase inteira,
// para a tabela não ter que decidir o tempo verbal em cada célula.
export function textoVencimento(iso) {
  const dias = diasAte(iso)
  if (dias === null) return { texto: '—', tom: 'neutro' }
  if (dias === 0) return { texto: 'vence hoje', tom: 'alerta' }
  if (dias > 0) {
    return {
      texto: `vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}`,
      tom: dias <= 3 ? 'alerta' : 'neutro',
    }
  }
  const atraso = Math.abs(dias)
  return { texto: `venceu há ${atraso} ${atraso === 1 ? 'dia' : 'dias'}`, tom: 'critico' }
}

export function formatarBRL(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL',
  })
}

export function nomeDaConta(conta) {
  return conta?.nome_empresa?.trim()
    || conta?.nome_completo?.trim()
    || conta?.email
    || 'Sem nome'
}

// O telefone pode estar no cadastro ou só na conexão do WhatsApp — os disparos
// precisam dos dois, senão a conta some do envio por "sem telefone".
export function telefoneDaConta(conta) {
  return conta?.telefone || conta?.whatsapp_telefone || conta?.whatsapp_numero || null
}
