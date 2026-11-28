import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

/* ============================================================
   Meta Ads Attribution — o funil que o Meta CAPI recebe

   Fontes:
     - meta_capi_eventos → um registro por evento mandado pro Meta:
         CompleteRegistration (front, no cadastro),
         AtivouWhatsApp (trigger em logs_conexao),
         Purchase (trigger em usuarios, um por conta por mês — inclui renovação);
     - meta_atribuicao   → fbclid/fbc/utm de quem chegou por anúncio;
     - meta_ads_gasto    → gasto real, sincronizado pela edge function meta-ads-sync.

   "Pagante novo" = conta cujo PRIMEIRO Purchase caiu no período. Os demais
   Purchase do período são renovações e não entram no CAC.
   ============================================================ */

const PERIODOS = [
  { id: 'mes', label: 'Este mês' },
  { id: '7d', label: 'Últimos 7 dias' },
  { id: '30d', label: 'Últimos 30 dias' },
  { id: '90d', label: 'Últimos 90 dias' },
]

const inicioDoPeriodo = (periodo) => {
  const d = new Date()
  if (periodo === 'mes') return new Date(d.getFullYear(), d.getMonth(), 1)
  const dias = periodo === '7d' ? 7 : periodo === '30d' ? 30 : 90
  d.setDate(d.getDate() - dias)
  d.setHours(0, 0, 0, 0)
  return d
}

const dataLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const pct = (parte, todo) => (todo > 0 ? Math.round((parte / todo) * 100) : 0)

// Chegou por anúncio do Meta: tem clique rastreado (fbclid/fbc) ou utm de Meta.
const veioDoMeta = (a) =>
  !!(a && (a.fbclid || a.fbc || /^(fb|facebook|ig|instagram|meta)/i.test(a.utm_source || '')))

const ROTULO_EVENTO = {
  CompleteRegistration: 'Cadastro',
  CompleteSignup: 'Cadastro',
  AtivouWhatsApp: 'WhatsApp conectado',
  Purchase: 'Pagamento',
}

