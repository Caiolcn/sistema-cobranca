import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export default function SecaoGoogleMetrics() {
  const [dados, setDados] = useState({
    contas: 0,
    contasPorNicho: {},
    cacPorNicho: {},
    landingPages: [],
    conversoesPorDia: []
  })
  const [carregando, setCarregando] = useState(true)
  const [periodo, setPeriodo] = useState('30d')

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

      // Contas criadas via Google (gclid)
      const { data: contas } = await supabase
        .from('usuarios')
        .select('id, criado_em, google_lead_source')
        .not('id', 'is', null)
        .gte('criado_em', dataLimite.toISOString())

      // Agrupar por nicho
      const porNicho = {}
      contas?.forEach(c => {
        const nicho = c.google_lead_source || 'sem-origem'
        porNicho[nicho] = (porNicho[nicho] || 0) + 1
      })

      // Calcular CAC por nicho (estimado: $10/lead Google Ads)
      const cac = {}
      Object.keys(porNicho).forEach(nicho => {
        cac[nicho] = (porNicho[nicho] * 10).toFixed(2)
      })

      setDados({
        contas: contas?.length || 0,
        contasPorNicho: porNicho,
        cacPorNicho: cac,
        landingPages: Object.keys(porNicho).map(nicho => ({
          url: `/${nicho}`,
          conversoes: porNicho[nicho],
          taxa: ((porNicho[nicho] / (contas?.length || 1)) * 100).toFixed(1)
        })),
        conversoesPorDia: []
      })
    } catch (erro) {
      console.error('Erro ao carregar dados Google Ads:', erro)
    } finally {
      setCarregando(false)
    }
  }

  const Card = ({ titulo, valor, subtitulo, cor = '#ea4335' }) => (
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

  const cores = { pilates: '#3b82f6', luta: '#ef4444', natacao: '#10b981', multi: '#f59e0b' }

  return (
    <div style={{ padding: '24px', background: '#f9fafb', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', color: '#1f2937' }}>
          📊 Google Ads Performance
        </h2>
        <p style={{ color: '#6b7280', fontSize: '14px' }}>
          Landing pages por nicho e conversões
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
              border: periodo === p ? '2px solid #ea4335' : '1px solid #d1d5db',
              background: periodo === p ? '#fef2f2' : 'white',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: periodo === p ? '600' : '500',
              color: periodo === p ? '#ea4335' : '#6b7280'
            }}
          >
            {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
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
            <Card titulo="Total de Contas" valor={dados.contas} cor="#ea4335" />
            <Card titulo="Nicho com Mais Conversões" valor={Object.keys(dados.contasPorNicho)[0] || '-'} cor="#f59e0b" />
            {Object.keys(dados.contasPorNicho).map(nicho => (
              <Card
                key={nicho}
                titulo={`${nicho.charAt(0).toUpperCase() + nicho.slice(1)}`}
                valor={dados.contasPorNicho[nicho]}
                subtitulo={`CAC: R$ ${dados.cacPorNicho[nicho]}`}
                cor={cores[nicho] || '#3b82f6'}
              />
            ))}
          </div>

          {/* Tabela de Landing Pages */}
          <div style={{
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#1f2937' }}>
              📄 Landing Pages
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                    <th style={{ textAlign: 'left', padding: '12px 0', fontWeight: 600 }}>URL</th>
                    <th style={{ textAlign: 'left', padding: '12px 0', fontWeight: 600 }}>Conversões</th>
                    <th style={{ textAlign: 'left', padding: '12px 0', fontWeight: 600 }}>Taxa</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.landingPages.map(lp => (
                    <tr key={lp.url} style={{ borderBottom: '1px solid #f3f4f6', color: '#374151' }}>
                      <td style={{ padding: '12px 0' }}>
                        <code style={{ background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>
                          mensalli.com.br{lp.url}
                        </code>
                      </td>
                      <td style={{ padding: '12px 0', fontWeight: 600 }}>{lp.conversoes}</td>
                      <td style={{ padding: '12px 0' }}>{lp.taxa}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {dados.landingPages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px', color: '#9ca3af' }}>
                  Nenhuma conversão ainda
                </div>
              )}
            </div>
          </div>

          {/* Setup Info */}
          <div style={{
            padding: '16px',
            background: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: '8px',
            fontSize: '12px',
            color: '#92400e'
          }}>
            <strong>📝 Setup Google Ads:</strong> Configure campanhas de Search apontando para /pilates, /luta, /natacao ou /multi. O gclid é capturado automaticamente.
          </div>
        </>
      )}
    </div>
  )
}
