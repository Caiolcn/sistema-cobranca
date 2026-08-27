import { useMemo } from 'react'
import { Icon } from '@iconify/react'
import StatCard from '../design-system/components/StatCard'
import Button from '../design-system/components/Button'
import { formatarBRL, nomeDaConta, textoVencimento } from './ciclo'

/* ============================================================
   Aba Visão Geral

   Os números que decidem a semana, e o que precisa de ação hoje.
   Cada KPI é clicável e leva para a aba Contas já filtrada pelo ciclo —
   antes o número existia solto e não havia como ver quem estava dentro dele.
   ============================================================ */

export default function AbaVisaoGeral({ dados, irPara, isSmallScreen }) {
  const { kpis, contas, pagamentos, carregando, precoDoPlano } = dados

  const financeiro = useMemo(() => {
    const hoje = new Date()
    const chaveMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const mesAtual = chaveMes(hoje)
    const mesAnterior = chaveMes(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1))

    const somaDoMes = (mes) => pagamentos
      .filter(p => (p.data_aprovacao || p.created_at)?.slice(0, 7) === mes)
      .reduce((s, p) => s + Number(p.valor || 0), 0)

    const faturamentoMes = somaDoMes(mesAtual)
    const faturamentoMesAnterior = somaDoMes(mesAnterior)

    // MRR estimado: o que as contas pagantes valem por mês pelo preço do plano.
    // Não é o mesmo que a soma das assinaturas do gateway (a maioria paga por
    // Pix avulso, que não gera assinatura recorrente) — por isso os dois números
    // aparecem separados na aba Financeiro.
    const mrrEstimado = contas
      .filter(c => c.plano_pago && !c.cancelado_em)
      .reduce((s, c) => s + precoDoPlano(c.plano), 0)

    const variacao = faturamentoMesAnterior > 0
      ? Math.round(((faturamentoMes - faturamentoMesAnterior) / faturamentoMesAnterior) * 100)
      : null

    return { faturamentoMes, faturamentoMesAnterior, mrrEstimado, variacao }
  }, [pagamentos, contas, precoDoPlano])

  // Tudo que merece uma ação hoje, em ordem de urgência. Todo item leva para a
  // aba Contas com o filtro aplicado — a lista de nomes no card é só amostra.
  const atencao = useMemo(() => {
    const itens = []
    const plural = (n, singular, pluralForma) => `${n} ${n === 1 ? singular : pluralForma}`

    const inadimplentes = contas.filter(c => c.ciclo === 'inadimplente')
    if (inadimplentes.length) {
      itens.push({
        chave: 'inadimplente',
        tom: 'danger',
        icon: 'mdi:alert-circle',
        titulo: plural(inadimplentes.length, 'conta inadimplente', 'contas inadimplentes'),
        descricao: 'Ainda marcadas como pagantes, mas o vencimento já passou. Perderam acesso e cobrança automática.',
        contas: inadimplentes,
        filtro: { ciclo: 'inadimplente' },
      })
    }

    const vencendo = contas.filter(c => c.ciclo === 'vencendo')
    if (vencendo.length) {
      itens.push({
        chave: 'vencendo',
        tom: 'warning',
        icon: 'mdi:calendar-alert',
        titulo: plural(vencendo.length, 'conta vence', 'contas vencem') + ' em até 3 dias',
        descricao: 'Mande o lembrete antes que o acesso caia.',
        contas: vencendo,
        filtro: { ciclo: 'vencendo' },
      })
    }

    // Pagante sem plano_vencimento é o pior caso: o gate trata como bloqueio
    // (fail-closed) e o cliente perde acesso sem que nada no painel avise.
    const semVencimento = contas.filter(c => c.plano_pago && !c.plano_vencimento)
    if (semVencimento.length) {
      itens.push({
        chave: 'sem_vencimento',
        tom: 'danger',
        icon: 'mdi:calendar-remove',
        titulo: plural(semVencimento.length, 'conta paga', 'contas pagas') + ' sem data de vencimento',
        descricao: 'Dado quebrado: o gate bloqueia por falta de data, e o cliente perde acesso em silêncio. Preencha o vencimento.',
        contas: semVencimento,
        filtro: { foco: 'sem_vencimento' },
      })
    }

    const revisar = contas.filter(c => c.origem_pagamento === 'manual')
    if (revisar.length) {
      itens.push({
        chave: 'revisao',
        tom: 'info',
        icon: 'mdi:account-search',
        titulo: plural(revisar.length, 'conta pagou fora do gateway', 'contas pagaram fora do gateway'),
        descricao: 'Venda na mão ou Asaas antigo: não há registro no Mercado Pago, então a data em que viraram pagantes foi deduzida do fim do trial. Abra e confira se bate.',
        contas: revisar,
        filtro: { origem: 'manual' },
      })
    }

    return itens
  }, [contas])

  const cards = [
    {
      label: 'MRR estimado', value: formatarBRL(financeiro.mrrEstimado),
      icon: 'mdi:repeat', accent: 'primary',
      hint: `${kpis.pagantes} contas pagando`,
      aba: 'financeiro',
    },
    {
      label: 'Faturamento do mês', value: formatarBRL(financeiro.faturamentoMes),
      icon: 'mdi:cash-multiple', accent: 'success',
      delta: financeiro.variacao === null ? null : {
        value: `${financeiro.variacao > 0 ? '+' : ''}${financeiro.variacao}%`,
        direction: financeiro.variacao > 0 ? 'up' : financeiro.variacao < 0 ? 'down' : 'flat',
        label: 'vs. mês anterior',
      },
      hint: financeiro.variacao === null ? 'sem base de comparação' : undefined,
      aba: 'financeiro',
    },
    {
      label: 'Contas ativas', value: kpis.pagantes,
      icon: 'mdi:check-decagram', accent: 'success',
      hint: kpis.vencendo ? `${kpis.vencendo} vencendo em 3 dias` : 'todas com o plano em dia',
      ciclo: 'ativo',
    },
    {
      label: 'Inadimplentes', value: kpis.inadimplentes,
      icon: 'mdi:alert-circle', accent: kpis.inadimplentes ? 'danger' : 'neutral',
      hint: 'pagante com vencimento no passado',
      ciclo: 'inadimplente',
    },
    {
      label: 'Churn', value: kpis.churn,
      icon: 'mdi:account-off', accent: kpis.churn ? 'danger' : 'neutral',
      hint: 'já pagaram, hoje não pagam',
      ciclo: 'churn',
    },
    {
      label: 'Em trial', value: kpis.trial,
      icon: 'mdi:flask-outline', accent: 'info',
      hint: `${kpis.trialExpirado} trials expirados`,
      ciclo: 'trial',
    },
  ]

  const colunasKpi = isSmallScreen ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(180px, 1fr))'

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: colunasKpi, gap: 12, marginBottom: 28 }}>
        {cards.map(c => (
          <StatCard
            key={c.label}
            label={c.label}
            value={c.value}
            icon={c.icon}
            accent={c.accent}
            delta={c.delta || undefined}
            hint={c.hint}
            loading={carregando}
            onClick={() => irPara(c.aba || 'contas', c.ciclo ? { ciclo: c.ciclo } : undefined)}
          />
        ))}
      </div>

      {/* Precisa de atenção */}
      {!carregando && atencao.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#344848' }}>Precisa de atenção</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {atencao.map(item => (
              <CardAtencao key={item.chave} item={item} irPara={irPara} isSmallScreen={isSmallScreen} />
            ))}
          </div>
        </section>
      )}

      {/* Funil */}
      <section style={{ marginBottom: 28 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, color: '#344848' }}>Funil</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--color-text-muted)' }}>
          Conectar o WhatsApp é a métrica de ativação — é o passo que separa quem converte de quem some.
        </p>
        <Funil kpis={kpis} carregando={carregando} isSmallScreen={isSmallScreen} />
      </section>

      {/* Conversão */}
      <section>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#344848' }}>Conversão de trial</h3>
        <div style={{
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-xl)',
          padding: 16,
          backgroundColor: 'var(--color-bg-surface)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 30, fontWeight: 700, color: '#344848', fontVariantNumeric: 'tabular-nums' }}>
              {kpis.taxaConversao.toFixed(1)}%
            </span>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              {kpis.jaPagaramAlgumDia} de {kpis.trialsTerminados} trials terminados viraram pagante
            </span>
          </div>
          <div style={{
            height: 8, borderRadius: 999, backgroundColor: 'var(--neutral-200)',
            overflow: 'hidden', margin: '12px 0 8px',
          }}>
            <div style={{
              width: `${Math.min(kpis.taxaConversao, 100)}%`, height: '100%',
              backgroundColor: kpis.taxaConversao >= 30 ? 'var(--success-500)'
                : kpis.taxaConversao >= 15 ? 'var(--warning-500)' : 'var(--danger-500)',
              transition: 'width var(--duration-300) var(--ease-out)',
            }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {kpis.taxaConversao >= 30
              ? 'Saudável — acima do benchmark de SaaS self-service.'
              : kpis.taxaConversao >= 15
                ? 'Em linha com a média do mercado.'
                : 'Abaixo do benchmark. O gargalo costuma ser ativação, não preço.'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            O denominador conta só trials que já terminaram. Quem ainda está testando fica de fora —
            senão a taxa cairia sozinha a cada cadastro novo, sem nada ter piorado.
          </div>
        </div>
      </section>
    </div>
  )
}

/* ---------- Card de atenção ---------- */

function CardAtencao({ item, irPara, isSmallScreen }) {
  const cores = {
    danger: { borda: 'var(--danger-500)', bg: 'var(--danger-50)', icone: 'var(--danger-700)' },
    warning: { borda: 'var(--warning-500)', bg: 'var(--warning-50)', icone: 'var(--warning-700)' },
    info: { borda: 'var(--info-500)', bg: 'var(--info-50)', icone: 'var(--info-700)' },
  }[item.tom]

  const amostra = item.contas.slice(0, 4)
  const resto = item.contas.length - amostra.length

  return (
    <div style={{
      border: '1px solid var(--color-border-subtle)',
      borderLeft: `3px solid ${cores.borda}`,
      backgroundColor: cores.bg,
      borderRadius: 'var(--radius-xl)',
      padding: 14,
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: 10, minWidth: 0, flex: 1 }}>
          <Icon icon={item.icon} width={20} height={20} style={{ color: cores.icone, flexShrink: 0, marginTop: 2 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {item.titulo}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5, marginTop: 2 }}>
              {item.descricao}
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          iconRight="mdi:arrow-right"
          onClick={() => irPara('contas', item.filtro)}
        >
          Ver as {item.contas.length}
        </Button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {amostra.map(c => (
          <span
            key={c.id}
            title={item.chave === 'sem_vencimento' ? 'Sem plano_vencimento' : textoVencimento(c.data_limite).texto}
            style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 999,
              backgroundColor: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border-subtle)',
              color: 'var(--color-text-secondary)',
              maxWidth: isSmallScreen ? '100%' : 220,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {nomeDaConta(c)}
          </span>
        ))}
        {/* O "+N" era texto morto: mostrava que havia mais nomes e não dava
            como chegar neles. Agora é o mesmo destino do botão. */}
        {resto > 0 && (
          <button
            type="button"
            onClick={() => irPara('contas', item.filtro)}
            style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 999,
              backgroundColor: 'transparent',
              border: '1px dashed var(--color-border-default)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            +{resto} {resto === 1 ? 'outra' : 'outras'} — ver todas
          </button>
        )}
      </div>
    </div>
  )
}