export default function SecaoMetaAttribution() {
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)
  // 30 dias por padrão: "Este mês" nos primeiros dias do mês abre quase zerado
  const [periodo, setPeriodo] = useState('30d')
  const [sincronizando, setSincronizando] = useState(false)
  const [aviso, setAviso] = useState(null)

  useEffect(() => {
    carregarDados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo])

  const carregarDados = async () => {
    setCarregando(true)
    setErro(null)
    try {
      const inicio = inicioDoPeriodo(periodo)

      const [rEventos, rCompras, rGasto] = await Promise.all([
        supabase
          .from('meta_capi_eventos')
          .select('id, user_id, event_name, valor, origem, resposta, created_at')
          .gte('created_at', inicio.toISOString())
          .order('created_at', { ascending: false })
          .limit(10000),
        // Todos os Purchase da história, para saber qual é o primeiro de cada conta
        supabase
          .from('meta_capi_eventos')
          .select('user_id, created_at')
          .eq('event_name', 'Purchase')
          .limit(10000),
        supabase
          .from('meta_ads_gasto')
          .select('data, gasto')
          .gte('data', dataLocal(inicio))
          .limit(10000),
      ])
      const falha = rEventos.error || rCompras.error || rGasto.error
      if (falha) throw falha

      const eventos = rEventos.data || []
      const usuariosDo = (...nomes) =>
        new Set(eventos.filter(e => nomes.includes(e.event_name)).map(e => e.user_id))

      // Backfill de agosto/2026 não é conexão de verdade no período
      const leads = usuariosDo('CompleteRegistration', 'CompleteSignup')
      const whatsapp = new Set(
        eventos.filter(e => e.event_name === 'AtivouWhatsApp' && e.origem !== 'backfill').map(e => e.user_id)
      )

      const primeiraCompra = {}
      for (const c of rCompras.data || []) {
        if (!primeiraCompra[c.user_id] || c.created_at < primeiraCompra[c.user_id]) {
          primeiraCompra[c.user_id] = c.created_at
        }
      }
      const comprasPeriodo = eventos.filter(e => e.event_name === 'Purchase')
      const pagantesNovos = new Set(
        comprasPeriodo.filter(e => new Date(primeiraCompra[e.user_id]) >= inicio).map(e => e.user_id)
      )
      const renovacoes = comprasPeriodo.filter(e => !pagantesNovos.has(e.user_id)).length
      const receita = comprasPeriodo.reduce((s, e) => s + Number(e.valor || 0), 0)

      // Quantos dos leads vieram de anúncio
      let leadsMeta = 0
      if (leads.size > 0) {
        const { data: atrib } = await supabase
          .from('meta_atribuicao')
          .select('user_id, fbclid, fbc, utm_source')
          .in('user_id', [...leads])
        leadsMeta = (atrib || []).filter(veioDoMeta).length
      }

      // Anúncio de WhatsApp: conversa (mensalli_leads) → conta (vínculo por
      // telefone) → pagante. Some sozinho se a coluna ainda não existir.
      let wppAnuncio = null
      const { data: conversas, error: erroConversas } = await supabase
        .from('mensalli_leads')
        .select('id, usuario_id')
        .eq('veio_de_anuncio', true)
        .gte('created_at', inicio.toISOString())
        .limit(10000)
      if (!erroConversas) {
        const comConta = [...new Set((conversas || []).map(c => c.usuario_id).filter(Boolean))]
        let pagantes = 0
        if (comConta.length > 0) {
          const { data: contas } = await supabase
            .from('usuarios')
            .select('id, plano_pago')
            .in('id', comConta)
          pagantes = (contas || []).filter(u => u.plano_pago).length
        }
        wppAnuncio = { conversas: (conversas || []).length, contas: comConta.length, pagantes }
      }

      const linhasGasto = rGasto.data || []
      const gasto = linhasGasto.reduce((s, g) => s + Number(g.gasto || 0), 0)
      const { data: ultimo } = await supabase
        .from('meta_ads_gasto')
        .select('data')
        .order('data', { ascending: false })
        .limit(1)

      setDados({
        leads: leads.size,
        leadsMeta,
        whatsapp: whatsapp.size,
        pagantesNovos: pagantesNovos.size,
        renovacoes,
        receita,
        gasto,
        gastoAte: ultimo?.[0]?.data || null,
        cac: pagantesNovos.size > 0 ? gasto / pagantesNovos.size : null,
        cpl: leads.size > 0 ? gasto / leads.size : null,
        wppAnuncio,
        eventos,
      })
    } catch (e) {
      console.error('Erro ao carregar dados Meta:', e)
      setErro(e.message || 'Falha ao carregar.')
    } finally {
      setCarregando(false)
    }
  }

  const atualizarGasto = async () => {
    setSincronizando(true)
    setAviso(null)
    try {
      const { data, error } = await supabase.functions.invoke('meta-ads-sync', { body: { dias: 90 } })
      if (error || data?.erro) {
        setAviso({ tipo: 'erro', texto: data?.meta || data?.erro || error?.message || 'Falha ao atualizar.' })
      } else {
        setAviso({ tipo: 'ok', texto: `Gasto atualizado: ${data.linhas} linhas, ${brl(data.totalGasto)} em 90 dias.` })
        await carregarDados()
      }
    } catch (e) {
      setAviso({ tipo: 'erro', texto: e.message || 'Falha ao atualizar.' })
    } finally {
      setSincronizando(false)
    }
  }

  const Card = ({ titulo, valor, subtitulo, cor = '#2563eb' }) => (
    <div style={{
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      padding: '20px',
      minHeight: '120px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', fontWeight: 500 }}>
        {titulo}
      </div>
      <div style={{ fontSize: '28px', fontWeight: 'bold', color: cor, marginBottom: '4px' }}>
        {valor}
      </div>
      {subtitulo && (
        <div style={{ fontSize: '12px', color: '#9ca3af' }}>
          {subtitulo}
        </div>
      )}
    </div>
  )

  const cores = ['#3b82f6', '#10b981', '#f59e0b']

  // Gasto parado há mais de 2 dias: o CAC fica subestimado
  const gastoDesatualizado = dados?.gastoAte
    ? (Date.now() - new Date(dados.gastoAte + 'T12:00:00').getTime()) / 86400000 > 2
    : true

  const funil = dados ? [
    { stage: 'Cadastros', count: dados.leads, percentage: 100 },
    { stage: 'WhatsApp conectado', count: dados.whatsapp, percentage: pct(dados.whatsapp, dados.leads) },
    { stage: 'Pagantes novos', count: dados.pagantesNovos, percentage: pct(dados.pagantesNovos, dados.leads) },
  ] : []

  return (
    <div style={{ padding: '24px', background: '#f9fafb', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: '#1f2937' }}>
          📊 Meta Ads Attribution
        </h2>
        <p style={{ color: '#6b7280', fontSize: '14px' }}>
          Rastreie o funil completo: Cadastro → WhatsApp → Pagante
        </p>
      </div>

      {/* Filtro de período */}
      <div style={{ marginBottom: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIODOS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriodo(p.id)}
            style={{
              padding: '8px 16px',
              border: periodo === p.id ? '2px solid #2563eb' : '1px solid #d1d5db',
              background: periodo === p.id ? '#eff6ff' : 'white',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: periodo === p.id ? '600' : '500',
              color: periodo === p.id ? '#2563eb' : '#6b7280',
              transition: 'all 0.2s'
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={atualizarGasto}
          disabled={sincronizando}
          style={{
            marginLeft: 'auto',
            padding: '8px 16px',
            border: '1px solid #d1d5db',
            background: 'white',
            borderRadius: '8px',
            cursor: sincronizando ? 'wait' : 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            color: '#374151'
          }}
        >
          {sincronizando ? 'Atualizando…' : '↻ Atualizar gasto do Meta'}
        </button>
      </div>

      {aviso && (
        <div style={{
          marginBottom: '16px',
          padding: '12px 16px',
          borderRadius: '8px',
          fontSize: '13px',
          background: aviso.tipo === 'ok' ? '#dcfce7' : '#fee2e2',
          color: aviso.tipo === 'ok' ? '#166534' : '#991b1b'
        }}>
          {aviso.texto}
        </div>
      )}

      {carregando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
          Carregando dados...
        </div>
      ) : erro ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#991b1b' }}>
          Erro ao carregar: {erro}
        </div>
      ) : (
        <>
          {/* Cards principais */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <Card
              titulo="Cadastros (contas criadas)"
              valor={dados.leads}
              subtitulo={`${dados.leadsMeta} pelo clique no site (fbclid/utm)`}
              cor="#3b82f6"
            />
            <Card
              titulo="WhatsApp conectado"
              valor={dados.whatsapp}
              subtitulo={`${pct(dados.whatsapp, dados.leads)}% dos cadastros`}
              cor="#10b981"
            />
            <Card
              titulo="Pagantes novos"
              valor={dados.pagantesNovos}
              subtitulo={`+ ${dados.renovacoes} renovações · ${brl(dados.receita)} no período`}
              cor="#f59e0b"
            />
            <Card
              titulo="Gasto no Meta"
              valor={brl(dados.gasto)}
              subtitulo={dados.cpl != null ? `${brl(dados.cpl)} por cadastro` : 'Sem cadastros no período'}
              cor="#ef4444"
            />
            <Card
              titulo="CAC"
              valor={dados.cac != null ? brl(dados.cac) : '—'}
              subtitulo="Gasto ÷ pagantes novos"
              cor="#8b5cf6"
            />
          </div>

          {gastoDesatualizado && (
            <div style={{
              marginBottom: '24px',
              padding: '12px 16px',
              background: '#fef3c7',
              border: '1px solid #fcd34d',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#92400e'
            }}>
              <strong>⚠️ Gasto desatualizado:</strong> o último dia sincronizado do Meta é{' '}
              {dados.gastoAte ? new Date(dados.gastoAte + 'T12:00:00').toLocaleDateString('pt-BR') : 'nenhum'}.
              Clique em "Atualizar gasto do Meta" para o CAC refletir o período inteiro.
            </div>
          )}

          {/* Funil do anúncio de WhatsApp */}
          <div style={{
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '4px', color: '#1f2937' }}>
              💬 Anúncio de WhatsApp
            </h3>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px' }}>
              Conversas que chegaram pelo anúncio neste período e o que aconteceu com elas (conta ligada pelo telefone)
            </div>
            {dados.wppAnuncio ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
                {[
                  { rotulo: 'Conversas', valor: dados.wppAnuncio.conversas, sub: dados.wppAnuncio.conversas > 0 ? `${brl(dados.gasto / dados.wppAnuncio.conversas)} por conversa` : '—', cor: '#3b82f6' },
                  { rotulo: 'Criaram conta', valor: dados.wppAnuncio.contas, sub: `${pct(dados.wppAnuncio.contas, dados.wppAnuncio.conversas)}% das conversas`, cor: '#10b981' },
                  { rotulo: 'Pagantes', valor: dados.wppAnuncio.pagantes, sub: `${pct(dados.wppAnuncio.pagantes, dados.wppAnuncio.conversas)}% das conversas`, cor: '#f59e0b' },
                  { rotulo: 'Custo por pagante', valor: dados.wppAnuncio.pagantes > 0 ? brl(dados.gasto / dados.wppAnuncio.pagantes) : '—', sub: 'Gasto ÷ pagantes do anúncio', cor: '#8b5cf6' },
                ].map((c) => (
                  <div key={c.rotulo} style={{
                    textAlign: 'center',
                    padding: '16px',
                    background: `${c.cor}15`,
                    borderRadius: '8px',
                    borderLeft: `4px solid ${c.cor}`
                  }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>{c.rotulo}</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: c.cor, marginBottom: '4px' }}>{c.valor}</div>
                    <div style={{ fontSize: '13px', color: '#9ca3af' }}>{c.sub}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: '#92400e' }}>
                Rode o sql-meta-ads-cron-e-funil-whatsapp.sql no SQL Editor para ativar este bloco.
              </div>
            )}
          </div>

          {/* Funil visual */}
          <div style={{
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1f2937' }}>
              🔻 Funil de Conversão
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {funil.map((stage, idx) => (
                <div key={stage.stage} style={{
                  textAlign: 'center',
                  padding: '16px',
                  background: `${cores[idx]}15`,
                  borderRadius: '8px',
                  borderLeft: `4px solid ${cores[idx]}`
                }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                    {stage.stage}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: cores[idx], marginBottom: '4px' }}>
                    {stage.count}
                  </div>
                  <div style={{ fontSize: '13px', color: '#9ca3af' }}>
                    {stage.percentage}% dos cadastros
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '12px' }}>
              Cada etapa conta quem teve o evento dentro do período — não é coorte: quem pagou agora pode ter se cadastrado antes.
            </div>
          </div>

          {/* Tabela de eventos recentes */}
          <div style={{
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1f2937' }}>
              📋 Eventos Recentes
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                    <th style={{ textAlign: 'left', padding: '12px 0', fontWeight: 600 }}>Data/Hora</th>
                    <th style={{ textAlign: 'left', padding: '12px 0', fontWeight: 600 }}>Evento</th>
                    <th style={{ textAlign: 'left', padding: '12px 0', fontWeight: 600 }}>Origem</th>
                    <th style={{ textAlign: 'left', padding: '12px 0', fontWeight: 600 }}>Valor</th>
                    <th style={{ textAlign: 'left', padding: '12px 0', fontWeight: 600 }}>Meta recebeu?</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.eventos.slice(0, 30).map((evento) => {
                    const statusOk = evento.resposta?.events_received > 0
                    return (
                      <tr key={evento.id} style={{ borderBottom: '1px solid #f3f4f6', color: '#374151' }}>
                        <td style={{ padding: '12px 0' }}>
                          {new Date(evento.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td style={{ padding: '12px 0' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            background: '#f0f9ff',
                            color: '#0369a1',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 500
                          }}>
                            {ROTULO_EVENTO[evento.event_name] || evento.event_name}
                          </span>
                        </td>
                        <td style={{ padding: '12px 0', color: '#6b7280', fontSize: '12px' }}>
                          {evento.origem === 'front' ? '📱 Front' : evento.origem === 'backfill' ? '📦 Backfill' : '🔄 Trigger'}
                        </td>
                        <td style={{ padding: '12px 0' }}>
                          {evento.valor != null ? brl(evento.valor) : '-'}
                        </td>
                        <td style={{ padding: '12px 0' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            background: statusOk ? '#dcfce7' : '#fee2e2',
                            color: statusOk ? '#166534' : '#991b1b',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 500
                          }}>
                            {statusOk ? '✅ OK' : '⚠️ Não'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {dados.eventos.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px', color: '#9ca3af' }}>
                  Nenhum evento registrado neste período
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
