import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

export default function SecaoMetaAttribution() {
  const [dados, setDados] = useState({
    totalGasto: 0,
    leads: 0,
    contas: 0,
    whatsapp: 0,
    pagantes: 0,
    cac: 0,
    eventos: [],
    funil: []
  })
  const [carregando, setCarregando] = useState(true)
  const [periodo, setPeriodo] = useState('30d') // 7d, 30d, 90d

  useEffect(() => {
    carregarDados()
  }, [periodo])

  const carregarDados = async () => {
    setCarregando(true)
    try {
      const dataLimite = new Date()
      if (periodo === '7d') dataLimite.setDate(dataLimite.getDate() - 7)
      else if (periodo === '30d') dataLimite.setDate(dataLimite.getDate() - 30)
      else if (periodo === '90d') dataLimite.setDate(dataLimite.getDate() - 90)

      // Eventos do Meta
      const { data: eventos } = await supabase
        .from('meta_capi_eventos')
        .select('*')
        .gte('criado_em', dataLimite.toISOString())
        .order('criado_em', { ascending: false })
        .limit(100)

      // Contar eventos por tipo
      const completeSignup = eventos?.filter(e => e.event_name === 'CompleteSignup').length || 0
      const ativouWhatsapp = eventos?.filter(e => e.event_name === 'AtivouWhatsApp').length || 0
      const purchases = eventos?.filter(e => e.event_name === 'Purchase').length || 0

      // Total gasto (estimado: $8-12 por lead em Meta Ads)
      const estimadoGasto = completeSignup * 10 // média de $10 por lead

      // CAC final
      const cac = purchases > 0 ? (estimadoGasto / purchases).toFixed(2) : 0

      // Funil
      const funil = [
        { stage: 'Leads', count: completeSignup, percentage: 100 },
        { stage: 'WhatsApp On', count: ativouWhatsapp, percentage: completeSignup > 0 ? Math.round((ativouWhatsapp / completeSignup) * 100) : 0 },
        { stage: 'Pagantes', count: purchases, percentage: completeSignup > 0 ? Math.round((purchases / completeSignup) * 100) : 0 }
      ]

      setDados({
        totalGasto: estimadoGasto,
        leads: completeSignup,
        contas: completeSignup, // estimado = leads
        whatsapp: ativouWhatsapp,
        pagantes: purchases,
        cac,
        eventos: eventos || [],
        funil
      })
    } catch (erro) {
      console.error('Erro ao carregar dados Meta:', erro)
    } finally {
      setCarregando(false)
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
        {typeof valor === 'number' ? (valor > 100 ? valor.toFixed(0) : valor.toFixed(2)) : valor}
      </div>
      {subtitulo && (
        <div style={{ fontSize: '12px', color: '#9ca3af' }}>
          {subtitulo}
        </div>
      )}
    </div>
  )

  const cores = ['#3b82f6', '#10b981', '#f59e0b']

  return (
    <div style={{ padding: '24px', background: '#f9fafb', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: '#1f2937' }}>
          📊 Meta Ads Attribution
        </h2>
        <p style={{ color: '#6b7280', fontSize: '14px' }}>
          Rastreie o funil completo: Lead → Conta → WhatsApp → Pagante
        </p>
      </div>

      {/* Filtro de período */}
      <div style={{ marginBottom: '24px', display: 'flex', gap: '12px' }}>
        {['7d', '30d', '90d'].map(p => (
          <button
            key={p}
            onClick={() => setPeriodo(p)}
            style={{
              padding: '8px 16px',
              border: periodo === p ? '2px solid #2563eb' : '1px solid #d1d5db',
              background: periodo === p ? '#eff6ff' : 'white',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: periodo === p ? '600' : '500',
              color: periodo === p ? '#2563eb' : '#6b7280',
              transition: 'all 0.2s'
            }}
          >
            Últimos {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
          </button>
        ))}
      </div>

      {carregando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
          Carregando dados...
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
            <Card titulo="Leads (CompleteSignup)" valor={dados.leads} cor="#3b82f6" />
            <Card titulo="WhatsApp Conectado" valor={dados.whatsapp} subtitulo={`${dados.leads > 0 ? Math.round((dados.whatsapp / dados.leads) * 100) : 0}% de conversão`} cor="#10b981" />
            <Card titulo="Pagantes (Purchase)" valor={dados.pagantes} subtitulo={`${dados.leads > 0 ? Math.round((dados.pagantes / dados.leads) * 100) : 0}% do total`} cor="#f59e0b" />
            <Card titulo="CAC (R$)" valor={`R$ ${dados.cac}`} subtitulo={`Custo por cliente ativado`} cor="#8b5cf6" />
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
              {dados.funil.map((stage, idx) => (
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
                    {stage.percentage}% da origem
                  </div>
                </div>
              ))}
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
                    <th style={{ textAlign: 'left', padding: '12px 0', fontWeight: 600 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.eventos.slice(0, 20).map((evento) => {
                    const statusOk = evento.resposta?.events_received > 0
                    return (
                      <tr key={evento.id} style={{ borderBottom: '1px solid #f3f4f6', color: '#374151' }}>
                        <td style={{ padding: '12px 0' }}>
                          {new Date(evento.criado_em).toLocaleString('pt-BR')}
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
                            {evento.event_name}
                          </span>
                        </td>
                        <td style={{ padding: '12px 0', color: '#6b7280', fontSize: '12px' }}>
                          {evento.origem === 'trigger' ? '🔄 Trigger' : '📱 Front'}
                        </td>
                        <td style={{ padding: '12px 0' }}>
                          {evento.valor ? `R$ ${evento.valor.toFixed(2)}` : '-'}
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
                            {statusOk ? '✅ OK' : '⚠️ Falha'}
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

          {/* Nota de implementação */}
          <div style={{
            marginTop: '24px',
            padding: '16px',
            background: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: '8px',
            fontSize: '12px',
            color: '#92400e'
          }}>
            <strong>⚠️ Em construção:</strong> O dashboard atualiza a cada 60s. Para ativar o envio automático de eventos para o Meta CAPI, execute o SQL (meta-capi-setup.sql) e configure um cron job que chame a edge function /meta-capi com os eventos pendentes.
          </div>
        </>
      )}
    </div>
  )
}
