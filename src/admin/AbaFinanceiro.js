import { useMemo } from 'react'
import StatCard from '../design-system/components/StatCard'
import { formatarBRL, CICLOS_PAGANTES } from './ciclo'

/* ============================================================
   Aba Financeiro

   Separa MRR real de MRR estimado — antes os dois apareciam misturados na
   mesma fileira de cards, e ninguém sabia qual estava lendo:

     MRR real      = soma das assinaturas `authorized` no Mercado Pago.
                     Só o cartão recorrente entra aqui.
     MRR estimado  = soma do preço do plano de cada conta pagante.
                     É o número maior, porque a maioria paga por Pix avulso,
                     que não gera assinatura no gateway.

   O que entra no caixa é `faturamento do mês` (pagamentos aprovados de fato).
   ============================================================ */

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export default function AbaFinanceiro({ dados, isSmallScreen }) {
  const { contas, pagamentos, assinaturas, carregando, precoDoPlano, nomeDoPlano, kpis } = dados

  // Depende de `contas` além de pagamentos/assinaturas. A versão antiga tinha
  // as deps incompletas (faltava `clientes`), então o MRR ficava parado depois
  // de editar uma conta no modal.
  const fin = useMemo(() => {
    const hoje = new Date()
    const chave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const mesAtual = chave(hoje)
    const mesAnterior = chave(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1))

    const doMes = (mes) => pagamentos.filter(p => (p.data_aprovacao || p.created_at)?.slice(0, 7) === mes)
    const somar = (lista) => lista.reduce((s, p) => s + Number(p.valor || 0), 0)

    const pagamentosMes = doMes(mesAtual)
    const faturamentoMes = somar(pagamentosMes)
    const faturamentoMesAnterior = somar(doMes(mesAnterior))
    const faturamentoTotal = somar(pagamentos)

    const assinaturasAtivas = assinaturas.filter(a => a.status === 'authorized')
    const mrrReal = assinaturasAtivas.reduce((s, a) => s + Number(a.valor || 0), 0)

    const pagantes = contas.filter(c => CICLOS_PAGANTES.includes(c.ciclo))
    const mrrEstimado = pagantes.reduce((s, c) => s + precoDoPlano(c.plano), 0)

    // Receita que já está perdida ou em risco, para o MRR não ser lido sozinho.
    const emRisco = contas
      .filter(c => c.ciclo === 'inadimplente' || c.ciclo === 'vencendo')
      .reduce((s, c) => s + precoDoPlano(c.plano), 0)
    const perdidoChurn = contas
      .filter(c => c.ciclo === 'churn' || c.ciclo === 'cancelado')
      .reduce((s, c) => s + precoDoPlano(c.plano), 0)

    const variacao = faturamentoMesAnterior > 0
      ? Math.round(((faturamentoMes - faturamentoMesAnterior) / faturamentoMesAnterior) * 100)
      : null

    const serie = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      serie.push({
        mes: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
        valor: somar(doMes(chave(d))),
      })
    }

    // Distribuição por plano entre quem paga
    const porPlano = {}
    pagantes.forEach(c => {
      const k = c.plano || 'starter'
      porPlano[k] = porPlano[k] || { count: 0, receita: 0 }
      porPlano[k].count += 1
      porPlano[k].receita += precoDoPlano(c.plano)
    })

    const ticketMedio = pagantes.length ? mrrEstimado / pagantes.length : 0

    return {
      faturamentoMes, faturamentoMesAnterior, faturamentoTotal, variacao,
      mrrReal, mrrEstimado, assinaturasAtivas: assinaturasAtivas.length,
      emRisco, perdidoChurn, serie, porPlano, ticketMedio,
      pagamentosNoMes: pagamentosMes.length, totalPagamentos: pagamentos.length,
      pagantes: pagantes.length,
    }
  }, [contas, pagamentos, assinaturas, precoDoPlano])

  const maxSerie = Math.max(...fin.serie.map(s => s.valor), 1)
  const planosOrdenados = Object.entries(fin.porPlano).sort((a, b) => b[1].receita - a[1].receita)

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: isSmallScreen ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12, marginBottom: 28,
      }}>
        <StatCard
          label="Faturamento do mês" value={formatarBRL(fin.faturamentoMes)}
          icon="mdi:cash-multiple" accent="success" loading={carregando}
          delta={fin.variacao === null ? undefined : {
            value: `${fin.variacao > 0 ? '+' : ''}${fin.variacao}%`,
            direction: fin.variacao > 0 ? 'up' : fin.variacao < 0 ? 'down' : 'flat',
            label: 'vs. mês anterior',
          }}
          hint={`${fin.pagamentosNoMes} pagamentos confirmados`}
        />
        <StatCard
          label="MRR estimado" value={formatarBRL(fin.mrrEstimado)}
          icon="mdi:repeat" accent="primary" loading={carregando}
          hint={`${fin.pagantes} contas × preço do plano`}
        />
        <StatCard
          label="MRR recorrente" value={formatarBRL(fin.mrrReal)}
          icon="mdi:credit-card-sync" accent="info" loading={carregando}
          hint={`${fin.assinaturasAtivas} assinaturas de cartão ativas`}
        />
        <StatCard
          label="Ticket médio" value={formatarBRL(fin.ticketMedio)}
          icon="mdi:tag-outline" accent="neutral" loading={carregando}
          hint="por conta pagante"
        />
        <StatCard
          label="Receita em risco" value={formatarBRL(fin.emRisco)}
          icon="mdi:alert-outline" accent={fin.emRisco ? 'warning' : 'neutral'} loading={carregando}
          hint={`${kpis.inadimplentes} inadimplentes + ${kpis.vencendo} vencendo`}
        />
        <StatCard
          label="Perdido em churn" value={formatarBRL(fin.perdidoChurn)}
          icon="mdi:account-off" accent={fin.perdidoChurn ? 'danger' : 'neutral'} loading={carregando}
          hint={`${kpis.churn} contas que já pagaram`}
        />
      </div>

      {/* Série de 12 meses */}
      <section style={{ marginBottom: 28 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, color: '#344848' }}>Faturamento por mês</h3>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--color-text-muted)' }}>
          Pagamentos aprovados no Mercado Pago. Venda na mão não aparece aqui —
          {' '}total histórico do gateway: {formatarBRL(fin.faturamentoTotal)} em {fin.totalPagamentos} pagamentos.
        </p>
        <div style={{
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-xl)',
          padding: 16,
          backgroundColor: 'var(--color-bg-surface)',
          overflowX: 'auto',
        }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 8,
            height: 180, minWidth: 520,
          }}>
            {fin.serie.map((s, i) => {
              const altura = Math.round((s.valor / maxSerie) * 140)
              const ehAtual = i === fin.serie.length - 1
              return (
                <div key={s.mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 32 }}>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {s.valor > 0 ? Math.round(s.valor).toLocaleString('pt-BR') : ''}
                  </div>
                  <div
                    title={`${s.mes}: ${formatarBRL(s.valor)}`}
                    style={{
                      width: '100%',
                      height: Math.max(altura, s.valor > 0 ? 3 : 1),
                      borderRadius: '4px 4px 0 0',
                      backgroundColor: ehAtual ? 'var(--mensalli-green-500)' : 'var(--mensalli-green-200, #C8E6C9)',
                      transition: 'height var(--duration-300) var(--ease-out)',
                    }}
                  />
                  <div style={{
                    fontSize: 10,
                    color: ehAtual ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                    fontWeight: ehAtual ? 600 : 400,
                  }}>
                    {s.mes}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Distribuição por plano */}
      <section>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, color: '#344848' }}>Contas pagantes por plano</h3>
        {planosOrdenados.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Nenhuma conta pagante no momento.</div>
        ) : (
          <div style={{
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-xl)',
            padding: 16,
            backgroundColor: 'var(--color-bg-surface)',
          }}>
            {planosOrdenados.map(([plano, info]) => {
              const pct = fin.mrrEstimado > 0 ? Math.round((info.receita / fin.mrrEstimado) * 100) : 0
              return (
                <div key={plano} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5, gap: 12 }}>
                    <span style={{ fontWeight: 600 }}>{nomeDoPlano(plano)}</span>
                    <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {info.count} {info.count === 1 ? 'conta' : 'contas'} · {formatarBRL(info.receita)}/mês · {pct}%
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, backgroundColor: 'var(--neutral-200)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--mensalli-green-500)' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
