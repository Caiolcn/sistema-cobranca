import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import StatCard from '../design-system/components/StatCard'
import { formatarBRL, CICLOS_PAGANTES } from './ciclo'

/* ============================================================
   Aquisição — quanto custa ter um cliente e onde o funil vaza

   Cruza duas fontes que moram em lugares diferentes:
     - meta_ads_gasto  → o que o Meta cobrou (sincronizado pela edge function
                         meta-ads-sync, pelo botão "Atualizar gasto");
     - contas          → quem se cadastrou, conectou o WhatsApp e virou pagante.

   O funil é uma COORTE: só entra quem criou a conta dentro do período. Assim as
   taxas de cada etapa são comparáveis. "Pagante" aqui = já pagou alguma vez
   (virou_pagante_em), não "está pagando hoje" — churn não apaga o custo de ter
   adquirido o cliente.

   O gasto total do período é dividido por TODOS os cadastros/pagantes, não só
   os rastreados como Meta: cadastro sem UTM é comum e subcontar derrubaria o
   CAC para um número bonito e falso. Lido assim, o CAC é o teto honesto.
   ============================================================ */

const PERIODOS = [
  { id: 7, label: '7 dias' },
  { id: 30, label: '30 dias' },
  { id: 90, label: '90 dias' },
]

const inteiro = (n) => Math.round(n || 0).toLocaleString('pt-BR')
const pct = (n) => (Number.isFinite(n) ? `${n.toFixed(1).replace('.', ',')}%` : '—')
const brl = (n) => (Number.isFinite(n) && n > 0 ? formatarBRL(n) : '—')
const dividir = (a, b) => (b > 0 ? a / b : NaN)
// Abaixo de 1 mês, "0,6 meses" confunde (parece 6). Diz o que significa.
const textoPayback = (m) => (m < 1
  ? 'paga na 1ª mensalidade'
  : `${m.toFixed(1).replace('.', ',')} meses`)

const desde = (dias) => {
  const d = new Date()
  d.setDate(d.getDate() - (dias - 1))
  return d.toISOString().slice(0, 10)
}

