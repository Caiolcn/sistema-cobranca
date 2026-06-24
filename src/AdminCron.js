import { useState, useEffect, useMemo } from 'react'
import { useUser } from './contexts/UserContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import useWindowSize from './hooks/useWindowSize'
import { Icon } from '@iconify/react'

// Converte um schedule cron simples ("m h * * *", em UTC) para um rótulo amigável em BRT.
// O pg_cron roda em UTC; BRT = UTC-3.
const scheduleParaLabel = (schedule) => {
  if (!schedule) return '—'
  const partes = schedule.trim().split(/\s+/)
  if (partes.length !== 5) return schedule
  const [m, h, dom, mon, dow] = partes
  if (dom === '*' && mon === '*' && dow === '*' && /^\d+$/.test(h) && /^\d+$/.test(m)) {
    const hBrt = ((parseInt(h, 10) - 3) % 24 + 24) % 24
    return `Todo dia às ${String(hBrt).padStart(2, '0')}:${m.padStart(2, '0')} (BRT)`
  }
  return schedule
}

const formatarDataHora = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

const formatarData = (iso) => {
  if (!iso) return '—'
  // datas YYYY-MM-DD sem timezone — evitar shift de fuso
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

export default function AdminCron() {
  const { isAdmin, loading: userLoading } = useUser()
  const navigate = useNavigate()
  const { isMobile } = useWindowSize()

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [status, setStatus] = useState(null) // { job, runs: [] }
  const [linhas, setLinhas] = useState([])   // mensalidades geradas (1 por linha)

  useEffect(() => {
    if (!userLoading && !isAdmin) navigate('/app/home')
  }, [isAdmin, userLoading, navigate])

  useEffect(() => {
    if (isAdmin) carregarDados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  const carregarDados = async () => {
    setLoading(true)
    setErro(null)
    try {
      const [statusRes, geracaoRes] = await Promise.all([
        supabase.rpc('admin_cron_status'),
        supabase.rpc('admin_cron_geracao', { p_limit: 500 })
      ])
      if (statusRes.error) throw statusRes.error
      if (geracaoRes.error) throw geracaoRes.error
      setStatus(statusRes.data || null)
      setLinhas(geracaoRes.data || [])
    } catch (err) {
      console.error('Erro ao carregar CRON:', err)
      setErro(err.message || 'Falha ao carregar')
    } finally {
      setLoading(false)
    }
  }

  // Agrupa as mensalidades geradas por execução (log_id)
  const execucoes = useMemo(() => {
    const map = new Map()
    for (const l of linhas) {
      if (!map.has(l.log_id)) {
        map.set(l.log_id, {
          log_id: l.log_id,
          executado_em: l.executado_em,
          origem: l.origem,
          quantidade: l.quantidade,
          mensalidades: []
        })
      }
      if (l.mensalidade_id) {
        map.get(l.log_id).mensalidades.push(l)
      }
    }
    return Array.from(map.values())
  }, [linhas])

  const totais = useMemo(() => {
    const totalGeradas = linhas.filter(l => l.mensalidade_id).length
    const soma = linhas
      .filter(l => l.mensalidade_id)
      .reduce((s, l) => s + Number(l.valor || 0), 0)
    return { totalGeradas, soma, execucoes: execucoes.length }
  }, [linhas, execucoes])

  const job = status?.job
  const runs = status?.runs || []
  const ultimaRun = runs[0]

  if (userLoading) return null
  if (!isAdmin) return null

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1800px', margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <button
            onClick={() => navigate('/app/admin')}
            style={{
              background: 'transparent', border: 'none', color: '#667eea',
              cursor: 'pointer', fontSize: '13px', padding: '0 0 6px 0',
              display: 'flex', alignItems: 'center', gap: '4px'
            }}
          >
            <Icon icon="mdi:arrow-left" width="16" /> Voltar ao /admin
          </button>
          <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 'bold', color: '#333', margin: '0 0 6px 0' }}>
            CRON — Geração de Mensalidades
          </h1>
          <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
            Gera automaticamente a próxima mensalidade de assinantes ativos (plano recorrente) sem cobrança em aberto
          </p>
        </div>
        <button
          onClick={carregarDados}
          disabled={loading}
          style={{
            padding: '10px 20px', borderRadius: '8px', border: 'none',
            backgroundColor: '#667eea', color: 'white', fontWeight: '500',
            cursor: loading ? 'not-allowed' : 'pointer', fontSize: '14px',
            display: 'flex', alignItems: 'center', gap: '8px',
            opacity: loading ? 0.6 : 1
          }}
        >
          <Icon icon="mdi:refresh" width="18" />
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {erro && (
        <div style={{ padding: '14px 16px', borderRadius: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#c62828', marginBottom: '20px', fontSize: '14px' }}>
          {erro}
        </div>
      )}

      {/* Card de status do agendamento */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: isMobile ? '10px' : '14px', marginBottom: '24px'
      }}>
        {[
          {
            label: 'Agendamento',
            valor: scheduleParaLabel(job?.schedule),
            icon: 'mdi:clock-outline', cor: '#667eea', bg: '#f0f4ff', pequeno: true
          },
          {
            label: 'Situação',
            valor: job ? (job.active ? 'Ativo' : 'Pausado') : 'Não agendado',
            icon: job?.active ? 'mdi:check-circle' : 'mdi:pause-circle',
            cor: job?.active ? '#16a34a' : '#f59e0b',
            bg: job?.active ? '#f0fdf4' : '#fffbeb'
          },
          {
            label: 'Última execução',
            valor: ultimaRun ? formatarDataHora(ultimaRun.start_time) : '—',
            icon: 'mdi:history', cor: '#2196F3', bg: '#e3f2fd', pequeno: true
          },
          {
            label: 'Total geradas',
            valor: totais.totalGeradas,
            icon: 'mdi:file-document-multiple', cor: '#7c3aed', bg: '#f5f3ff'
          }
        ].map(c => (
          <div key={c.label} style={{ padding: isMobile ? '14px' : '18px', borderLeft: `3px solid ${c.cor}`, backgroundColor: c.bg, borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Icon icon={c.icon} width="20" style={{ color: c.cor }} />
              <span style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>{c.label}</span>
            </div>
            <div style={{ fontSize: c.pequeno ? (isMobile ? '14px' : '16px') : (isMobile ? '22px' : '28px'), fontWeight: 'bold', color: '#333' }}>
              {c.valor}
            </div>
          </div>
        ))}
      </div>

      {/* Histórico de execuções do pg_cron */}
      <div style={{ backgroundColor: 'white', padding: isMobile ? '16px' : '20px', borderRadius: '12px', border: '1px solid #e0e0e0', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#333', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon="mdi:history" width="20" style={{ color: '#2196F3' }} />
          Histórico de execuções <span style={{ color: '#999', fontWeight: 400 }}>(últimas 30)</span>
        </h3>
        {runs.length === 0 ? (
          <p style={{ color: '#999', fontSize: '13px', margin: 0 }}>Nenhuma execução registrada ainda.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#666', borderBottom: '1px solid #eee' }}>
                  <th style={{ padding: '8px' }}>Início</th>
                  <th style={{ padding: '8px' }}>Status</th>
                  <th style={{ padding: '8px' }}>Retorno</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{formatarDataHora(r.start_time)}</td>
                    <td style={{ padding: '8px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                        backgroundColor: r.status === 'succeeded' ? '#e8f5e9' : '#ffebee',
                        color: r.status === 'succeeded' ? '#2e7d32' : '#c62828'
                      }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px', color: '#666', maxWidth: '480px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.return_message || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mensalidades geradas, agrupadas por execução */}
      <div style={{ backgroundColor: 'white', padding: isMobile ? '16px' : '20px', borderRadius: '12px', border: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 14px 0', flexWrap: 'wrap', gap: '8px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#333', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon icon="mdi:file-document-multiple" width="20" style={{ color: '#7c3aed' }} />
            Mensalidades geradas pelo CRON
          </h3>
          <span style={{ fontSize: '13px', color: '#666', fontWeight: 500 }}>
            {totais.totalGeradas} mensalidade{totais.totalGeradas !== 1 ? 's' : ''} · R$ {totais.soma.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {execucoes.length === 0 ? (
          <p style={{ color: '#999', fontSize: '13px', margin: 0 }}>Nenhuma mensalidade gerada ainda.</p>
        ) : (
          execucoes.map(ex => (
            <div key={ex.log_id} style={{ marginBottom: '18px', border: '1px solid #eee', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', backgroundColor: '#fafafa', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#333' }}>{formatarDataHora(ex.executado_em)}</span>
                  <span style={{
                    padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                    backgroundColor: ex.origem === 'cron' ? '#e3f2fd' : '#fff3e0',
                    color: ex.origem === 'cron' ? '#1565c0' : '#e65100'
                  }}>
                    {ex.origem}
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: '#666' }}>
                  {ex.quantidade} criada{ex.quantidade !== 1 ? 's' : ''}
                </span>
              </div>
              {ex.mensalidades.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: '#666', borderBottom: '1px solid #eee' }}>
                        <th style={{ padding: '8px 14px' }}>Conta</th>
                        <th style={{ padding: '8px' }}>Aluno</th>
                        <th style={{ padding: '8px' }}>Vencimento</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Valor</th>
                        <th style={{ padding: '8px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ex.mensalidades.map(m => (
                        <tr key={m.mensalidade_id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                          <td style={{ padding: '8px 14px' }}>{m.conta || '—'}</td>
                          <td style={{ padding: '8px' }}>{m.aluno || '—'}</td>
                          <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{formatarData(m.data_vencimento)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            R$ {Number(m.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '8px' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                              backgroundColor: m.status === 'pago' ? '#e8f5e9' : '#fff8e1',
                              color: m.status === 'pago' ? '#2e7d32' : '#a16207'
                            }}>
                              {m.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
