import { Icon } from '@iconify/react'
import SearchInput from '../../design-system/components/SearchInput'
import { formatarTelefone, tempoDesde } from './utils'

// Lista da caixa de entrada. A ordem é de quem está esperando há mais tempo,
// não de quem chegou por último: a fila é de dívida sua, não de novidade.

export const FILTROS = [
  { id: 'esperando', rotulo: 'Esperando você', icone: 'mdi:message-alert-outline' },
  { id: 'todas',     rotulo: 'Todas',          icone: 'mdi:inbox-outline' },
  { id: 'clientes',  rotulo: 'Clientes',       icone: 'mdi:account-check-outline' },
  { id: 'hoje',      rotulo: 'Toque hoje',     icone: 'mdi:calendar-clock' },
  { id: 'perdidos',  rotulo: 'Perdidos',       icone: 'mdi:account-off-outline' }
]

export function aplicarFiltro(leads, filtro) {
  switch (filtro) {
    case 'esperando': return leads.filter(l => l.esperando_resposta)
    case 'clientes':  return leads.filter(l => l.usuario_id)
    case 'hoje':      return leads.filter(l => l.toque_vencido)
    case 'perdidos':  return leads.filter(l => l.status === 'perdido')
    default:          return leads.filter(l => l.status !== 'perdido')
  }
}

export function ordenarFila(leads) {
  // Esperando resposta primeiro, e dentro disso o mais antigo no topo —
  // é o que estoura o SLA de 5 minutos do playbook.
  return [...leads].sort((a, b) => {
    if (a.esperando_resposta !== b.esperando_resposta) return a.esperando_resposta ? -1 : 1
    if (a.esperando_resposta) return new Date(a.ultima_interacao) - new Date(b.ultima_interacao)
    return new Date(b.ultima_interacao) - new Date(a.ultima_interacao)
  })
}

const iniciais = (nome) => {
  const partes = String(nome || '?').trim().split(/\s+/).slice(0, 2)
  return partes.map(p => p[0]).join('').toUpperCase() || '?'
}

export default function ListaConversas({
  leads, selecionadoId, onSelecionar,
  busca, onBusca, filtro, onFiltro, contadores, isMobile
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, backgroundColor: '#fff' }}>
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #f1f5f9' }}>
        <SearchInput
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          size="sm"
          fullWidth
        />
        <div style={{ display: 'flex', gap: '6px', marginTop: '9px', overflowX: 'auto', paddingBottom: '2px' }}>
          {FILTROS.map(f => {
            const ativo = filtro === f.id
            const n = contadores?.[f.id]
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onFiltro(f.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap',
                  fontSize: '12px', fontWeight: ativo ? 600 : 500, cursor: 'pointer',
                  color: ativo ? '#fff' : '#475569',
                  backgroundColor: ativo ? '#334155' : '#f1f5f9',
                  border: '1px solid ' + (ativo ? '#334155' : '#e2e8f0'),
                  borderRadius: '999px', padding: '5px 11px'
                }}
              >
                <Icon icon={f.icone} width="13" />
                {f.rotulo}
                {n > 0 && (
                  <span style={{
                    fontSize: '10.5px', fontWeight: 700,
                    color: ativo ? '#334155' : '#fff',
                    backgroundColor: ativo ? '#fff' : '#94a3b8',
                    borderRadius: '999px', padding: '0 5px', minWidth: '17px', textAlign: 'center'
                  }}>{n}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {leads.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            Nada nesta lista agora.
          </div>
        ) : leads.map(lead => {
          const ativo = lead.id === selecionadoId
          const esperando = lead.esperando_resposta
          return (
            <button
              key={lead.id}
              type="button"
              onClick={() => onSelecionar(lead)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                border: 'none', borderBottom: '1px solid #f1f5f9',
                borderLeft: `3px solid ${ativo ? '#334155' : esperando ? '#ef4444' : 'transparent'}`,
                backgroundColor: ativo ? '#f1f5f9' : '#fff',
                padding: '10px 12px'
              }}
            >
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                  backgroundColor: lead.plano_pago ? '#dcfce7' : lead.usuario_id ? '#cffafe' : '#e2e8f0',
                  color: lead.plano_pago ? '#166534' : lead.usuario_id ? '#155e75' : '#475569',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 700
                }}>
                  {iniciais(lead.nome)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <strong style={{
                      fontSize: '13px', color: '#0f172a', flex: 1, minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {lead.nome || formatarTelefone(lead.telefone)}
                    </strong>
                    <span style={{ fontSize: '10.5px', color: esperando ? '#b91c1c' : '#94a3b8', flexShrink: 0 }}>
                      {tempoDesde(lead.ultima_interacao)}
                    </span>
                  </div>

                  <div style={{
                    fontSize: '12px', color: '#64748b', marginTop: '2px', lineHeight: 1.3,
                    display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden'
                  }}>
                    {lead.ultima_direcao === 'out' && <span style={{ color: '#94a3b8' }}>Você: </span>}
                    {lead.ultima_mensagem || <span style={{ fontStyle: 'italic' }}>sem mensagem</span>}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '5px', flexWrap: 'wrap' }}>
                    {lead.nao_lidas > 0 && (
                      <span style={{
                        fontSize: '10px', fontWeight: 700, color: '#fff', backgroundColor: '#16a34a',
                        borderRadius: '999px', padding: '1px 6px'
                      }}>{lead.nao_lidas}</span>
                    )}
                    {lead.plano_pago && (
                      <span style={{ fontSize: '9.5px', fontWeight: 700, backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px', padding: '1px 5px' }}>PAGANTE</span>
                    )}
                    {!lead.plano_pago && lead.usuario_id && (
                      <span style={{ fontSize: '9.5px', fontWeight: 700, backgroundColor: '#cffafe', color: '#155e75', borderRadius: '4px', padding: '1px 5px' }}>TRIAL</span>
                    )}
                    {lead.toque_vencido && (
                      <span title="Follow-up vencido" style={{ fontSize: '9.5px', fontWeight: 700, backgroundColor: '#fef3c7', color: '#92400e', borderRadius: '4px', padding: '1px 5px' }}>
                        TOQUE {lead.fila || ''}
                      </span>
                    )}
                    {lead.alunos ? (
                      <span style={{ fontSize: '9.5px', color: '#64748b', backgroundColor: '#f1f5f9', borderRadius: '4px', padding: '1px 5px' }}>
                        {lead.alunos} alunos
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
