import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUser } from './contexts/UserContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import useWindowSize from './hooks/useWindowSize'
import { Icon } from '@iconify/react'
import Button from './design-system/components/Button'
import Modal from './design-system/components/Modal'
import Input from './design-system/components/Input'
import SearchInput from './design-system/components/SearchInput'
import EmptyState from './design-system/components/EmptyState'

// CRM de leads de campanha — quem manda mensagem pro WhatsApp comercial do
// Mensalli vira um card aqui (captura no edge function `whatsapp-bot`).
// "Criou conta" e "Pagante" são promovidas sozinhas por sync_mensalli_leads(),
// cruzando o telefone com a tabela usuarios; o arrasto manual sempre pode
// sobrescrever.

const COLUNAS = [
  { id: 'novo',        titulo: 'Novo',        cor: '#3b82f6', bg: '#eff6ff', hint: 'Mandou mensagem, sem resposta ainda' },
  { id: 'conversando', titulo: 'Conversando', cor: '#8b5cf6', bg: '#f5f3ff', hint: 'Papo em andamento' },
  { id: 'aguardando',  titulo: 'Aguardando',  cor: '#f59e0b', bg: '#fffbeb', hint: 'Disse que ia pensar/esperar' },
  { id: 'criou_conta', titulo: 'Criou conta', cor: '#06b6d4', bg: '#ecfeff', hint: 'Está no trial', auto: true },
  { id: 'pagante',     titulo: 'Pagante',     cor: '#16a34a', bg: '#f0fdf4', hint: 'Virou cliente', auto: true },
  { id: 'perdido',     titulo: 'Perdido',     cor: '#94a3b8', bg: '#f8fafc', hint: 'Sumiu ou disse não' }
]

const formatarTelefone = (tel) => {
  const d = String(tel || '').replace(/\D/g, '')
  const local = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return tel || '—'
}

