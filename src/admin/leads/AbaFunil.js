import { useMemo, useState } from 'react'
import SearchInput from '../../design-system/components/SearchInput'
import EmptyState from '../../design-system/components/EmptyState'
import { COLUNAS, formatarTelefone, tempoDesde, formatarDataCurta } from './utils'

// O board de sempre, agora como visão de planejamento ao lado da caixa.
// Clicar num card abre a conversa; arrastar move a etapa.
// "Criou conta" e "Pagante" continuam sendo promovidas sozinhas por
// sync_mensalli_leads() — o arrasto manual sobrescreve quando preciso.

export default function AbaFunil({ inbox, onAbrirConversa }) {
  const { leads, moverStatus } = inbox
  const [busca, setBusca] = useState('')

  const filtrados = useMemo(() => {
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
    filtrados.forEach(l => { if (mapa[l.status]) mapa[l.status].push(l) })
    return mapa
  }, [filtrados])

  const mover = async (leadId, status) => {
    try {
      await moverStatus(leadId, status)
    } catch (e) {
      window.alert('Não consegui mover o lead: ' + e.message)
    }
  }

  if (leads.length === 0) {
    return (
      <EmptyState
        icon="mdi:whatsapp"
        title="Nenhum lead ainda"
        description="Assim que alguém mandar mensagem pro WhatsApp do Mensalli, o card aparece aqui automaticamente."
      />
    )
  }

  return (
    <div>
      <div style={{ width: '280px', maxWidth: '100%', marginBottom: '14px' }}>
        <SearchInput value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone..." size="sm" fullWidth />
      </div>

      <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '12px', alignItems: 'flex-start' }}>
        {COLUNAS.map(col => (
          <div
            key={col.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const leadId = e.dataTransfer.getData('leadId')
              if (leadId) mover(leadId, col.id)
            }}
            style={{
              flex: '1 1 240px', minWidth: '240px',
              backgroundColor: col.bg, borderRadius: '12px', padding: '12px', minHeight: '380px'
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

            {porColuna[col.id].map(lead => (
              <div
                key={lead.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('leadId', lead.id)}
                onClick={() => onAbrirConversa(lead.id)}
                style={{
                  backgroundColor: '#fff', borderRadius: '8px', padding: '10px',
                  marginBottom: '8px', cursor: 'pointer',
                  border: lead.esperando_resposta ? '1px solid #fecaca' : '1px solid #e2e8f0',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  {lead.esperando_resposta && (
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
                    {lead.proximo_toque_em && (
                      <span title={`Próximo toque em ${formatarDataCurta(lead.proximo_toque_em)}`}
                        style={{ fontSize: '10px', backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '4px', padding: '1px 5px' }}>
                        📌 {formatarDataCurta(lead.proximo_toque_em)}
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
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
