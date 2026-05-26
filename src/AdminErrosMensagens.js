import { Fragment, useState, useEffect, useMemo } from 'react'
import { useUser } from './contexts/UserContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import useWindowSize from './hooks/useWindowSize'
import { Icon } from '@iconify/react'

const PERIODOS = {
  hoje: { label: 'Hoje', dias: 0 },
  d7: { label: '7 dias', dias: 7 },
  d30: { label: '30 dias', dias: 30 },
  d90: { label: '90 dias', dias: 90 }
}

export default function AdminErrosMensagens() {
  const { isAdmin, loading: userLoading } = useUser()
  const navigate = useNavigate()
  const { isMobile } = useWindowSize()

  const [loading, setLoading] = useState(true)
  const [logs, setLogs] = useState([])
  const [usuariosMap, setUsuariosMap] = useState({})
  const [devedoresMap, setDevedoresMap] = useState({})

  const [periodo, setPeriodo] = useState('d7')
  const [filtroCliente, setFiltroCliente] = useState('todos')
  const [filtroErroCodigo, setFiltroErroCodigo] = useState('todos')
  const [busca, setBusca] = useState('')
  const [expandido, setExpandido] = useState(new Set())

  useEffect(() => {
    if (!userLoading && !isAdmin) navigate('/app/home')
  }, [isAdmin, userLoading, navigate])

  useEffect(() => {
    if (isAdmin) carregarDados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, periodo])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const dias = PERIODOS[periodo].dias
      const desde = new Date()
      if (dias === 0) {
        desde.setHours(0, 0, 0, 0)
      } else {
        desde.setDate(desde.getDate() - dias)
      }

      const { data: logsData, error: logsError } = await supabase
        .from('logs_mensagens')
        .select('id, user_id, devedor_id, mensalidade_id, telefone, mensagem, status, erro, erro_codigo, http_status, response_api, tipo, enviado_em, valor_mensalidade, data_vencimento, dias_atraso')
        .eq('status', 'falha')
        .gte('enviado_em', desde.toISOString())
        .order('enviado_em', { ascending: false })
        .limit(2000)

      if (logsError) throw logsError

      const logsArr = logsData || []
      setLogs(logsArr)

      const userIds = [...new Set(logsArr.map(l => l.user_id).filter(Boolean))]
      const devedorIds = [...new Set(logsArr.map(l => l.devedor_id).filter(Boolean))]

      const [{ data: usuarios }, { data: devedores }] = await Promise.all([
        userIds.length
          ? supabase.from('usuarios').select('id, nome_empresa, nome_completo, email').in('id', userIds)
          : Promise.resolve({ data: [] }),
        devedorIds.length
          ? supabase.from('devedores').select('id, nome, telefone, responsavel_nome').in('id', devedorIds)
          : Promise.resolve({ data: [] })
      ])

      const uMap = {}
      ;(usuarios || []).forEach(u => { uMap[u.id] = u })
      setUsuariosMap(uMap)

      const dMap = {}
      ;(devedores || []).forEach(d => { dMap[d.id] = d })
      setDevedoresMap(dMap)
    } catch (err) {
      console.error('Erro ao carregar logs:', err)
    } finally {
      setLoading(false)
    }
  }

  const codigosErro = useMemo(() => {
    const counts = {}
    logs.forEach(l => {
      const cod = l.erro_codigo || 'sem_codigo'
      counts[cod] = (counts[cod] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [logs])

  const clientesUnicos = useMemo(() => {
    const ids = [...new Set(logs.map(l => l.user_id))]
    return ids
      .map(id => ({
        user_id: id,
        nome: usuariosMap[id]?.nome_empresa || usuariosMap[id]?.email || `(${id.slice(0, 8)}...)`,
        falhas: logs.filter(l => l.user_id === id).length
      }))
      .sort((a, b) => b.falhas - a.falhas)
  }, [logs, usuariosMap])

  const logsFiltrados = useMemo(() => {
    return logs.filter(l => {
      if (filtroCliente !== 'todos' && l.user_id !== filtroCliente) return false
      if (filtroErroCodigo !== 'todos') {
        const cod = l.erro_codigo || 'sem_codigo'
        if (cod !== filtroErroCodigo) return false
      }
      if (busca) {
        const q = busca.toLowerCase()
        const dev = devedoresMap[l.devedor_id]
        const usr = usuariosMap[l.user_id]
        const hay = [
          l.telefone,
          l.erro,
          l.erro_codigo,
          dev?.nome,
          dev?.responsavel_nome,
          usr?.nome_empresa,
          usr?.email
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [logs, filtroCliente, filtroErroCodigo, busca, devedoresMap, usuariosMap])

  const stats = useMemo(() => {
    const total = logsFiltrados.length
    const clientesAfetados = new Set(logsFiltrados.map(l => l.user_id)).size
    const devedoresAfetados = new Set(logsFiltrados.map(l => l.devedor_id).filter(Boolean)).size
    return { total, clientesAfetados, devedoresAfetados }
  }, [logsFiltrados])

  const toggleExpandir = (id) => {
    setExpandido(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const formatarData = (iso) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  }

  const exportarCSV = () => {
    const headers = ['Data/hora', 'Cliente', 'User ID', 'Aluno', 'Telefone', 'Tipo', 'Código erro', 'HTTP', 'Erro']
    const rows = logsFiltrados.map(l => {
      const usr = usuariosMap[l.user_id] || {}
      const dev = devedoresMap[l.devedor_id] || {}
      return [
        formatarData(l.enviado_em),
        usr.nome_empresa || usr.email || '',
        l.user_id || '',
        dev.nome || '',
        l.telefone || '',
        l.tipo || '',
        l.erro_codigo || '',
        l.http_status || '',
        (l.erro || '').replace(/[\r\n]+/g, ' ').slice(0, 500)
      ]
    })
    const csv = [headers, ...rows]
      .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `erros-mensagens-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

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
            Erros de Envio
          </h1>
          <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
            Falhas detalhadas em disparos de WhatsApp por todos os clientes
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={exportarCSV}
            disabled={loading || logsFiltrados.length === 0}
            style={{
              padding: '10px 16px', borderRadius: '8px', border: '1px solid #e0e0e0',
              backgroundColor: 'white', color: '#333', fontSize: '13px',
              cursor: logsFiltrados.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
              opacity: logsFiltrados.length === 0 ? 0.5 : 1
            }}
          >
            <Icon icon="mdi:download" width="16" /> Exportar CSV
          </button>
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
      </div>

      {/* Cards de resumo */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <Card cor="#f44336" bg="#ffebee" icon="mdi:alert-circle" label="Falhas no período" valor={stats.total} />
        <Card cor="#7c3aed" bg="#f3eafd" icon="mdi:account-multiple" label="Clientes afetados" valor={stats.clientesAfetados} />
        <Card cor="#0891b2" bg="#e0f7fa" icon="mdi:account" label="Alunos afetados" valor={stats.devedoresAfetados} />
        <Card cor="#f97316" bg="#fff3e0" icon="mdi:code-tags" label="Códigos distintos" valor={codigosErro.length} />
      </div>

      {/* Resumo por código de erro */}
      {codigosErro.length > 0 && (
        <div style={{
          backgroundColor: 'white', padding: '16px',
          borderRadius: '12px', border: '1px solid #e0e0e0', marginBottom: '20px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#333', marginBottom: '10px' }}>
            Falhas por código de erro
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {codigosErro.map(([cod, qtd]) => (
              <button
                key={cod}
                onClick={() => setFiltroErroCodigo(filtroErroCodigo === cod ? 'todos' : cod)}
                style={{
                  padding: '6px 12px', borderRadius: '20px',
                  border: filtroErroCodigo === cod ? '2px solid #f44336' : '1px solid #e0e0e0',
                  backgroundColor: filtroErroCodigo === cod ? '#ffebee' : 'white',
                  fontSize: '12px', cursor: 'pointer', color: '#333'
                }}
              >
                <span style={{ fontFamily: 'monospace', color: '#7c3aed' }}>{cod}</span>
                <span style={{ marginLeft: '6px', color: '#666' }}>({qtd})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{
        backgroundColor: 'white', padding: '16px',
        borderRadius: '12px', border: '1px solid #e0e0e0', marginBottom: '20px',
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'auto 1fr auto', gap: '12px', alignItems: 'center'
      }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {Object.entries(PERIODOS).map(([key, p]) => (
            <button
              key={key}
              onClick={() => setPeriodo(key)}
              style={{
                padding: '6px 12px', borderRadius: '6px',
                border: periodo === key ? '2px solid #667eea' : '1px solid #e0e0e0',
                backgroundColor: periodo === key ? '#f0f4ff' : 'white',
                fontSize: '12px', cursor: 'pointer', color: '#333'
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Buscar por aluno, cliente, telefone, erro..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: '1px solid #e0e0e0',
            fontSize: '13px', width: '100%', boxSizing: 'border-box'
          }}
        />

        <select
          value={filtroCliente}
          onChange={(e) => setFiltroCliente(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: '8px', border: '1px solid #e0e0e0',
            fontSize: '13px', cursor: 'pointer', minWidth: '200px', backgroundColor: 'white'
          }}
        >
          <option value="todos">Todos clientes ({clientesUnicos.length})</option>
          {clientesUnicos.map(c => (
            <option key={c.user_id} value={c.user_id}>
              {c.nome} — {c.falhas} falha{c.falhas > 1 ? 's' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Tabela */}
      <div style={{
        backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e0e0e0',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            Carregando...
          </div>
        ) : logsFiltrados.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            <Icon icon="mdi:check-circle" width="32" style={{ color: '#4CAF50', marginBottom: '8px' }} />
            <div>Nenhuma falha no período/filtro selecionado.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ backgroundColor: '#fafafa', borderBottom: '2px solid #e0e0e0' }}>
                  <th style={thStyle}></th>
                  <th style={thStyle}>Data/hora</th>
                  <th style={thStyle}>Cliente</th>
                  <th style={thStyle}>Aluno</th>
                  <th style={thStyle}>Telefone</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Código</th>
                  <th style={thStyle}>HTTP</th>
                  <th style={thStyle}>Erro</th>
                </tr>
              </thead>
              <tbody>
                {logsFiltrados.map(l => {
                  const usr = usuariosMap[l.user_id] || {}
                  const dev = devedoresMap[l.devedor_id] || {}
                  const isExp = expandido.has(l.id)
                  return (
                    <Fragment key={l.id}>
                      <tr
                        style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}
                        onClick={() => toggleExpandir(l.id)}
                      >
                        <td style={tdStyle}>
                          <Icon icon={isExp ? 'mdi:chevron-down' : 'mdi:chevron-right'} width="16" />
                        </td>
                        <td style={tdStyle}>{formatarData(l.enviado_em)}</td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: '500' }}>{usr.nome_empresa || '-'}</div>
                          <div style={{ fontSize: '11px', color: '#888' }}>{usr.email || l.user_id?.slice(0, 8)}</div>
                        </td>
                        <td style={tdStyle}>{dev.nome || '-'}</td>
                        <td style={tdStyle}><code style={{ fontSize: '12px' }}>{l.telefone || '-'}</code></td>
                        <td style={tdStyle}>{l.tipo || '-'}</td>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
                            backgroundColor: '#f3eafd', color: '#7c3aed', fontFamily: 'monospace', fontSize: '11px'
                          }}>
                            {l.erro_codigo || 'sem_codigo'}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          {l.http_status ? (
                            <span style={{
                              display: 'inline-block', padding: '2px 6px', borderRadius: '4px',
                              backgroundColor: l.http_status >= 500 ? '#ffebee' : '#fff3e0',
                              color: l.http_status >= 500 ? '#c62828' : '#e65100',
                              fontSize: '11px', fontWeight: '600'
                            }}>
                              {l.http_status}
                            </span>
                          ) : '-'}
                        </td>
                        <td style={{ ...tdStyle, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.erro || ''}>
                          {l.erro || '-'}
                        </td>
                      </tr>
                      {isExp && (
                        <tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #e0e0e0' }}>
                          <td colSpan="9" style={{ padding: '16px 20px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                              <div>
                                <div style={{ fontSize: '11px', fontWeight: '600', color: '#666', marginBottom: '4px', textTransform: 'uppercase' }}>Mensagem tentada</div>
                                <pre style={preStyle}>{l.mensagem || '(sem conteúdo)'}</pre>

                                <div style={{ fontSize: '11px', fontWeight: '600', color: '#666', marginTop: '12px', marginBottom: '4px', textTransform: 'uppercase' }}>Dados da cobrança</div>
                                <div style={{ fontSize: '12px', color: '#444', lineHeight: 1.6 }}>
                                  <div><b>User ID:</b> <code>{l.user_id}</code></div>
                                  <div><b>Devedor ID:</b> <code>{l.devedor_id || '-'}</code></div>
                                  <div><b>Mensalidade ID:</b> <code>{l.mensalidade_id || '-'}</code></div>
                                  <div><b>Valor:</b> {l.valor_mensalidade ? `R$ ${parseFloat(l.valor_mensalidade).toFixed(2)}` : '-'}</div>
                                  <div><b>Vencimento:</b> {l.data_vencimento || '-'}</div>
                                  <div><b>Dias atraso:</b> {l.dias_atraso ?? '-'}</div>
                                  {dev.responsavel_nome && <div><b>Responsável:</b> {dev.responsavel_nome}</div>}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: '11px', fontWeight: '600', color: '#666', marginBottom: '4px', textTransform: 'uppercase' }}>response_api (resposta crua da Evolution)</div>
                                <pre style={preStyle}>
                                  {l.response_api ? JSON.stringify(l.response_api, null, 2) : '(não capturada — log antigo)'}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: '12px', fontSize: '12px', color: '#888', textAlign: 'right' }}>
        Mostrando {logsFiltrados.length} de {logs.length} falhas no período
      </div>
    </div>
  )
}

const thStyle = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: '600',
  color: '#666',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap'
}

const tdStyle = {
  padding: '10px 12px',
  color: '#333',
  verticalAlign: 'top'
}

const preStyle = {
  backgroundColor: 'white',
  padding: '10px',
  borderRadius: '6px',
  border: '1px solid #e0e0e0',
  fontSize: '11px',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: '320px',
  overflowY: 'auto',
  margin: 0,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
}

function Card({ cor, bg, icon, label, valor }) {
  return (
    <div style={{
      padding: '16px',
      borderLeft: `3px solid ${cor}`,
      backgroundColor: bg,
      borderRadius: '10px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <Icon icon={icon} width="18" style={{ color: cor }} />
        <span style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>{label}</span>
      </div>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>
        {valor}
      </div>
    </div>
  )
}
