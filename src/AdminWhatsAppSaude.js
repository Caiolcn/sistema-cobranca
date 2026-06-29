import { useState, useEffect, useMemo } from 'react'
import { useUser } from './contexts/UserContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import useWindowSize from './hooks/useWindowSize'
import { Icon } from '@iconify/react'

const formatarDataHora = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

// Rótulo amigável pro estado bruto do painel Evolution
const labelEstado = (e) => ({
  open: 'Painel: conectado',
  close: 'Painel: desconectado',
  connecting: 'Painel: conectando',
  timeout: 'Painel: timeout',
  inexistente: 'Sem instância',
  erro: 'Erro ao ler painel',
}[e] || e || '—')

export default function AdminWhatsAppSaude() {
  const { isAdmin, loading: userLoading } = useUser()
  const navigate = useNavigate()
  const { isMobile } = useWindowSize()

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [linhas, setLinhas] = useState([])

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
      const { data, error } = await supabase.rpc('admin_whatsapp_saude')
      if (error) throw error
      setLinhas(data || [])
    } catch (err) {
      console.error('Erro ao carregar saúde do WhatsApp:', err)
      setErro(err.message || 'Falha ao carregar')
    } finally {
      setLoading(false)
    }
  }

  const totais = useMemo(() => {
    const total = linhas.length
    const saudaveis = linhas.filter(l => l.saudavel).length
    const deslogados = linhas.filter(l => l.acao === 'logout').length
    // "Falso positivo" = painel dizia open mas a sonda achou morto
    const falsosPositivos = linhas.filter(l => l.estado_painel === 'open' && !l.saudavel).length
    return { total, saudaveis, deslogados, falsosPositivos }
  }, [linhas])

  const ultimaExecucao = linhas[0]?.checado_em

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
            Saúde do WhatsApp
          </h1>
          <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
            Teste profundo diário de conexão (clientes pagos). Detecta socket morto que o painel da Evolution mostra como "conectado" e desloga automaticamente pra liberar o QR Code.
            {ultimaExecucao && <> · Última verificação: <strong>{formatarDataHora(ultimaExecucao)}</strong></>}
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

      {/* KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: isMobile ? '10px' : '14px', marginBottom: '24px'
      }}>
        {[
          { label: 'Clientes pagos verificados', valor: totais.total, icon: 'mdi:account-group', cor: '#667eea', bg: '#f0f4ff' },
          { label: 'Realmente conectados', valor: totais.saudaveis, icon: 'mdi:check-circle', cor: '#16a34a', bg: '#f0fdf4' },
          { label: 'Painel mentia (socket morto)', valor: totais.falsosPositivos, icon: 'mdi:alert', cor: '#dc2626', bg: '#fef2f2' },
          { label: 'Deslogados (QR liberado)', valor: totais.deslogados, icon: 'mdi:logout-variant', cor: '#d97706', bg: '#fffbeb' },
        ].map(c => (
          <div key={c.label} style={{ padding: isMobile ? '14px' : '18px', borderLeft: `3px solid ${c.cor}`, backgroundColor: c.bg, borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Icon icon={c.icon} width="20" style={{ color: c.cor }} />
              <span style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>{c.label}</span>
            </div>
            <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 'bold', color: '#333' }}>{c.valor}</div>
          </div>
        ))}
      </div>

      {/* Tabela de clientes */}
      <div style={{ backgroundColor: 'white', padding: isMobile ? '16px' : '20px', borderRadius: '12px', border: '1px solid #e0e0e0' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#333', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon="mdi:whatsapp" width="20" style={{ color: '#25D366' }} />
          Status por cliente <span style={{ color: '#999', fontWeight: 400 }}>(não-saudáveis primeiro)</span>
        </h3>

        {loading ? (
          <p style={{ color: '#999', fontSize: '13px', margin: 0 }}>Carregando...</p>
        ) : linhas.length === 0 ? (
          <p style={{ color: '#999', fontSize: '13px', margin: 0 }}>
            Nenhuma verificação registrada ainda. O cron roda às 06:00 (BRT) — ou rode manualmente via SQL (ver sql-criar-whatsapp-health-check.sql).
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#666', borderBottom: '1px solid #eee' }}>
                  <th style={{ padding: '8px' }}>Cliente</th>
                  <th style={{ padding: '8px' }}>Plano</th>
                  <th style={{ padding: '8px' }}>Resultado real</th>
                  <th style={{ padding: '8px' }}>Painel reportou</th>
                  <th style={{ padding: '8px' }}>Ação</th>
                  <th style={{ padding: '8px' }}>Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={l.user_id || i} style={{ borderBottom: '1px solid #f5f5f5', backgroundColor: l.saudavel ? 'transparent' : '#fffafa' }}>
                    <td style={{ padding: '8px', fontWeight: 500, color: '#333' }}>{l.nome_empresa || '—'}</td>
                    <td style={{ padding: '8px', color: '#666' }}>{l.plano || '—'}</td>
                    <td style={{ padding: '8px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                        backgroundColor: l.saudavel ? '#e8f5e9' : '#ffebee',
                        color: l.saudavel ? '#2e7d32' : '#c62828'
                      }}>
                        {l.saudavel ? '✓ Conectado de verdade' : '✗ Não conectado'}
                      </span>
                    </td>
                    <td style={{ padding: '8px', color: l.estado_painel === 'open' && !l.saudavel ? '#dc2626' : '#666' }}>
                      {labelEstado(l.estado_painel)}
                      {l.estado_painel === 'open' && !l.saudavel && (
                        <span title="O painel dizia conectado, mas a sonda provou que o socket estava morto" style={{ marginLeft: 4 }}>⚠️</span>
                      )}
                    </td>
                    <td style={{ padding: '8px' }}>
                      {l.acao === 'logout' ? (
                        <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, backgroundColor: '#fff8e1', color: '#a16207' }}>
                          Deslogado
                        </span>
                      ) : l.acao === 'logout_falhou' ? (
                        <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, backgroundColor: '#fef2f2', color: '#c62828' }}>
                          Logout falhou
                        </span>
                      ) : (
                        <span style={{ color: '#bbb' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '8px', color: '#999', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.erro || ''}>
                      {l.erro || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
