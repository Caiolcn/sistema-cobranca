import { useState, useEffect } from 'react'
import { useUser } from './contexts/UserContext'
import { useUserPlan } from './hooks/useUserPlan'
import { supabase } from './supabaseClient'
import useWindowSize from './hooks/useWindowSize'
import { Icon } from '@iconify/react'

const COLUNAS = [
  { id: 'novo', titulo: 'Novo', cor: '#3b82f6', bg: '#eff6ff' },
  { id: 'em_contato', titulo: 'Em contato', cor: '#f59e0b', bg: '#fffbeb' },
  { id: 'experimental', titulo: 'Aula experimental', cor: '#8b5cf6', bg: '#f5f3ff' },
  { id: 'convertido', titulo: 'Convertido', cor: '#10b981', bg: '#ecfdf5' },
  { id: 'perdido', titulo: 'Perdido', cor: '#6b7280', bg: '#f3f4f6' }
]

const ORIGEM_LABEL = {
  manual: 'Manual',
  whatsapp_bot: 'Bot WhatsApp',
  landing_page: 'Landing Page',
  indicacao: 'Indicação'
}

const ORIGEM_ICON = {
  manual: 'mdi:account-plus',
  whatsapp_bot: 'mdi:robot-happy',
  landing_page: 'mdi:web',
  indicacao: 'mdi:account-arrow-right'
}

