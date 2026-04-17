import { useState, useEffect, useMemo } from 'react'
import { useUser } from './contexts/UserContext'
import { useUserPlan } from './hooks/useUserPlan'
import { supabase } from './supabaseClient'
import useWindowSize from './hooks/useWindowSize'
import { Icon } from '@iconify/react'
import whatsappService from './services/whatsappService'
import { showToast } from './Toast'

// Colunas do CRM de Leads (fluxo manual/bot/landing)
const COLUNAS_LEADS = [
  { id: 'novo', titulo: 'Novo', cor: '#3b82f6', bg: '#eff6ff' },
  { id: 'em_contato', titulo: 'Em contato', cor: '#f59e0b', bg: '#fffbeb' },
  { id: 'convertido', titulo: 'Convertido', cor: '#10b981', bg: '#ecfdf5' },
  { id: 'perdido', titulo: 'Perdido', cor: '#6b7280', bg: '#f3f4f6' }
]

// Colunas do CRM de Experimentais (fluxo do link de agendamento)
// "nao_marcou / agendado / compareceu" são derivadas de agendamentos (read-only)
// "convertido / perdido" são ações manuais (drag habilita)
const COLUNAS_EXP = [
  { id: 'nao_marcou', titulo: 'Não marcou', cor: '#6b7280', bg: '#f3f4f6', derivada: true },
  { id: 'agendado', titulo: 'Agendado', cor: '#3b82f6', bg: '#eff6ff', derivada: true },
  { id: 'compareceu', titulo: 'Compareceu', cor: '#8b5cf6', bg: '#f5f3ff', derivada: true },
  { id: 'convertido', titulo: 'Convertido', cor: '#10b981', bg: '#ecfdf5', derivada: false },
  { id: 'perdido', titulo: 'Perdido', cor: '#6b7280', bg: '#f3f4f6', derivada: false }
]

const ORIGEM_LABEL = {
  manual: 'Manual',
  whatsapp_bot: 'Bot WhatsApp',
  landing_page: 'Landing Page',
  agendamento: 'Link de Agendamento',
  indicacao: 'Indicação'
}

const ORIGEM_ICON = {
  manual: 'mdi:account-plus',
  whatsapp_bot: 'mdi:robot-happy',
  landing_page: 'mdi:web',
  agendamento: 'mdi:calendar-plus',
  indicacao: 'mdi:account-arrow-right'
}