export default function SecaoAquisicao({ contas, precoDoPlano, isSmallScreen }) {
  const [dias, setDias] = useState(90)
  const [gasto, setGasto] = useState([])
  const [atribuicao, setAtribuicao] = useState([])
  const [origemPorConta, setOrigemPorConta] = useState({})
  const [carregando, setCarregando] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [aviso, setAviso] = useState(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      await supabase.auth.getSession()
      const [g, a, o] = await Promise.all([
        supabase
          .from('meta_ads_gasto')
          .select('data, campaign_id, campaign_name, ad_name, gasto, impressoes, cliques, cadastros_site, conversas_whatsapp, atualizado_em')
          .gte('data', desde(90))
          .limit(10000),
        supabase.from('vw_meta_atribuicao_funil').select('*'),
        supabase.from('meta_atribuicao').select('user_id, utm_source, fbc, fbclid'),
      ])
      setGasto(g.data || [])
      setAtribuicao(a.data || [])
      // Conta veio de anúncio do Meta quando carrega o clique (fbc/fbclid) ou
      // uma origem paga. Visita orgânica também grava linha, sem nada disso.
      const mapa = {}
      ;(o.data || []).forEach(r => {
        const src = (r.utm_source || '').toLowerCase()
        mapa[r.user_id] = !!(r.fbc || r.fbclid || ['meta', 'fb', 'facebook', 'ig', 'instagram'].includes(src))
      })
      setOrigemPorConta(mapa)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const atualizarGasto = async () => {
    setSincronizando(true)
    setAviso(null)
    try {
      const { data, error } = await supabase.functions.invoke('meta-ads-sync', { body: { dias: 90 } })
      if (error || data?.erro) {
        setAviso({ tipo: 'erro', texto: data?.meta || data?.erro || error?.message || 'Falha ao atualizar.' })
      } else {
        setAviso({ tipo: 'ok', texto: `Gasto atualizado: ${data.linhas} linhas, ${formatarBRL(data.totalGasto)} em 90 dias.` })
        await carregar()
      }
    } catch (e) {
      setAviso({ tipo: 'erro', texto: e.message || 'Falha ao atualizar.' })
    } finally {
      setSincronizando(false)
    }
  }

  const calc = useMemo(() => {
    const ini = desde(dias)
    const doPeriodo = gasto.filter(g => g.data >= ini)
    const soma = (campo) => doPeriodo.reduce((s, g) => s + Number(g[campo] || 0), 0)

    const g = soma('gasto')
    const impressoes = soma('impressoes')
    const cliques = soma('cliques')
    const cadastrosPixel = soma('cadastros_site')
    const conversas = soma('conversas_whatsapp')

    // Coorte: contas criadas no período.
    const coorte = contas.filter(c => (c.created_at || c.data_cadastro || '').slice(0, 10) >= ini)
    const cadastros = coorte.length
    const ativaram = coorte.filter(c => c.whatsapp_conectado === true).length
    const pagaram = coorte.filter(c => !!c.virou_pagante_em)

    // Pagantes novos no período, independente de quando criaram a conta
    // (quem virou pagante agora, vindo de um trial antigo, também custou).
    const novosPagantes = contas.filter(c => (c.virou_pagante_em || '').slice(0, 10) >= ini)
    const receitaNova = novosPagantes.reduce((s, c) => s + precoDoPlano(c.plano), 0)
    const ticket = dividir(receitaNova, novosPagantes.length)

    const cpa = dividir(g, novosPagantes.length)

    // Payback atribuído: só pagantes que vieram de anúncio, com o que cada um
    // de fato paga (média dos pagamentos reais; preço de tabela se ainda não
    // houver pagamento no gateway, como na venda na mão).
    const pagantesAds = novosPagantes.filter(c => origemPorConta[c.id])
    const ticketReal = (c) => {
      const medio = dividir(Number(c.total_pago || 0), Number(c.total_pagamentos || 0))
      return Number.isFinite(medio) && medio > 0 ? medio : precoDoPlano(c.plano)
    }
    const ticketAds = dividir(pagantesAds.reduce((t, c) => t + ticketReal(c), 0), pagantesAds.length)
    const cpaAds = dividir(g, pagantesAds.length)
    const paybackAds = dividir(cpaAds, ticketAds)
    const aindaPagam = pagantesAds.filter(c => CICLOS_PAGANTES.includes(c.ciclo)).length

    // Etapas do funil, na ordem em que a pessoa avança.
    const etapas = [
      { id: 'cliques', nome: 'Cliques no anúncio', valor: cliques },
      { id: 'cadastros', nome: 'Criaram conta', valor: cadastros },
      { id: 'ativaram', nome: 'Conectaram o WhatsApp', valor: ativaram },
      { id: 'pagaram', nome: 'Viraram pagantes', valor: pagaram.length },
    ].map((e, i, arr) => ({
      ...e,
      taxa: i === 0 ? null : dividir(e.valor, arr[i - 1].valor) * 100,
    }))

    // Gargalo = a etapa com a menor taxa de passagem, ignorando a primeira
    // (clique → cadastro depende de a landing medir tráfego, e o clique vem do
    // Meta, que conta diferente do banco).
    const medidas = etapas.slice(2).filter(e => Number.isFinite(e.taxa))
    const gargalo = medidas.length ? medidas.reduce((a, b) => (b.taxa < a.taxa ? b : a)) : null

    // Por campanha
    const porCampanha = {}
    doPeriodo.forEach(x => {
      const k = x.campaign_name || '(sem nome)'
      const c = (porCampanha[k] = porCampanha[k] || { nome: k, gasto: 0, impressoes: 0, cliques: 0, cadastros: 0, conversas: 0 })
      c.gasto += Number(x.gasto || 0)
      c.impressoes += Number(x.impressoes || 0)
      c.cliques += Number(x.cliques || 0)
      c.cadastros += Number(x.cadastros_site || 0)
      c.conversas += Number(x.conversas_whatsapp || 0)
    })
    const campanhas = Object.values(porCampanha).sort((a, b) => b.gasto - a.gasto)

    const ultimaSync = gasto.reduce((m, x) => (x.atualizado_em > m ? x.atualizado_em : m), '')

    return {
      g, impressoes, cliques, cadastrosPixel, conversas,
      cadastros, ativaram, novosPagantes: novosPagantes.length,
      ticket, cpa,
      pagantesAds: pagantesAds.length, ticketAds, cpaAds, paybackAds, aindaPagam,
      cpc: dividir(g, cliques),
      ctr: dividir(cliques, impressoes) * 100,
      cpl: dividir(g, cadastros),
      custoAtivacao: dividir(g, ativaram),
      paybackMeses: dividir(cpa, ticket),
      etapas, gargalo, campanhas, ultimaSync,
    }
  }, [gasto, contas, dias, precoDoPlano, origemPorConta])

  const semGasto = !carregando && gasto.length === 0

  const th = { textAlign: 'right', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }
  const td = { textAlign: 'right', padding: '9px 10px', fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
  const caixa = {
    border: '1px solid var(--color-border-subtle)',
    borderRadius: 'var(--radius-xl)',
    backgroundColor: 'var(--color-bg-surface)',
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, color: '#344848' }}>Aquisição — custo para ter um cliente</h3>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-muted)' }}>
            Gasto no Meta ÷ cadastros e pagantes do banco.
            {calc.ultimaSync && ` Gasto atualizado em ${new Date(calc.ultimaSync).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {PERIODOS.map(p => (
              <button
                key={p.id}
                onClick={() => setDias(p.id)}
                style={{
                  padding: '6px 12px', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  border: '1px solid var(--color-border-subtle)',
                  backgroundColor: dias === p.id ? 'var(--mensalli-green-500)' : 'var(--color-bg-surface)',
                  color: dias === p.id ? '#fff' : 'var(--color-text-primary)',
                  fontWeight: dias === p.id ? 600 : 400,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={atualizarGasto}
            disabled={sincronizando}
            style={{
              padding: '6px 14px', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: sincronizando ? 'default' : 'pointer',
              border: '1px solid var(--color-border-subtle)', backgroundColor: 'var(--color-bg-surface)',
              color: 'var(--color-text-primary)', fontWeight: 600,
            }}
          >
            {sincronizando ? 'Atualizando…' : 'Atualizar gasto'}
          </button>
        </div>
      </div>

      {aviso && (
        <div style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 13,
          backgroundColor: aviso.tipo === 'ok' ? 'var(--color-bg-success-subtle, #E8F5E9)' : 'var(--color-bg-danger-subtle, #FDECEA)',
          color: aviso.tipo === 'ok' ? '#1B5E20' : '#B71C1C',
        }}>
          {aviso.texto}
        </div>
      )}

      {semGasto && (
        <div style={{ ...caixa, padding: 16, marginBottom: 14, fontSize: 13, color: 'var(--color-text-muted)' }}>
          Ainda não há gasto sincronizado. Clique em <strong>Atualizar gasto</strong> para buscar os últimos 90 dias do Meta.
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: isSmallScreen ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12, marginBottom: 20,
      }}>
        <StatCard
          label="Gasto em anúncios" value={brl(calc.g)} icon="mdi:bullhorn-outline" accent="warning" loading={carregando}
          hint={`${inteiro(calc.impressoes)} impressões · ${inteiro(calc.cliques)} cliques`}
        />
        <StatCard
          label="CPA (custo por pagante)" value={brl(calc.cpa)} icon="mdi:target" accent="danger" loading={carregando}
          hint={`${calc.novosPagantes} ${calc.novosPagantes === 1 ? 'novo pagante' : 'novos pagantes'} no período`}
        />
        <StatCard
          label="Custo por cadastro" value={brl(calc.cpl)} icon="mdi:account-plus-outline" accent="primary" loading={carregando}
          hint={`${calc.cadastros} contas criadas`}
        />
        <StatCard
          label="Custo por ativação" value={brl(calc.custoAtivacao)} icon="mdi:whatsapp" accent="info" loading={carregando}
          hint={`${calc.ativaram} conectaram o WhatsApp`}
        />
        <StatCard
          label="Payback (só anúncios)"
          value={Number.isFinite(calc.paybackAds) ? textoPayback(calc.paybackAds) : '—'}
          icon="mdi:timer-sand" accent={calc.pagantesAds < 5 ? 'warning' : 'neutral'} loading={carregando}
          hint={calc.pagantesAds === 0
            ? 'nenhum pagante veio de anúncio no período'
            : `${calc.pagantesAds} ${calc.pagantesAds === 1 ? 'pagante' : 'pagantes'} de anúncio · CPA ${brl(calc.cpaAds)} · ticket ${brl(calc.ticketAds)}`}
          footer={calc.pagantesAds > 0 ? (
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {calc.aindaPagam} de {calc.pagantesAds} ainda pagam
              {calc.pagantesAds < 5 && ' · poucas vendas, número instável'}
            </span>
          ) : null}
        />
        <StatCard
          label="CPC · CTR" value={brl(calc.cpc)} icon="mdi:cursor-default-click-outline" accent="neutral" loading={carregando}
          hint={`CTR ${pct(calc.ctr)}`}
        />
      </div>

      {/* Funil */}
      <div style={{ ...caixa, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Funil — contas criadas nos últimos {dias} dias</div>
        {calc.gargalo && calc.cadastros > 0 && (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 14 }}>
            Maior queda: <strong>{calc.gargalo.nome.toLowerCase()}</strong> — só {pct(calc.gargalo.taxa)} da etapa anterior chega lá.
          </div>
        )}
        {calc.etapas.map((e, i) => {
          const topo = Math.max(calc.etapas[0].valor, 1)
          const largura = Math.max((e.valor / topo) * 100, e.valor > 0 ? 2 : 0)
          const ehGargalo = calc.gargalo?.id === e.id
          return (
            <div key={e.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5, gap: 12 }}>
                <span style={{ fontWeight: 600 }}>{e.nome}</span>
                <span style={{ color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {inteiro(e.valor)}
                  {i > 0 && ` · ${pct(e.taxa)} da etapa anterior`}
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 999, backgroundColor: 'var(--neutral-200)', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(largura, 100)}%`, height: '100%',
                  backgroundColor: ehGargalo ? 'var(--color-danger, #D32F2F)' : 'var(--mensalli-green-500)',
                }} />
              </div>
            </div>
          )
        })}
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
          Cliques vêm do Meta; as demais etapas vêm do banco. Clique → cadastro mistura as duas fontes, então use só como ordem de grandeza.
          "Pagante" = já pagou alguma vez.
        </div>
      </div>

      {/* Por campanha */}
      <div style={{ ...caixa, marginBottom: 20, overflowX: 'auto' }}>
        <div style={{ padding: '14px 16px 4px', fontSize: 13, fontWeight: 600 }}>Por campanha (Meta)</div>
        {calc.campanhas.length === 0 ? (
          <div style={{ padding: '8px 16px 16px', fontSize: 13, color: 'var(--color-text-muted)' }}>Sem gasto no período.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <th style={{ ...th, textAlign: 'left' }}>Campanha</th>
                <th style={th}>Gasto</th>
                <th style={th}>Cliques</th>
                <th style={th}>CPC</th>
                <th style={th}>Cadastros (pixel)</th>
                <th style={th}>Custo/cadastro</th>
                <th style={th}>Conversas WhatsApp</th>
                <th style={th}>Custo/conversa</th>
              </tr>
            </thead>
            <tbody>
              {calc.campanhas.map(c => (
                <tr key={c.nome} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', fontWeight: 600 }}>{c.nome}</td>
                  <td style={td}>{formatarBRL(c.gasto)}</td>
                  <td style={td}>{inteiro(c.cliques)}</td>
                  <td style={td}>{brl(dividir(c.gasto, c.cliques))}</td>
                  <td style={td}>{inteiro(c.cadastros)}</td>
                  <td style={td}>{brl(dividir(c.gasto, c.cadastros))}</td>
                  <td style={td}>{inteiro(c.conversas)}</td>
                  <td style={td}>{brl(dividir(c.gasto, c.conversas))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Atribuição no banco */}
      <div style={{ ...caixa, overflowX: 'auto' }}>
        <div style={{ padding: '14px 16px 0', fontSize: 13, fontWeight: 600 }}>De onde vieram as contas (banco, todo o histórico)</div>
        <p style={{ margin: '4px 16px 8px', fontSize: 12, color: 'var(--color-text-muted)' }}>
          Origem gravada no cadastro. "(meta sem utm)" veio de anúncio sem UTM; "(sem atribuicao)" não deixou rastro.
        </p>
        {atribuicao.length === 0 ? (
          <div style={{ padding: '0 16px 16px', fontSize: 13, color: 'var(--color-text-muted)' }}>Sem dados.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <th style={{ ...th, textAlign: 'left' }}>Campanha</th>
                <th style={{ ...th, textAlign: 'left' }}>Criativo</th>
                <th style={th}>Cadastros</th>
                <th style={th}>Ativaram</th>
                <th style={th}>Pagantes</th>
                <th style={th}>% pagante</th>
              </tr>
            </thead>
            <tbody>
              {[...atribuicao].sort((a, b) => b.cadastros - a.cadastros).map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal' }}>{r.campanha}</td>
                  <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', color: 'var(--color-text-muted)' }}>{r.criativo}</td>
                  <td style={td}>{r.cadastros}</td>
                  <td style={td}>{r.ativaram}</td>
                  <td style={td}>{r.pagantes}</td>
                  <td style={td}>{pct(Number(r.taxa_pagante_pct))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
