import { useEffect, useState, useContext } from 'react'
import { useUser } from '../contexts/UserContext'
import { getDailyList, getLeads, updateLead, getStats, createLead } from '../api/outbound'
import { Icon } from '@iconify/react'
import Button from '../design-system/components/Button'
import Card from '../design-system/components/Card'
import { MdCheck, MdContentCopy, MdPhone } from 'react-icons/md'
import { FaInstagram } from 'react-icons/fa'
import './AbaOutbound.css'

const statusLabels = {
  novo: '🆕 Novo',
  abordado: '📱 Abordado',
  respondeu: '✅ Respondeu',
  nao_respondeu: '❌ Sem resposta',
  trial_criado: '🚀 Trial criado',
  fechado: '🎉 Fechado'
}

const statusColors = {
  novo: '#9aa1ab',
  abordado: '#0ea372',
  respondeu: '#22c55e',
  nao_respondeu: '#e54848',
  trial_criado: '#276ce8',
  fechado: '#16a34a'
}

export default function AbaOutbound() {
  const { realUserId: instanceId } = useUser()
  const [tab, setTab] = useState('daily')
  const [dailyLeads, setDailyLeads] = useState([])
  const [allLeads, setAllLeads] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ vertical: '', status: '' })
  const [copiedId, setCopiedId] = useState(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [jsonText, setJsonText] = useState('')

  useEffect(() => {
    if (!instanceId) return
    loadData()
  }, [instanceId])

  async function loadData() {
    setLoading(true)
    try {
      const [daily, all, s] = await Promise.all([
        getDailyList(instanceId),
        getLeads(instanceId, filters),
        getStats(instanceId)
      ])
      setDailyLeads(daily || [])
      setAllLeads(all || [])
      setStats(s)
    } catch (err) {
      console.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleStatusChange(leadId, newStatus) {
    try {
      await updateLead(leadId, { status: newStatus })
      loadData()
    } catch (err) {
      alert(`Erro: ${err.message}`)
    }
  }

  function copyMessage(text) {
    navigator.clipboard.writeText(text)
    setCopiedId(text)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function processarJSON(jsonString) {
    try {
      const dados = JSON.parse(jsonString)

      // Se for um objeto com propriedade "contatos", usa aquela
      // Senão, trata como array direto
      let contatosArray = Array.isArray(dados) ? dados : (dados.contatos || [dados])
      if (!Array.isArray(contatosArray)) {
        contatosArray = [contatosArray]
      }

      setLoading(true)
      for (const contato of contatosArray) {
        await createLead(instanceId, {
          nome: contato.nome,
          vertical: contato.vertical,
          instagram_handle: contato.instagram_handle || '',
          telefone: contato.telefone,
          google_maps_url: contato.google_maps_url,
          mensagem_template: contato.mensagem_template
        })
      }

      loadData()
      setShowImportModal(false)
      setJsonText('')
      alert(`✅ ${contatosArray.length} contatos importados com sucesso!`)
    } catch (err) {
      alert(`❌ Erro ao importar: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function handleImportJSON(event) {
    const file = event.target.files[0]
    if (!file) return

    try {
      const text = await file.text()
      const dados = JSON.parse(text)
      const contatosArray = Array.isArray(dados) ? dados : [dados]

      setLoading(true)
      for (const contato of contatosArray) {
        await createLead(instanceId, {
          nome: contato.nome,
          vertical: contato.vertical,
          instagram_handle: contato.instagram_handle || '',
          telefone: contato.telefone,
          google_maps_url: contato.google_maps_url,
          mensagem_template: contato.mensagem_template
        })
      }

      loadData()
      alert(`✅ ${contatosArray.length} contatos importados com sucesso!`)
    } catch (err) {
      alert(`❌ Erro ao importar: ${err.message}`)
    } finally {
      setLoading(false)
      event.target.value = ''
    }
  }

  return (
    <div className="aba-outbound">
      {/* Tabs */}
      <div className="outbound-tabs">
        <button
          className={tab === 'daily' ? 'active' : ''}
          onClick={() => setTab('daily')}
        >
          📋 Daily List ({dailyLeads.length})
        </button>
        <button
          className={tab === 'crm' ? 'active' : ''}
          onClick={() => setTab('crm')}
        >
          📊 CRM ({allLeads.length})
        </button>
        <button
          className={tab === 'stats' ? 'active' : ''}
          onClick={() => setTab('stats')}
        >
          📈 Métricas
        </button>
      </div>

      {loading && <p className="loading">Carregando...</p>}

      {/* DAILY LIST */}
      {tab === 'daily' && !loading && (
        <div className="daily-list">
          <div className="section-header">
            <div>
              <h3>Contatos para abordar hoje</h3>
              <p>{new Date().toLocaleDateString('pt-BR')}</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <label style={{ cursor: 'pointer' }}>
                <Button variant="primary" icon="mdi:upload" as="span">
                  Importar JSON
                </Button>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportJSON}
                  style={{ display: 'none' }}
                  disabled={loading}
                />
              </label>
              <Button variant="secondary" icon="mdi:content-paste" onClick={() => setShowImportModal(true)}>
                Colar JSON
              </Button>
            </div>
          </div>

          {dailyLeads.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9aa1ab', padding: '60px 20px' }}>
              Nenhum contato para hoje. Execute o cron ou adicione manualmente.
            </div>
          ) : (
            <div className="leads-grid">
              {dailyLeads.map(lead => (
                <div key={lead.id} className="lead-card">
                  <div className="lead-header">
                    <span className="vertical-badge" style={{ background: `${statusColors[lead.vertical] || '#22c55e'}20` }}>
                      {lead.vertical.toUpperCase()}
                    </span>
                  </div>

                  <h4>{lead.nome}</h4>

                  <div className="lead-contacts">
                    {lead.instagram_handle && (
                      <a href={`https://instagram.com/${lead.instagram_handle.replace('@', '')}`} target="_blank" rel="noreferrer">
                        <FaInstagram /> @{lead.instagram_handle}
                      </a>
                    )}
                    {lead.telefone && (
                      <a href={`https://wa.me/55${lead.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                        <MdPhone /> {lead.telefone}
                      </a>
                    )}
                  </div>

                  <div className="lead-message">
                    <p>{lead.mensagem_template}</p>
                    <button
                      className={`copy-btn ${copiedId === lead.mensagem_template ? 'copied' : ''}`}
                      onClick={() => copyMessage(lead.mensagem_template)}
                    >
                      {copiedId === lead.mensagem_template ? (
                        <>
                          <MdCheck /> Copiada!
                        </>
                      ) : (
                        <>
                          <MdContentCopy /> Copiar
                        </>
                      )}
                    </button>
                  </div>

                  <select
                    value={lead.status}
                    onChange={e => handleStatusChange(lead.id, e.target.value)}
                    className="status-select"
                  >
                    <option value="novo">Não abordado</option>
                    <option value="abordado">Abordado</option>
                    <option value="respondeu">Respondeu</option>
                    <option value="nao_respondeu">Não respondeu</option>
                    <option value="trial_criado">Trial criado</option>
                    <option value="fechado">Fechado</option>
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CRM VIEW */}
      {tab === 'crm' && !loading && (
        <div className="crm-view">
          <div className="section-header">
            <h3>Histórico de Contatos</h3>
            <div className="filters">
              <select
                value={filters.vertical}
                onChange={e => setFilters({ ...filters, vertical: e.target.value })}
              >
                <option value="">Todos os nichos</option>
                <option value="pilates">Pilates</option>
                <option value="luta">Luta</option>
                <option value="natacao">Natação</option>
              </select>
              <select
                value={filters.status}
                onChange={e => setFilters({ ...filters, status: e.target.value })}
              >
                <option value="">Todos os status</option>
                <option value="novo">Novo</option>
                <option value="abordado">Abordado</option>
                <option value="respondeu">Respondeu</option>
                <option value="nao_respondeu">Não respondeu</option>
                <option value="trial_criado">Trial criado</option>
                <option value="fechado">Fechado</option>
              </select>
              <Button variant="outline" icon="mdi:refresh" onClick={loadData}>Atualizar</Button>
            </div>
          </div>

          {allLeads.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9aa1ab', padding: '60px 20px' }}>
              Nenhum contato com esses filtros.
            </div>
          ) : (
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Nicho</th>
                  <th>Telefone</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th>Trial</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {allLeads.map(lead => (
                  <tr key={lead.id}>
                    <td>{lead.nome}</td>
                    <td>
                      <span className="badge" style={{ background: statusColors[lead.vertical] + '20' }}>
                        {lead.vertical}
                      </span>
                    </td>
                    <td>{lead.telefone}</td>
                    <td>
                      <span className="status-badge" style={{ background: statusColors[lead.status] + '20', color: statusColors[lead.status] }}>
                        {statusLabels[lead.status]}
                      </span>
                    </td>
                    <td className="date-cell">{new Date(lead.criado_em).toLocaleDateString('pt-BR')}</td>
                    <td>{lead.trial_id ? '✅' : '-'}</td>
                    <td>
                      <select
                        value={lead.status}
                        onChange={e => handleStatusChange(lead.id, e.target.value)}
                        className="inline-select"
                      >
                        <option value="novo">Novo</option>
                        <option value="abordado">Abordado</option>
                        <option value="respondeu">Respondeu</option>
                        <option value="nao_respondeu">Sem resposta</option>
                        <option value="trial_criado">Trial ✓</option>
                        <option value="fechado">Fechado</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* STATS */}
      {tab === 'stats' && !loading && stats && (
        <div className="stats-view">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">Total abordados</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.respondeu}</div>
              <div className="stat-label">Responderam ({(stats.conversao_resposta * 100).toFixed(1)}%)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.trial_criado}</div>
              <div className="stat-label">Trials criados ({(stats.conversao_trial * 100).toFixed(1)}%)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.fechado}</div>
              <div className="stat-label">Fechados ({(stats.conversao_total * 100).toFixed(1)}%)</div>
            </div>
          </div>

          <div className="stats-breakdown">
            <h3>Breakdown por Status</h3>
            <div className="breakdown-grid">
              {Object.entries(statusLabels).map(([key, label]) => (
                <div key={key} className="breakdown-item">
                  <span className="label">{label}</span>
                  <span className="count" style={{ color: statusColors[key] }}>
                    {stats[key] || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL COLAR JSON */}
      {showImportModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <h2>Colar JSON</h2>
            <p style={{ color: '#666', marginBottom: '16px' }}>
              Cole aqui o JSON com os contatos:
            </p>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder='[{"nome": "...", "vertical": "...", ...}]'
              style={{
                width: '100%',
                height: '300px',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                marginBottom: '16px'
              }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => { setShowImportModal(false); setJsonText('') }}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => processarJSON(jsonText)}
                disabled={!jsonText.trim() || loading}
              >
                Importar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
