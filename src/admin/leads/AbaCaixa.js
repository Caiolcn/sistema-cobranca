import { useState, useMemo, useEffect } from 'react'
import { Icon } from '@iconify/react'
import Modal from '../../design-system/components/Modal'
import ListaConversas, { FILTROS, aplicarFiltro, ordenarFila } from './ListaConversas'
import Conversa from './Conversa'
import Composer from './Composer'
import PainelLead from './PainelLead'
import { useConversa } from './useConversa'
import { formatarTelefone, tempoDesde } from './utils'

// A caixa de entrada. No celular é uma coluna só (lista → conversa, com
// voltar); no desktop, lista + conversa + painel do lead lado a lado.

// A seleção mora no shell: a aba "Hoje" e o funil precisam conseguir abrir uma
// conversa específica aqui dentro.
export default function AbaCaixa({ inbox, respostas, isMobile, selecionadoId, onSelecionarId }) {
  const { leads, salvarLead, ignorarLead, marcarLido } = inbox

  const setSelecionadoId = onSelecionarId
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('esperando')
  const [painelAberto, setPainelAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const conversa = useConversa(selecionadoId)

  const porBusca = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return leads
    const digitos = termo.replace(/\D/g, '')
    return leads.filter(l =>
      (l.nome || '').toLowerCase().includes(termo) ||
      (l.usuario_nome || '').toLowerCase().includes(termo) ||
      (l.ultima_mensagem || '').toLowerCase().includes(termo) ||
      (digitos && String(l.telefone || '').includes(digitos))
    )
  }, [leads, busca])

  const visiveis = useMemo(() => ordenarFila(aplicarFiltro(porBusca, filtro)), [porBusca, filtro])

  const contadores = useMemo(() => {
    const c = {}
    FILTROS.forEach(f => { c[f.id] = aplicarFiltro(leads, f.id).length })
    // "Todas" como número total só polui: o que importa é a dívida.
    c.todas = 0
    c.perdidos = 0
    return c
  }, [leads])

  const lead = useMemo(() => leads.find(l => l.id === selecionadoId) || null, [leads, selecionadoId])

  // Se o lead selecionado sair da lista (virou "não é lead"), fecha a conversa.
  useEffect(() => {
    if (selecionadoId && !leads.some(l => l.id === selecionadoId)) setSelecionadoId(null)
  }, [leads, selecionadoId])

  const selecionar = (l) => {
    setSelecionadoId(l.id)
    if (l.nao_lidas > 0 || !l.lido_em) marcarLido(l.id)
  }

  const salvar = async (patch) => {
    setSalvando(true)
    try {
      await salvarLead(lead.id, patch)
    } catch (e) {
      window.alert('Não consegui salvar: ' + e.message)
    } finally {
      setSalvando(false)
    }
  }

  const ignorar = async () => {
    if (!window.confirm(`Tirar "${lead.nome || 'este contato'}" da caixa? As conversas dele param de ser registradas aqui (o WhatsApp continua normal).`)) return
    try {
      await ignorarLead(lead.id)
      setSelecionadoId(null)
      setPainelAberto(false)
    } catch (e) {
      window.alert('Erro: ' + e.message)
    }
  }

  const mostrandoConversa = Boolean(lead)

  const cabecalhoConversa = lead && (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 14px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff', flexShrink: 0
    }}>
      {isMobile && (
        <button type="button" onClick={() => setSelecionadoId(null)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: '#475569', display: 'flex' }}
          aria-label="Voltar para a lista">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z" />
          </svg>
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 650, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lead.nome || formatarTelefone(lead.telefone)}
        </div>
        <div style={{ fontSize: '11.5px', color: '#64748b' }}>
          {lead.telefone ? formatarTelefone(lead.telefone) : 'sem número (LID)'} · {lead.esperando_resposta ? `esperando ${tempoDesde(lead.ultima_interacao)}` : 'respondido'}
        </div>
      </div>
      <button type="button" onClick={() => setPainelAberto(v => !v)}
        title="Dados do lead"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer',
          fontSize: '12px', color: '#475569', backgroundColor: '#f1f5f9',
          border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px'
        }}>
        <Icon icon="mdi:card-account-details-outline" width="15" />
        {isMobile ? '' : 'Dados'}
      </button>
    </div>
  )

  const bloco = (
    <>
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, backgroundColor: '#f8fafc' }}>
        <Conversa
          mensagens={conversa.mensagens}
          pendentes={conversa.pendentes}
          carregando={conversa.carregando}
          urlsMidia={conversa.urlsMidia}
          telefone={lead?.telefone}
          onDescartarPendente={conversa.descartarPendente}
        />
      </div>
      <Composer
        lead={lead}
        respostas={respostas}
        enviando={conversa.enviando}
        onEnviar={conversa.enviar}
        isMobile={isMobile}
      />
    </>
  )

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : (painelAberto ? '330px 1fr 340px' : '330px 1fr'),
      border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden',
      // Ocupa toda a altura que o shell deu, em vez de calcular vh na mão —
      // cálculo de vh erra sempre que o cabeçalho muda de tamanho.
      flex: 1, minHeight: 0, backgroundColor: '#fff'
    }}>
      {/* Lista */}
      {(!isMobile || !mostrandoConversa) && (
        <div style={{ borderRight: isMobile ? 'none' : '1px solid #e2e8f0', minHeight: 0, overflow: 'hidden' }}>
          <ListaConversas
            leads={visiveis}
            selecionadoId={selecionadoId}
            onSelecionar={selecionar}
            busca={busca}
            onBusca={setBusca}
            filtro={filtro}
            onFiltro={setFiltro}
            contadores={contadores}
            isMobile={isMobile}
          />
        </div>
      )}

      {/* Conversa */}
      {(!isMobile || mostrandoConversa) && (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
          {lead ? (
            <>
              {cabecalhoConversa}
              {bloco}
            </>
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', color: '#94a3b8', gap: '8px', padding: '30px', textAlign: 'center'
            }}>
              <Icon icon="mdi:message-text-outline" width="34" />
              <div style={{ fontSize: '13.5px' }}>Escolha uma conversa à esquerda.</div>
              <div style={{ fontSize: '12px', maxWidth: '320px' }}>
                A lista começa por quem está esperando resposta há mais tempo.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Painel do lead: coluna no desktop, gaveta no celular */}
      {!isMobile && painelAberto && lead && (
        <div style={{ borderLeft: '1px solid #e2e8f0', overflowY: 'auto', minHeight: 0, backgroundColor: '#fff' }}>
          <PainelLead lead={lead} onSalvar={salvar} onIgnorar={ignorar} salvando={salvando} />
        </div>
      )}

      {isMobile && painelAberto && lead && (
        <Modal isOpen onClose={() => setPainelAberto(false)} position="aside" size="md"
          title={lead.nome || 'Lead'} subtitle={lead.telefone ? formatarTelefone(lead.telefone) : 'sem número'}>
          <Modal.Body>
            <PainelLead lead={lead} onSalvar={salvar} onIgnorar={ignorar} salvando={salvando} />
          </Modal.Body>
        </Modal>
      )}
    </div>
  )
}