/* ---------- Funil ---------- */

function Funil({ kpis, carregando, isSmallScreen }) {
  const etapas = [
    { label: 'Contas criadas', valor: kpis.total, icon: 'mdi:account-plus' },
    { label: 'WhatsApp conectado', valor: kpis.whatsappConectado, icon: 'mdi:whatsapp' },
    { label: 'Já pagaram', valor: kpis.jaPagaramAlgumDia, icon: 'mdi:cash-check' },
    { label: 'Pagando hoje', valor: kpis.pagantes, icon: 'mdi:check-decagram' },
  ]
  const base = kpis.total || 1

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isSmallScreen ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
      gap: 10,
    }}>
      {etapas.map((e, i) => {
        const pct = Math.round((e.valor / base) * 100)
        const anterior = i > 0 ? etapas[i - 1].valor : null
        const conversao = anterior ? Math.round((e.valor / (anterior || 1)) * 100) : null
        return (
          <div key={e.label} style={{
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-xl)',
            padding: 14,
            backgroundColor: 'var(--color-bg-surface)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Icon icon={e.icon} width={15} height={15} style={{ color: 'var(--color-text-muted)' }} />
              <span className="ds-text-eyebrow" style={{ color: 'var(--color-text-muted)' }}>{e.label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#344848', fontVariantNumeric: 'tabular-nums' }}>
              {carregando ? '—' : e.valor}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
              {carregando ? '' : conversao !== null
                ? `${conversao}% da etapa anterior · ${pct}% do total`
                : `${pct}% do total`}
            </div>
          </div>
        )
      })}
    </div>
  )
}