const tempoDesde = (iso) => {
  if (!iso) return '—'
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

const formatarDataHora = (iso) => iso
  ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '—'

export default function AdminLeads() {
  const { isAdmin, loading: userLoading } = useUser()
  const navigate = useNavigate()
  const { isMobile } = useWindowSize()

  const [loading, setLoading] = useState(true)
  const [leads, setLeads] = useState([])
  const [busca, setBusca] = useState('')
  const [sincronizando, setSincronizando] = useState(false)

  // Painel do lead
  const [leadAberto, setLeadAberto] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [carregandoMsgs, setCarregandoMsgs] = useState(false)
  const [nome, setNome] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [retornarEm, setRetornarEm] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!userLoading && !isAdmin) navigate('/app/home')
  }, [isAdmin, userLoading, navigate])

  const carregar = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return }
    try {
      // Antes de listar, promove quem criou conta / virou pagante desde a última visita.
      await supabase.rpc('sync_mensalli_leads')
      const { data, error } = await supabase
        .from('vw_mensalli_leads')
        .select('*')
        .order('ultima_interacao', { ascending: false })
      if (error) throw error
      setLeads(data || [])
    } catch (err) {
      console.error('Erro ao carregar leads:', err)
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => { carregar() }, [carregar])

  const sincronizar = async () => {
    setSincronizando(true)
    await carregar()
    setSincronizando(false)
  }

  const moverLead = async (leadId, novoStatus) => {
    const anterior = leads.find(l => l.id === leadId)
    if (!anterior || anterior.status === novoStatus) return

    // Otimista: o board reage na hora, o banco confirma depois.
    setLeads(ls => ls.map(l => (l.id === leadId ? { ...l, status: novoStatus } : l)))
    const { error } = await supabase
      .from('mensalli_leads')
      .update({ status: novoStatus, updated_at: new Date().toISOString() })
      .eq('id', leadId)
    if (error) {
      alert('Não consegui mover o lead: ' + error.message)
      setLeads(ls => ls.map(l => (l.id === leadId ? { ...l, status: anterior.status } : l)))
    }
  }

  const abrirLead = async (lead) => {
    setLeadAberto(lead)
    setNome(lead.nome || '')
    setObservacoes(lead.observacoes || '')
    setRetornarEm(lead.retornar_em || '')
    setCarregandoMsgs(true)
    setMensagens([])
    const { data } = await supabase
      .from('mensalli_lead_mensagens')
      .select('*')
      .eq('lead_id', lead.id)
      .order('enviado_em', { ascending: true })
    setMensagens(data || [])
    setCarregandoMsgs(false)
  }

  const salvarAnotacoes = async () => {
    if (!leadAberto) return
    setSalvando(true)
    const patch = {
      // Nome digitado aqui não corre risco: o whatsapp-bot só preenche o nome
      // quando ele está vazio, nunca sobrescreve.
      nome: nome.trim() || null,
      observacoes: observacoes || null,
      retornar_em: retornarEm || null,
      updated_at: new Date().toISOString()
    }
    const { error } = await supabase.from('mensalli_leads').update(patch).eq('id', leadAberto.id)
    setSalvando(false)
    if (error) { alert('Erro ao salvar: ' + error.message); return }
    setLeads(ls => ls.map(l => (l.id === leadAberto.id ? { ...l, ...patch } : l)))
    setLeadAberto(l => ({ ...l, ...patch }))
  }

  // O número do Mensalli também é usado pessoalmente — amigo, fornecedor e
  // família caem no mesmo webhook. "Não é lead" tira do board e faz o
  // whatsapp-bot parar de gravar as conversas desse contato.
  const ignorarLead = async () => {
    if (!leadAberto) return
    if (!window.confirm(`Tirar "${leadAberto.nome || 'este contato'}" do CRM? As conversas dele param de ser registradas aqui (o WhatsApp continua normal).`)) return
    setSalvando(true)
    const { error } = await supabase
      .from('mensalli_leads')
      .update({ ignorado: true, updated_at: new Date().toISOString() })
      .eq('id', leadAberto.id)
    setSalvando(false)
    if (error) { alert('Erro: ' + error.message); return }
    setLeads(ls => ls.filter(l => l.id !== leadAberto.id))
    setLeadAberto(null)
  }

  const leadsFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return leads
    const digitos = termo.replace(/\D/g, '')
    return leads.filter(l =>
      (l.nome || '').toLowerCase().includes(termo) ||
      (l.usuario_nome || '').toLowerCase().includes(termo) ||
      (digitos && String(l.telefone || '').includes(digitos))
    )
  }, [leads, busca])

  const porColuna = useMemo(() => {
    const mapa = {}
    COLUNAS.forEach(c => { mapa[c.id] = [] })
    leadsFiltrados.forEach(l => { if (mapa[l.status]) mapa[l.status].push(l) })
    return mapa
  }, [leadsFiltrados])

  const semResposta = leads.filter(l => l.ultima_direcao === 'in' && l.status !== 'perdido').length

  if (userLoading || !isAdmin) return null

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={() => navigate('/app/admin')}
          style={{ background: 'transparent', border: 'none', color: '#667eea', cursor: 'pointer', fontSize: '13px', padding: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <Icon icon="mdi:arrow-left" width="16" /> Voltar ao /admin
        </button>
        <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 'bold', color: '#333', margin: '0 0 6px 0' }}>
          Leads de campanha
        </h1>
        <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
          Todo mundo que manda mensagem pro WhatsApp do Mensalli entra aqui. Arraste os cards conforme a conversa
          evolui — <strong>Criou conta</strong> e <strong>Pagante</strong> se preenchem sozinhas quando o telefone
          bate com uma conta no sistema.
        </p>
      </div>

      {/* Barra: contadores + busca */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '12px', marginBottom: '18px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {semResposta > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca',
              borderRadius: '999px', padding: '6px 12px', fontSize: '13px', fontWeight: 600
            }}>
              <Icon icon="mdi:message-alert" width="16" />
              {semResposta} esperando resposta
            </span>
          )}
          <span style={{ color: '#666', fontSize: '13px' }}>{leads.length} lead(s) no total</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: isMobile ? '100%' : '260px' }}>
            <SearchInput
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou telefone..."
              size="sm"
              fullWidth
            />
          </div>
          <Button variant="outline" size="sm" icon="mdi:refresh" loading={sincronizando} onClick={sincronizar}>
            Atualizar
          </Button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>Carregando leads...</div>
      ) : leads.length === 0 ? (
        <EmptyState
          icon="mdi:whatsapp"
          title="Nenhum lead ainda"
          description="Assim que alguém mandar mensagem pro WhatsApp do Mensalli, o card aparece aqui automaticamente."
        />
      ) : (
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px', alignItems: 'flex-start' }}>
          {COLUNAS.map(col => (
            <div
              key={col.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const leadId = e.dataTransfer.getData('leadId')
                if (leadId) moverLead(leadId, col.id)
              }}
              style={{
                flex: '1 1 250px', minWidth: '250px',
                backgroundColor: col.bg, borderRadius: '12px', padding: '12px', minHeight: '420px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: col.cor }} />
                  <strong style={{ fontSize: '13px', color: '#334155' }}>{col.titulo}</strong>
                  {col.auto && (
                    <span
                      title="Preenchida automaticamente quando o telefone bate com uma conta no Mensalli"
                      style={{ fontSize: '10px', color: col.cor, border: `1px solid ${col.cor}`, borderRadius: '4px', padding: '0 4px', fontWeight: 600 }}
                    >
                      AUTO
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>{porColuna[col.id].length}</span>
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>{col.hint}</div>

              {porColuna[col.id].map(lead => {
                const naoRespondido = lead.ultima_direcao === 'in'
                return (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('leadId', lead.id)}
                    onClick={() => abrirLead(lead)}
                    style={{
                      backgroundColor: '#fff', borderRadius: '8px', padding: '10px',
                      marginBottom: '8px', cursor: 'pointer',
                      border: naoRespondido ? '1px solid #fecaca' : '1px solid #e2e8f0',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      {naoRespondido && (
                        <span title="Sem resposta" style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#ef4444', flexShrink: 0 }} />
                      )}
                      <strong style={{ fontSize: '13px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lead.nome || 'Sem nome'}
                      </strong>
                    </div>

                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px' }}>
                      {lead.telefone
                        ? formatarTelefone(lead.telefone)
                        : <span title="Conta migrada pro endereçamento LID: o WhatsApp não expõe o número">📵 sem número</span>}
                    </div>

                    {lead.ultima_mensagem && (
                      <div style={{
                        fontSize: '12px', color: '#475569', marginBottom: '6px', lineHeight: 1.35,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                      }}>
                        {lead.ultima_direcao === 'out' && <span style={{ color: '#94a3b8' }}>Você: </span>}
                        {lead.ultima_mensagem}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>{tempoDesde(lead.ultima_interacao)}</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {lead.retornar_em && (
                          <span title={`Retornar em ${new Date(lead.retornar_em + 'T00:00:00').toLocaleDateString('pt-BR')}`}
                            style={{ fontSize: '10px', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '4px', padding: '1px 5px' }}>
                            📌 {new Date(lead.retornar_em + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          </span>
                        )}
                        {lead.plano_pago && (
                          <span style={{ fontSize: '10px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px', padding: '1px 5px', fontWeight: 600 }}>PAGANTE</span>
                        )}
                        {!lead.plano_pago && lead.usuario_id && (
                          <span style={{ fontSize: '10px', backgroundColor: '#cffafe', color: '#155e75', borderRadius: '4px', padding: '1px 5px', fontWeight: 600 }}>TRIAL</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* Painel lateral do lead */}
      {leadAberto && (
        <Modal
          isOpen={true}
          onClose={() => setLeadAberto(null)}
          position="aside"
          size="md"
          title={leadAberto.nome || 'Lead sem nome'}
          subtitle={leadAberto.telefone ? formatarTelefone(leadAberto.telefone) : 'Sem número (conta LID)'}
        >
          <Modal.Body>
            {/* Nome — o WhatsApp nem sempre expõe o nome do perfil */}
            <div style={{ marginBottom: '16px' }}>
              <Input
                label="Nome do lead"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Sem nome"
                helper="Se o WhatsApp não passou o nome do perfil, escreva aqui"
                icon="mdi:account"
                fullWidth
              />
            </div>

            {/* Situação da conta */}
            {leadAberto.usuario_id ? (
              <div style={{
                backgroundColor: leadAberto.plano_pago ? '#f0fdf4' : '#ecfeff',
                border: `1px solid ${leadAberto.plano_pago ? '#bbf7d0' : '#a5f3fc'}`,
                borderRadius: '8px', padding: '10px 12px', marginBottom: '16px', fontSize: '13px'
              }}>
                <strong>{leadAberto.plano_pago ? '✅ Virou cliente pagante' : '🎯 Criou conta (trial)'}</strong>
                <div style={{ color: '#475569', marginTop: '3px' }}>
                  {leadAberto.usuario_nome} · {leadAberto.usuario_email}
                </div>
                <div style={{ color: '#64748b', fontSize: '12px', marginTop: '2px' }}>
                  Cadastrou em {formatarDataHora(leadAberto.usuario_cadastro)}
                </div>
              </div>
            ) : (
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px', fontSize: '13px', color: '#64748b' }}>
                Ainda não tem conta no Mensalli com esse telefone.
              </div>
            )}

            {/* Conversa */}
            <div style={{ marginBottom: '8px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
              Conversa {mensagens.length > 0 && <span style={{ fontWeight: 400, color: '#94a3b8' }}>({mensagens.length} mensagens)</span>}
            </div>
            <div style={{
              backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px',
              padding: '12px', maxHeight: '320px', overflowY: 'auto', marginBottom: '16px'
            }}>
              {carregandoMsgs ? (
                <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Carregando conversa...</div>
              ) : mensagens.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px' }}>Nenhuma mensagem registrada.</div>
              ) : mensagens.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: m.direcao === 'out' ? 'flex-end' : 'flex-start', marginBottom: '8px' }}>
                  <div style={{
                    maxWidth: '80%',
                    backgroundColor: m.direcao === 'out' ? '#dcfce7' : '#fff',
                    border: '1px solid ' + (m.direcao === 'out' ? '#bbf7d0' : '#e2e8f0'),
                    borderRadius: '10px', padding: '7px 10px', fontSize: '13px', color: '#1e293b',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                  }}>
                    {m.texto}
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px', textAlign: 'right' }}>
                      {formatarDataHora(m.enviado_em)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Anotações */}
            <div style={{ marginBottom: '12px' }}>
              <label className="ds-input-label" style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                Anotações
              </label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex: disse que ia esperar virar o mês pra assinar"
                rows={3}
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db',
                  fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box'
                }}
              />
            </div>

            <Input
              type="date"
              label="Retornar em"
              helper="Aparece como lembrete no card"
              value={retornarEm}
              onChange={(e) => setRetornarEm(e.target.value)}
              fullWidth
            />
          </Modal.Body>

          <Modal.Footer align="between">
            <Button variant="danger-soft" icon="mdi:account-off" onClick={ignorarLead}>
              Não é lead
            </Button>
            <div style={{ display: 'flex', gap: '8px' }}>
              {leadAberto.telefone && (
                <Button
                  variant="whatsapp"
                  icon="mdi:whatsapp"
                  onClick={() => window.open(`https://wa.me/${String(leadAberto.telefone).replace(/\D/g, '')}`, '_blank')}
                >
                  Abrir no WhatsApp
                </Button>
              )}
              <Button variant="primary" loading={salvando} onClick={salvarAnotacoes}>Salvar</Button>
            </div>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  )
}
