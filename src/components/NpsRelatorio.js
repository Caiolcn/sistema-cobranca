import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabaseClient'
import { Icon } from '@iconify/react'

export default function NpsRelatorio({ userId, isLocked }) {
  const [respostas, setRespostas] = useState([])
  const [pendentes, setPendentes] = useState(0)
  const [periodoDias, setPeriodoDias] = useState(90)
  const [loading, setLoading] = useState(true)

  const podeUsar = !isLocked || !isLocked('premium')

  const carregar = useCallback(async () => {
    if (!userId || !podeUsar) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const desde = new Date()
      desde.setDate(desde.getDate() - periodoDias)
      const desdeIso = desde.toISOString()

      const [respostasResult, pendentesResult] = await Promise.all([
        supabase
          .from('nps_respostas')
          .select('id, nota, comentario, tipo_gatilho, respondido_em, devedor_id, devedores(nome)')
          .eq('user_id', userId)
          .not('nota', 'is', null)
          .gte('respondido_em', desdeIso)
          .order('respondido_em', { ascending: false }),
        supabase
          .from('nps_respostas')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .is('nota', null)
      ])

      setRespostas(respostasResult.data || [])
      setPendentes(pendentesResult.count || 0)
    } catch (err) {
      console.error('Erro ao carregar NPS:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, periodoDias, podeUsar])

  useEffect(() => { carregar() }, [carregar])

  // ============================================================
  // Cálculo do score
  // ============================================================
  const total = respostas.length
  const promotores = respostas.filter(r => r.nota >= 9).length
  const neutros = respostas.filter(r => r.nota >= 7 && r.nota <= 8).length
  const detratores = respostas.filter(r => r.nota <= 6).length
  const score = total > 0
    ? Math.round(((promotores - detratores) / total) * 100 * 10) / 10
    : 0

  const corScore = score >= 50 ? '#16a34a' : score >= 0 ? '#f59e0b' : '#dc2626'
  const labelScore = score >= 75 ? 'Excelente' : score >= 50 ? 'Bom' : score >= 0 ? 'Razoável' : 'Crítico'

  // ============================================================
  // Render
  // ============================================================
  if (!podeUsar) {
    return (
      <div className="home-section" style={{ marginBottom: '24px' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '40px 32px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#fff3e0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
            <Icon icon="mdi:lock" width="28" style={{ color: '#ff9800' }} />
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '600', color: '#1a1a1a' }}>Satisfação (NPS)</h2>
          <p style={{ margin: '0 0 20px', fontSize: '14px', color: '#666' }}>
            Acompanhe o NPS dos seus alunos e veja os comentários. Disponível no plano <strong>Premium</strong>.
          </p>
          <button onClick={() => window.location.href = '/app/configuracao?aba=upgrade'}
            style={{ padding: '10px 24px', backgroundColor: '#ff9800', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
            Fazer Upgrade
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="home-section" style={{ marginBottom: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#344848', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="mdi:star-outline" width="22" style={{ color: '#fbbf24' }} />
            Satisfação (NPS)
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#666' }}>
            {total} {total === 1 ? 'resposta' : 'respostas'} nos últimos {periodoDias} dias
            {pendentes > 0 && ` · ${pendentes} aguardando resposta`}
          </p>
        </div>

        {/* Filtro de período */}
        <div style={{ display: 'inline-flex', gap: '4px', backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '3px' }}>
          {[30, 90, 365].map(d => (
            <button
              key={d}
              onClick={() => setPeriodoDias(d)}
              style={{
                padding: '6px 12px',
                backgroundColor: periodoDias === d ? 'white' : 'transparent',
                color: periodoDias === d ? '#1a1a1a' : '#666',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: periodoDias === d ? '600' : '500',
                boxShadow: periodoDias === d ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
              }}
            >
              {d === 30 ? '30 dias' : d === 90 ? '90 dias' : '1 ano'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Carregando...</div>
      ) : total === 0 ? (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
          <Icon icon="mdi:star-outline" width="40" style={{ color: '#d1d5db' }} />
          <p style={{ margin: '12px 0 4px', fontSize: '14px', color: '#666' }}>Nenhuma resposta de NPS no período</p>
          <p style={{ margin: 0, fontSize: '12px', color: '#999' }}>
            {pendentes > 0
              ? `${pendentes} ${pendentes === 1 ? 'pesquisa enviada' : 'pesquisas enviadas'} aguardando resposta`
              : 'Ative a automação NPS na aba WhatsApp pra começar a coletar avaliações'
            }
          </p>
        </div>
      ) : (
        <>
          {/* Score grande + breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 2fr', gap: '16px', marginBottom: '20px' }}>
            {/* Score card */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              border: '1px solid #e5e7eb',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600', marginBottom: '8px' }}>
                Score NPS
              </div>
              <div style={{ fontSize: '52px', fontWeight: '700', color: corScore, lineHeight: '1' }}>
                {score > 0 ? '+' : ''}{score}
              </div>
              <div style={{ marginTop: '8px', fontSize: '13px', color: corScore, fontWeight: '600' }}>
                {labelScore}
              </div>
            </div>

            {/* Breakdown */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '20px',
              border: '1px solid #e5e7eb',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: '14px'
            }}>
              {[
                { label: 'Promotores (9-10)', count: promotores, color: '#16a34a', bg: '#dcfce7' },
                { label: 'Neutros (7-8)', count: neutros, color: '#f59e0b', bg: '#fef3c7' },
                { label: 'Detratores (0-6)', count: detratores, color: '#dc2626', bg: '#fee2e2' }
              ].map(item => {
                const pct = total > 0 ? (item.count / total) * 100 : 0
                return (
                  <div key={item.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '13px', color: '#344848', fontWeight: '500' }}>{item.label}</span>
                      <span style={{ fontSize: '13px', color: item.color, fontWeight: '600' }}>
                        {item.count} ({Math.round(pct)}%)
                      </span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: item.bg, borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', backgroundColor: item.color, borderRadius: '3px', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Lista de respostas */}
          <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', border: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 14px', fontSize: '15px', fontWeight: '600', color: '#344848' }}>
              Comentários
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '500px', overflowY: 'auto' }}>
              {respostas.map(r => {
                const corNota = r.nota >= 9 ? '#16a34a' : r.nota >= 7 ? '#f59e0b' : '#dc2626'
                const bgNota = r.nota >= 9 ? '#dcfce7' : r.nota >= 7 ? '#fef3c7' : '#fee2e2'
                const data = new Date(r.respondido_em).toLocaleDateString('pt-BR')
                const nomeAluno = r.devedores?.nome || 'Aluno'
                return (
                  <div key={r.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', backgroundColor: '#fafafa' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        backgroundColor: bgNota,
                        color: corNota,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '700',
                        fontSize: '15px',
                        flexShrink: 0
                      }}>
                        {r.nota}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a1a' }}>{nomeAluno}</div>
                        <div style={{ fontSize: '11px', color: '#888' }}>{data}</div>
                      </div>
                    </div>
                    {r.comentario && (
                      <div style={{ fontSize: '13px', color: '#444', lineHeight: '1.5', whiteSpace: 'pre-wrap', paddingLeft: '46px' }}>
                        "{r.comentario}"
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