export default function CRM() {
  const { userId } = useUser()
  const { isLocked } = useUserPlan()
  const { isSmallScreen } = useWindowSize()
  const crmLocked = isLocked('pro')
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [leadEditando, setLeadEditando] = useState(null)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    if (userId) carregarLeads()
  }, [userId])

  const carregarLeads = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    setLeads(data || [])
    setLoading(false)
  }

  const abrirNovo = () => {
    setLeadEditando({ nome: '', telefone: '', email: '', interesse: '', observacoes: '', status: 'novo', origem: 'manual' })
    setModalAberto(true)
  }

  const abrirLead = (lead) => {
    setLeadEditando({ ...lead })
    setModalAberto(true)
  }

  const salvarLead = async () => {
    if (!leadEditando.nome) return alert('Nome é obrigatório')

    if (leadEditando.id) {
      const { id, created_at, updated_at, user_id, ...resto } = leadEditando
      await supabase.from('leads').update(resto).eq('id', id)
    } else {
      await supabase.from('leads').insert({ ...leadEditando, user_id: userId })
    }
    setModalAberto(false)
    carregarLeads()
  }

  const excluirLead = async () => {
    if (!leadEditando.id) return
    if (!window.confirm('Excluir este lead?')) return
    await supabase.from('leads').delete().eq('id', leadEditando.id)
    setModalAberto(false)
    carregarLeads()
  }

  const moverLead = async (leadId, novoStatus) => {
    await supabase.from('leads').update({ status: novoStatus }).eq('id', leadId)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: novoStatus } : l))
  }

  const leadsFiltrados = busca
    ? leads.filter(l =>
        l.nome.toLowerCase().includes(busca.toLowerCase()) ||
        (l.telefone || '').includes(busca)
      )
    : leads

  const leadsPorColuna = (colId) => leadsFiltrados.filter(l => l.status === colId)

  return (
    <div style={{ padding: isSmallScreen ? '16px' : '24px', flex: 1, width: '100%', backgroundColor: '#ffffff', minHeight: '100vh', boxSizing: 'border-box' }}>
      {crmLocked ? (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '60px 40px', textAlign: 'center', border: '1px solid #e5e7eb', maxWidth: '500px', margin: '40px auto' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#fff3e0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
            <Icon icon="mdi:lock" width="32" style={{ color: '#ff9800' }} />
          </div>
          <h2 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: '600', color: '#1a1a1a' }}>CRM de Leads</h2>
          <p style={{ margin: '0 0 24px', fontSize: '15px', color: '#666', lineHeight: '1.6' }}>
            Capture e gerencie leads em um funil visual. Bot do WhatsApp captura visitantes automaticamente.
            Disponível no plano <strong>Pro</strong> ou superior.
          </p>
          <button onClick={() => window.location.href = '/app/configuracao?aba=upgrade'}
            style={{ padding: '12px 32px', backgroundColor: '#ff9800', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
            Fazer Upgrade
          </button>
        </div>
      ) : (
      <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#344848' }}>CRM de Leads</h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#666' }}>
            {leads.length} {leads.length === 1 ? 'lead' : 'leads'} no funil
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Buscar nome ou telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              fontSize: '14px',
              width: isSmallScreen ? '100%' : '240px'
            }}
          />
          <button
            onClick={abrirNovo}
            style={{
              padding: '10px 18px',
              backgroundColor: '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Icon icon="mdi:plus" width="18" />
            Novo lead
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Carregando...</div>
      ) : (
        <div style={{
          display: 'flex',
          gap: '12px',
          overflowX: 'auto',
          paddingBottom: '12px'
        }}>
          {COLUNAS.map(col => {
            const leadsCol = leadsPorColuna(col.id)
            return (
              <div
                key={col.id}
                style={{
                  flex: '1 1 240px',
                  minWidth: '240px',
                  backgroundColor: col.bg,
                  borderRadius: '12px',
                  padding: '12px',
                  minHeight: '400px'
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const leadId = e.dataTransfer.getData('leadId')
                  if (leadId) moverLead(leadId, col.id)
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '0 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: col.cor }} />
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>{col.titulo}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#666', fontWeight: '600' }}>{leadsCol.length}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {leadsCol.map(lead => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('leadId', lead.id)}
                      onClick={() => abrirLead(lead)}
                      style={{
                        backgroundColor: 'white',
                        borderRadius: '10px',
                        padding: '12px',
                        cursor: 'pointer',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                        <Icon icon={ORIGEM_ICON[lead.origem] || 'mdi:account'} width="14" style={{ color: col.cor, flexShrink: 0 }} />
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {lead.nome}
                        </span>
                      </div>
                      {lead.telefone && (
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                          📱 {lead.telefone}
                        </div>
                      )}
                      {lead.interesse && (
                        <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic' }}>
                          {lead.interesse}
                        </div>
                      )}
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '6px' }}>
                        {ORIGEM_LABEL[lead.origem] || lead.origem}
                      </div>
                    </div>
                  ))}
                  {leadsCol.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px 10px', color: '#9ca3af', fontSize: '12px' }}>
                      Vazio
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de edição */}
      {modalAberto && leadEditando && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}
        onClick={() => setModalAberto(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: '600', color: '#1a1a1a' }}>
              {leadEditando.id ? 'Editar lead' : 'Novo lead'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '4px' }}>Nome *</label>
                <input
                  type="text"
                  value={leadEditando.nome || ''}
                  onChange={(e) => setLeadEditando({ ...leadEditando, nome: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '4px' }}>Telefone</label>
                <input
                  type="text"
                  value={leadEditando.telefone || ''}
                  onChange={(e) => setLeadEditando({ ...leadEditando, telefone: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '4px' }}>Email</label>
                <input
                  type="email"
                  value={leadEditando.email || ''}
                  onChange={(e) => setLeadEditando({ ...leadEditando, email: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '4px' }}>Interesse</label>
                <input
                  type="text"
                  value={leadEditando.interesse || ''}
                  onChange={(e) => setLeadEditando({ ...leadEditando, interesse: e.target.value })}
                  placeholder="Ex: Aula experimental, valores..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '4px' }}>Status</label>
                <select
                  value={leadEditando.status || 'novo'}
                  onChange={(e) => setLeadEditando({ ...leadEditando, status: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }}
                >
                  {COLUNAS.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '4px' }}>Observações</label>
                <textarea
                  value={leadEditando.observacoes || ''}
                  onChange={(e) => setLeadEditando({ ...leadEditando, observacoes: e.target.value })}
                  rows={3}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', gap: '8px' }}>
              {leadEditando.id ? (
                <button
                  onClick={excluirLead}
                  style={{ padding: '10px 16px', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
                >
                  Excluir
                </button>
              ) : <div />}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setModalAberto(false)}
                  style={{ padding: '10px 16px', backgroundColor: 'white', color: '#666', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={salvarLead}
                  style={{ padding: '10px 20px', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}