function formatarData(dataIso) {
  if (!dataIso) return ''
  const d = new Date(dataIso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function diasAtras(dataIso) {
  if (!dataIso) return null
  const d = new Date(dataIso + 'T00:00:00')
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.floor((hoje - d) / (1000 * 60 * 60 * 24))
}


export default function CRM() {
  const { userId } = useUser()
  const { isLocked } = useUserPlan()
  const { isSmallScreen } = useWindowSize()
  const crmLocked = isLocked('premium')

  const [activeTab, setActiveTab] = useState('leads') // 'leads' | 'experimentais'
  const [leads, setLeads] = useState([])
  const [agendamentosPorDevedor, setAgendamentosPorDevedor] = useState({})
  const [aulasMap, setAulasMap] = useState({})
  const [planos, setPlanos] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [leadEditando, setLeadEditando] = useState(null)
  const [busca, setBusca] = useState('')

  // Modal de conversão
  const [modalConverter, setModalConverter] = useState(null)
  const [convPlanoId, setConvPlanoId] = useState('')
  const [convDataInicio, setConvDataInicio] = useState('')
  const [convDataVenc, setConvDataVenc] = useState('')
  const [convertendo, setConvertendo] = useState(false)

  // Modal de envio de WhatsApp
  const [modalMsg, setModalMsg] = useState({ aberto: false, lead: null, texto: '', enviando: false })

  useEffect(() => {
    if (userId && !crmLocked) carregarTudo()
  }, [userId, crmLocked])

  const carregarTudo = async () => {
    setLoading(true)
    const [{ data: leadsData }, { data: planosData }] = await Promise.all([
      supabase.from('leads').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('planos').select('id, nome, valor, tipo, numero_aulas, ciclo_cobranca').eq('user_id', userId)
    ])

    const leadsList = leadsData || []
    setLeads(leadsList)
    setPlanos(planosData || [])

    // Agendamentos dos devedores vinculados (pra classificar experimentais)
    const devedorIds = leadsList.map(l => l.convertido_em_devedor_id).filter(Boolean)
    if (devedorIds.length > 0) {
      const { data: ags } = await supabase
        .from('agendamentos')
        .select('id, devedor_id, aula_id, data, status')
        .in('devedor_id', devedorIds)
        .order('data', { ascending: false })

      const porDev = {}
      const aulaIds = new Set()
      ;(ags || []).forEach(a => {
        if (!porDev[a.devedor_id]) porDev[a.devedor_id] = []
        porDev[a.devedor_id].push(a)
        aulaIds.add(a.aula_id)
      })
      setAgendamentosPorDevedor(porDev)

      if (aulaIds.size > 0) {
        const { data: aulas } = await supabase
          .from('aulas')
          .select('id, descricao, horario, dia_semana')
          .in('id', Array.from(aulaIds))
        const amap = {}
        ;(aulas || []).forEach(a => { amap[a.id] = a })
        setAulasMap(amap)
      }
    }

    setLoading(false)
  }

  // Separar leads por aba
  const leadsManual = useMemo(() => leads.filter(l => l.origem !== 'agendamento'), [leads])
  const leadsExperimental = useMemo(() => leads.filter(l => l.origem === 'agendamento'), [leads])

  // Calcular badge + coluna-derivada de cada experimental
  const situacaoExperimental = useMemo(() => {
    const map = {}
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    leadsExperimental.forEach(lead => {
      const ags = agendamentosPorDevedor[lead.convertido_em_devedor_id] || []
      const confirmados = ags.filter(a => a.status === 'confirmado')
      const futuros = confirmados.filter(a => new Date(a.data + 'T00:00:00') >= hoje)
      const passados = confirmados.filter(a => new Date(a.data + 'T00:00:00') < hoje)

      const corBadge = '#6b7280'
      const bgBadge = '#f3f4f6'
      let badge = null
      let colunaDerivada = 'nao_marcou'

      if (futuros.length > 0) {
        const proxima = futuros.sort((a, b) => a.data.localeCompare(b.data))[0]
        const dias = Math.floor((new Date(proxima.data + 'T00:00:00') - hoje) / (1000 * 60 * 60 * 24))
        badge = {
          texto: dias === 0 ? 'Aula hoje' : dias === 1 ? 'Aula amanhã' : `Aula em ${dias}d`,
          cor: corBadge, bg: bgBadge, data: proxima.data, aula_id: proxima.aula_id
        }
        colunaDerivada = 'agendado'
      } else if (passados.length > 0) {
        const ultima = passados.sort((a, b) => b.data.localeCompare(a.data))[0]
        const dias = diasAtras(ultima.data)
        badge = {
          texto: dias === 0 ? 'Fez aula hoje' : `Fez aula há ${dias}d`,
          cor: corBadge, bg: bgBadge, data: ultima.data, aula_id: ultima.aula_id
        }
        colunaDerivada = 'compareceu'
      } else {
        const dias = diasAtras(lead.created_at?.substring(0, 10))
        badge = {
          texto: dias > 0 ? `Não marcou aula • há ${dias}d` : 'Não marcou aula • hoje',
          cor: corBadge, bg: bgBadge, icone: 'mdi:calendar-remove'
        }
        colunaDerivada = 'nao_marcou'
      }

      // Se já foi convertido ou perdido manualmente, sobrescreve
      if (lead.status === 'convertido') colunaDerivada = 'convertido'
      else if (lead.status === 'perdido') colunaDerivada = 'perdido'

      map[lead.id] = { badge, totalAulas: confirmados.length, futuros: futuros.length, passados: passados.length, colunaDerivada }
    })
    return map
  }, [leadsExperimental, agendamentosPorDevedor])

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
    carregarTudo()
  }

  const excluirLead = async () => {
    if (!leadEditando.id) return
    if (!window.confirm('Excluir este lead?')) return
    await supabase.from('leads').delete().eq('id', leadEditando.id)
    setModalAberto(false)
    carregarTudo()
  }

  // Drag no CRM Leads: atualiza leads.status
  const moverLeadManual = async (leadId, novoStatus) => {
    await supabase.from('leads').update({ status: novoStatus }).eq('id', leadId)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: novoStatus } : l))
  }

  // Drag no CRM Experimental:
  // - nao_marcou/agendado/compareceu: read-only (ignora drop)
  // - convertido: abre modal de conversão
  // - perdido: confirma descarte
  const moverExperimental = async (leadId, colunaDestino) => {
    const lead = leads.find(l => l.id === leadId)
    if (!lead) return
    if (colunaDestino === 'convertido') {
      abrirConverter(lead)
    } else if (colunaDestino === 'perdido') {
      descartarLead(lead)
    }
    // demais colunas: ignora
  }

  const gerarMsgPadrao = (lead) => {
    const situ = situacaoExperimental[lead.id]
    if (situ?.badge?.texto?.startsWith('Fez aula há') || situ?.badge?.texto === 'Fez aula hoje') {
      return `Oi ${lead.nome}! Tudo bem? Vi que você fez uma aula experimental com a gente. Como foi a experiência? Que tal voltar essa semana? 😊`
    }
    if (situ?.futuros > 0) {
      return `Oi ${lead.nome}! Só confirmando sua aula experimental. Te espero lá! 😊`
    }
    return `Oi ${lead.nome}! Tudo bem? Vi que você se interessou por uma aula experimental. Posso te ajudar a agendar?`
  }

  const abrirWhatsApp = (lead) => {
    if (!lead.telefone) return showToast('Lead sem telefone', 'error')
    setModalMsg({ aberto: true, lead, texto: gerarMsgPadrao(lead), enviando: false })
  }

  const enviarMensagemWhatsApp = async () => {
    if (!modalMsg.texto.trim() || !modalMsg.lead?.telefone) return
    setModalMsg(prev => ({ ...prev, enviando: true }))
    try {
      const resultado = await whatsappService.enviarMensagem(modalMsg.lead.telefone, modalMsg.texto.trim())
      if (resultado.sucesso) {
        showToast(`Mensagem enviada pra ${(modalMsg.lead.nome || '').split(' ')[0]}!`, 'success')
        setModalMsg({ aberto: false, lead: null, texto: '', enviando: false })
      } else {
        showToast(resultado.erro || 'Erro ao enviar mensagem', 'error')
        setModalMsg(prev => ({ ...prev, enviando: false }))
      }
    } catch (err) {
      showToast('Erro ao enviar: ' + (err.message || 'erro desconhecido'), 'error')
      setModalMsg(prev => ({ ...prev, enviando: false }))
    }
  }

  const abrirConverter = async (lead) => {
    if (!lead.convertido_em_devedor_id) {
      return alert('Este lead não tem aluno vinculado. Cadastre-o como cliente manualmente.')
    }
    const { data: devedor } = await supabase
      .from('devedores').select('*').eq('id', lead.convertido_em_devedor_id).single()
    if (!devedor) return alert('Aluno vinculado não encontrado')

    setModalConverter({ lead, devedor })
    setConvPlanoId(planos[0]?.id || '')
    const hoje = new Date()
    setConvDataInicio(hoje.toISOString().split('T')[0])
    const venc = new Date(hoje)
    venc.setMonth(venc.getMonth() + 1)
    setConvDataVenc(venc.toISOString().split('T')[0])
    setModalAberto(false)
  }

  const atualizarDataInicio = (novoInicio) => {
    setConvDataInicio(novoInicio)
    if (novoInicio) {
      const d = new Date(novoInicio + 'T12:00:00')
      d.setMonth(d.getMonth() + 1)
      setConvDataVenc(d.toISOString().split('T')[0])
    }
  }

  const confirmarConversao = async () => {
    if (!convPlanoId) return alert('Selecione um plano')
    if (!convDataVenc) return alert('Defina a data de vencimento')
    const plano = planos.find(p => p.id === convPlanoId)
    if (!plano) return alert('Plano inválido')

    setConvertendo(true)
    try {
      const { lead, devedor } = modalConverter
      const isPacote = plano.tipo === 'pacote'

      await supabase.from('devedores').update({
        experimental: false,
        assinatura_ativa: true,
        plano_id: plano.id,
        aulas_restantes: isPacote ? plano.numero_aulas : null,
        aulas_total: isPacote ? plano.numero_aulas : null
      }).eq('id', devedor.id)

      await supabase.from('mensalidades').insert({
        user_id: userId,
        devedor_id: devedor.id,
        valor: plano.valor,
        data_vencimento: convDataVenc,
        status: 'pendente',
        is_mensalidade: true,
        numero_mensalidade: 1
      })

      await supabase.from('leads').update({ status: 'convertido' }).eq('id', lead.id)

      setModalConverter(null)
      carregarTudo()
    } catch (err) {
      alert('Erro ao converter: ' + err.message)
    } finally {
      setConvertendo(false)
    }
  }

  const descartarLead = async (lead) => {
    if (!window.confirm(`Descartar ${lead.nome}? O aluno experimental será arquivado.`)) return
    await supabase.from('leads').update({ status: 'perdido' }).eq('id', lead.id)
    if (lead.convertido_em_devedor_id) {
      await supabase.from('devedores').update({
        lixo: true,
        deletado_em: new Date().toISOString()
      }).eq('id', lead.convertido_em_devedor_id)
    }
    setModalAberto(false)
    carregarTudo()
  }

  const filtrarPorBusca = (lista) => busca
    ? lista.filter(l => l.nome.toLowerCase().includes(busca.toLowerCase()) || (l.telefone || '').includes(busca))
    : lista

  if (crmLocked) {
    return (
      <div style={{ padding: isSmallScreen ? '16px' : '24px', flex: 1, width: '100%', backgroundColor: '#ffffff', minHeight: '100vh', boxSizing: 'border-box' }}>
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '60px 40px', textAlign: 'center', border: '1px solid #e5e7eb', maxWidth: '500px', margin: '40px auto' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#fff3e0', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
            <Icon icon="mdi:lock" width="32" style={{ color: '#ff9800' }} />
          </div>
          <h2 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: '600', color: '#1a1a1a' }}>CRM</h2>
          <p style={{ margin: '0 0 24px', fontSize: '15px', color: '#666', lineHeight: '1.6' }}>
            Capture leads do bot e experimentais do link de agendamento em um funil visual.
            Disponível no plano <strong>Premium</strong>.
          </p>
          <button onClick={() => window.location.href = '/app/configuracao?aba=upgrade'}
            style={{ padding: '12px 32px', backgroundColor: '#ff9800', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
            Fazer Upgrade
          </button>
        </div>
      </div>
    )
  }

  // Contadores das abas
  const countLeads = leadsManual.length
  const countExp = leadsExperimental.length

  return (
    <div style={{ padding: isSmallScreen ? '16px' : '24px', flex: 1, width: '100%', backgroundColor: '#ffffff', minHeight: '100vh', boxSizing: 'border-box' }}>
      {/* Tabs Leads / Experimentais */}
      <div style={{ marginBottom: '20px' }}>
        {isSmallScreen ? (
          <select
            value={activeTab}
            onChange={e => setActiveTab(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 40px 12px 16px',
              borderRadius: '10px',
              border: '1px solid #e5e7eb',
              fontSize: '14px',
              fontWeight: '600',
              color: '#1a1a1a',
              backgroundColor: 'white',
              cursor: 'pointer',
              appearance: 'none',
              WebkitAppearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24'%3E%3Cpath fill='%23666' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              backgroundSize: '20px',
              boxSizing: 'border-box'
            }}
          >
            <option value="leads">Leads ({countLeads})</option>
            <option value="experimentais">Experimentais ({countExp})</option>
          </select>
        ) : (
          <div style={{ display: 'inline-flex', gap: '4px', backgroundColor: '#f3f4f6', borderRadius: '10px', padding: '4px' }}>
            {[
              { id: 'leads', label: `Leads (${countLeads})`, icon: 'mdi:account-multiple' },
              { id: 'experimentais', label: `Experimentais (${countExp})`, icon: 'mdi:calendar-account' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '8px 20px',
                  backgroundColor: activeTab === tab.id ? 'white' : 'transparent',
                  color: activeTab === tab.id ? '#1a1a1a' : '#555',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: activeTab === tab.id ? '600' : '400',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s',
                  boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  opacity: activeTab === tab.id ? 1 : 0.75
                }}
              >
                <Icon icon={tab.icon} width={18} />
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeTab === 'leads'
        ? <AbaLeads
            leads={filtrarPorBusca(leadsManual)}
            busca={busca} setBusca={setBusca}
            abrirNovo={abrirNovo} abrirLead={abrirLead}
            moverLead={moverLeadManual} loading={loading}
            isSmallScreen={isSmallScreen}
          />
        : <AbaExperimentais
            leads={filtrarPorBusca(leadsExperimental)}
            busca={busca} setBusca={setBusca}
            abrirLead={abrirLead}
            moverLead={moverExperimental}
            situacao={situacaoExperimental}
            aulasMap={aulasMap}
            abrirWhatsApp={abrirWhatsApp}
            abrirConverter={abrirConverter}
            loading={loading}
            isSmallScreen={isSmallScreen}
          />
      }

      {/* Modal de edição do lead */}
      {modalAberto && leadEditando && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
          onClick={() => setModalAberto(false)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', maxWidth: '500px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: '600', color: '#1a1a1a' }}>
              {leadEditando.id ? 'Editar lead' : 'Novo lead'}
            </h3>

            {leadEditando.id && leadEditando.origem === 'agendamento' && situacaoExperimental[leadEditando.id]?.badge && (() => {
              const situ = situacaoExperimental[leadEditando.id]
              const aula = situ.badge.aula_id ? aulasMap[situ.badge.aula_id] : null
              return (
                <div style={{ backgroundColor: situ.badge.bg, borderLeft: `3px solid ${situ.badge.cor}`, padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: situ.badge.cor, marginBottom: '4px' }}>
                    {situ.badge.texto}
                  </div>
                  {situ.badge.data && aula && (
                    <div style={{ fontSize: '12px', color: '#444' }}>
                      {formatarData(situ.badge.data)} • {aula.horario?.substring(0, 5)} • {aula.descricao || 'Aula'}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                    Total: {situ.passados} realizadas, {situ.futuros} agendadas
                  </div>
                </div>
              )
            })()}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '4px' }}>Nome *</label>
                <input type="text" value={leadEditando.nome || ''}
                  onChange={(e) => setLeadEditando({ ...leadEditando, nome: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '4px' }}>Telefone</label>
                <input type="text" value={leadEditando.telefone || ''}
                  onChange={(e) => setLeadEditando({ ...leadEditando, telefone: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '4px' }}>Email</label>
                <input type="email" value={leadEditando.email || ''}
                  onChange={(e) => setLeadEditando({ ...leadEditando, email: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '4px' }}>Interesse</label>
                <input type="text" value={leadEditando.interesse || ''}
                  onChange={(e) => setLeadEditando({ ...leadEditando, interesse: e.target.value })}
                  placeholder="Ex: Aula experimental, valores..."
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }} />
              </div>
              {leadEditando.origem !== 'agendamento' && (
                <div>
                  <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '4px' }}>Status</label>
                  <select value={leadEditando.status || 'novo'}
                    onChange={(e) => setLeadEditando({ ...leadEditando, status: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }}>
                    {COLUNAS_LEADS.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '4px' }}>Observações</label>
                <textarea value={leadEditando.observacoes || ''}
                  onChange={(e) => setLeadEditando({ ...leadEditando, observacoes: e.target.value })}
                  rows={3}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
            </div>

            {leadEditando.id && leadEditando.origem === 'agendamento' && leadEditando.status !== 'convertido' && leadEditando.status !== 'perdido' && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                {leadEditando.telefone && (
                  <button onClick={() => abrirWhatsApp(leadEditando)}
                    style={{ flex: 1, padding: '10px', backgroundColor: '#25d366', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Icon icon="mdi:whatsapp" width="16" />
                    WhatsApp
                  </button>
                )}
                {leadEditando.convertido_em_devedor_id && (
                  <button onClick={() => abrirConverter(leadEditando)}
                    style={{ flex: 1, padding: '10px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Icon icon="mdi:check-circle" width="16" />
                    Converter em aluno
                  </button>
                )}
                <button onClick={() => descartarLead(leadEditando)}
                  style={{ flex: 1, padding: '10px', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Icon icon="mdi:close-circle" width="16" />
                  Descartar
                </button>
              </div>
            )}
            {leadEditando.id && leadEditando.status === 'convertido' && (
              <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#ecfdf5', borderRadius: '8px', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="mdi:check-circle" width="18" style={{ color: '#10b981' }} />
                <span style={{ fontSize: '13px', color: '#065f46', fontWeight: '500' }}>
                  Já convertido em aluno pagante. Gerencie pela tela de Alunos.
                </span>
              </div>
            )}
            {leadEditando.id && leadEditando.status === 'perdido' && (
              <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '8px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon icon="mdi:close-circle" width="18" style={{ color: '#6b7280' }} />
                <span style={{ fontSize: '13px', color: '#374151', fontWeight: '500' }}>
                  Descartado. O aluno experimental foi arquivado.
                </span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', gap: '8px' }}>
              {leadEditando.id ? (
                <button onClick={excluirLead}
                  style={{ padding: '10px 16px', backgroundColor: 'white', color: '#9ca3af', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                  Excluir permanentemente
                </button>
              ) : <div />}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setModalAberto(false)}
                  style={{ padding: '10px 16px', backgroundColor: 'white', color: '#666', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={salvarLead}
                  style={{ padding: '10px 20px', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de conversão */}
      {modalConverter && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: '16px' }}
          onClick={() => !convertendo && setModalConverter(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', maxWidth: '480px', width: '100%' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: '600', color: '#1a1a1a' }}>
              Converter em aluno pagante
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#666' }}>
              <strong>{modalConverter.lead.nome}</strong> vai sair do CRM e virar aluno ativo com mensalidade.
            </p>

            {planos.length === 0 ? (
              <div style={{ padding: '16px', backgroundColor: '#fef3c7', borderRadius: '8px', fontSize: '13px', color: '#92400e', marginBottom: '16px' }}>
                Você ainda não tem planos cadastrados. Vá em Configuração → Planos para criar um antes de converter.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                <div>
                  <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '4px' }}>Plano *</label>
                  <select value={convPlanoId} onChange={e => setConvPlanoId(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }}>
                    {planos.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nome} — R$ {Number(p.valor).toFixed(2)} {p.tipo === 'pacote' ? `(${p.numero_aulas} aulas)` : `(${p.ciclo_cobranca || 'mensal'})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '4px' }}>Início *</label>
                    <input type="date" value={convDataInicio} onChange={e => atualizarDataInicio(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '13px', color: '#666', display: 'block', marginBottom: '4px' }}>Vencimento 1ª mensalidade *</label>
                    <input type="date" value={convDataVenc} onChange={e => setConvDataVenc(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setModalConverter(null)} disabled={convertendo}
                style={{ padding: '10px 16px', backgroundColor: 'white', color: '#666', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: convertendo ? 'wait' : 'pointer' }}>
                Cancelar
              </button>
              <button onClick={confirmarConversao} disabled={convertendo || planos.length === 0}
                style={{ padding: '10px 20px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: convertendo || planos.length === 0 ? 'wait' : 'pointer', opacity: planos.length === 0 ? 0.5 : 1 }}>
                {convertendo ? 'Convertendo...' : 'Confirmar conversão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de envio de WhatsApp */}
      {modalMsg.aberto && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002, padding: '16px' }}
          onClick={() => !modalMsg.enviando && setModalMsg(prev => ({ ...prev, aberto: false }))}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '10px' }}>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: '600', color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Icon icon="mdi:whatsapp" width="22" style={{ color: '#25d366' }} />
                  Enviar mensagem
                </h3>
                <div style={{ fontSize: '13px', color: '#666' }}>
                  Para: <strong>{modalMsg.lead?.nome}</strong> · {modalMsg.lead?.telefone}
                </div>
              </div>
              <button onClick={() => setModalMsg(prev => ({ ...prev, aberto: false }))} disabled={modalMsg.enviando}
                style={{ background: 'transparent', border: 'none', cursor: modalMsg.enviando ? 'wait' : 'pointer', padding: '4px', color: '#666' }}>
                <Icon icon="mdi:close" width="20" />
              </button>
            </div>

            <textarea
              value={modalMsg.texto}
              onChange={e => setModalMsg(prev => ({ ...prev, texto: e.target.value }))}
              disabled={modalMsg.enviando}
              rows={6}
              placeholder="Digite sua mensagem..."
              style={{
                width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db',
                fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
                backgroundColor: modalMsg.enviando ? '#f9fafb' : 'white'
              }}
            />
            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px', textAlign: 'right' }}>
              {modalMsg.texto.length} caracteres
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button onClick={() => setModalMsg(prev => ({ ...prev, aberto: false }))} disabled={modalMsg.enviando}
                style={{ padding: '10px 16px', backgroundColor: 'white', color: '#666', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: modalMsg.enviando ? 'wait' : 'pointer' }}>
                Cancelar
              </button>
              <button onClick={enviarMensagemWhatsApp} disabled={modalMsg.enviando || !modalMsg.texto.trim()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: modalMsg.enviando ? '#86efac' : '#25d366',
                  color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600',
                  cursor: modalMsg.enviando ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  opacity: !modalMsg.texto.trim() ? 0.6 : 1
                }}>
                {modalMsg.enviando ? (
                  <><Icon icon="mdi:loading" width="16" className="spin" />Enviando...</>
                ) : (
                  <><Icon icon="mdi:send" width="16" />Enviar</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Aba: CRM de Leads (manual / bot / landing)
// ============================================================
function AbaLeads({ leads, busca, setBusca, abrirNovo, abrirLead, moverLead, loading, isSmallScreen }) {
  // Leads antigos com status 'experimental' caem em 'em_contato' pra não ficarem órfãos
  const normalizarStatus = (s) => s === 'experimental' ? 'em_contato' : s
  const leadsPorColuna = (colId) => leads.filter(l => normalizarStatus(l.status) === colId)

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#344848' }}>CRM de Leads</h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#666' }}>
            Capturados pelo bot do WhatsApp, landing page ou cadastro manual
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Buscar nome ou telefone..." value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', width: isSmallScreen ? '100%' : '240px' }} />
          <button onClick={abrirNovo}
            style={{ padding: '10px 18px', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Icon icon="mdi:plus" width="18" />
            Novo lead
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Carregando...</div>
      ) : (
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px' }}>
          {COLUNAS_LEADS.map(col => {
            const leadsCol = leadsPorColuna(col.id)
            return (
              <div key={col.id}
                style={{ flex: '1 1 240px', minWidth: '240px', backgroundColor: col.bg, borderRadius: '12px', padding: '12px', minHeight: '400px' }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const leadId = e.dataTransfer.getData('leadId')
                  if (leadId) moverLead(leadId, col.id)
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '0 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: col.cor }} />
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>{col.titulo}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#666', fontWeight: '600' }}>{leadsCol.length}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {leadsCol.map(lead => (
                    <div key={lead.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData('leadId', lead.id)}
                      onClick={() => abrirLead(lead)}
                      style={{ backgroundColor: 'white', borderRadius: '10px', padding: '12px', cursor: 'pointer', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
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
    </>
  )
}

// ============================================================
// Aba: CRM de Experimentais (origem=agendamento)
// ============================================================
function AbaExperimentais({ leads, busca, setBusca, abrirLead, moverLead, situacao, aulasMap, abrirWhatsApp, abrirConverter, loading, isSmallScreen }) {
  const leadsPorColuna = (colId) => leads.filter(l => situacao[l.id]?.colunaDerivada === colId)

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#344848' }}>CRM de Experimentais</h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#666' }}>
            Alunos que entraram pelo link de agendamento e ainda não viraram aluno pagante
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Buscar nome ou telefone..." value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', width: isSmallScreen ? '100%' : '240px' }} />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Carregando...</div>
      ) : leads.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666' }}>
          <Icon icon="mdi:calendar-blank" width="48" style={{ color: '#d1d5db', marginBottom: '12px' }} />
          <div style={{ fontSize: '15px', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>Nenhum experimental por aqui</div>
          <div style={{ fontSize: '13px', color: '#9ca3af' }}>Quando alguém usar seu link de agendamento, aparece aqui.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px' }}>
          {COLUNAS_EXP.map(col => {
            const leadsCol = leadsPorColuna(col.id)
            return (
              <div key={col.id}
                style={{ flex: '1 1 220px', minWidth: '220px', backgroundColor: col.bg, borderRadius: '12px', padding: '12px', minHeight: '400px', opacity: col.derivada ? 0.95 : 1 }}
                onDragOver={(e) => { if (!col.derivada) e.preventDefault() }}
                onDrop={(e) => {
                  if (col.derivada) return
                  e.preventDefault()
                  const leadId = e.dataTransfer.getData('leadId')
                  if (leadId) moverLead(leadId, col.id)
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '0 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: col.cor }} />
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>{col.titulo}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#666', fontWeight: '600' }}>{leadsCol.length}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {leadsCol.map(lead => {
                    const situ = situacao[lead.id]
                    const aula = situ?.badge?.aula_id ? aulasMap[situ.badge.aula_id] : null
                    return (
                      <div key={lead.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData('leadId', lead.id)}
                        onClick={() => abrirLead(lead)}
                        style={{ backgroundColor: 'white', borderRadius: '10px', padding: '12px', cursor: 'pointer', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
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
                        {situ?.badge && (
                          <div style={{ marginTop: '4px', marginBottom: '4px' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', backgroundColor: situ.badge.bg, color: situ.badge.cor, fontSize: '11px', fontWeight: '600' }}>
                              <Icon icon={situ.badge.icone || 'mdi:calendar-clock'} width="12" />
                              {situ.badge.texto}
                            </div>
                            {situ.badge.data && (
                              <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                                {formatarData(situ.badge.data)}
                                {aula?.horario && ` • ${aula.horario.substring(0, 5)}`}
                                {aula?.descricao && ` • ${aula.descricao}`}
                              </div>
                            )}
                          </div>
                        )}
                        {col.id !== 'convertido' && col.id !== 'perdido' && lead.telefone && (
                          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => abrirWhatsApp(lead)} title="Enviar WhatsApp"
                              style={{ flex: 1, padding: '6px', backgroundColor: '#25d366', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                              <Icon icon="mdi:whatsapp" width="13" />
                              WhatsApp
                            </button>
                            {lead.convertido_em_devedor_id && (
                              <button onClick={() => abrirConverter(lead)} title="Converter em aluno"
                                style={{ flex: 1, padding: '6px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                <Icon icon="mdi:check-circle" width="13" />
                                Converter
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {leadsCol.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px 10px', color: '#9ca3af', fontSize: '12px' }}>
                      {col.derivada ? 'Vazio' : 'Arraste cards aqui'}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
