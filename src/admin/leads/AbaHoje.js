import { useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import Button from '../../design-system/components/Button'
import EmptyState from '../../design-system/components/EmptyState'
import { sugerirAtalho } from './Composer'
import { FILAS, formatarDataCurta, hojeISO, tempoDesde, resolverVariaveis } from './utils'

// A fila de follow-up: quem precisa de um toque hoje, e qual toque é.
//
// É a parte do playbook que costuma morrer na memória. A data do próximo toque
// é agendada sozinha a cada mensagem enviada (na edge function), então esta
// aba é só a colheita.

export default function AbaHoje({ inbox, respostas, onAbrirConversa }) {
  const { leads, salvarLead } = inbox
  const [adiando, setAdiando] = useState(null)
  const hoje = hojeISO()

  const vencidos = useMemo(() => (
    leads
      .filter(l => l.toque_vencido && l.status !== 'perdido')
      .sort((a, b) => String(a.proximo_toque_em).localeCompare(String(b.proximo_toque_em)))
  ), [leads])

  const lembretes = useMemo(() => (
    leads.filter(l => l.retornar_em && l.retornar_em <= hoje && !l.toque_vencido && l.status !== 'perdido')
  ), [leads, hoje])

  const adiar = async (lead, dias) => {
    setAdiando(lead.id)
    const d = new Date()
    d.setDate(d.getDate() + dias)
    try {
      await salvarLead(lead.id, { proximo_toque_em: d.toISOString().slice(0, 10) })
    } catch (e) {
      window.alert('Não consegui adiar: ' + e.message)
    } finally {
      setAdiando(null)
    }
  }

  const encerrarFila = async (lead) => {
    try {
      await salvarLead(lead.id, { proximo_toque_em: null })
    } catch (e) {
      window.alert('Erro: ' + e.message)
    }
  }

  if (vencidos.length === 0 && lembretes.length === 0) {
    return (
      <EmptyState
        icon="mdi:calendar-check"
        title="Nenhum toque pendente hoje"
        description="Quando você põe um lead numa fila de follow-up, a data do próximo toque é agendada sozinha a cada mensagem enviada — e ele aparece aqui no dia."
      />
    )
  }

  const Cartao = ({ lead, tipo }) => {
    const fila = FILAS.find(f => f.id === lead.fila)
    const atalho = sugerirAtalho(lead)
    const resposta = atalho ? respostas.find(r => r.atalho === atalho) : null
    const previa = resposta ? resolverVariaveis(resposta.texto, lead) : null

    return (
      <div style={{
        border: '1px solid #e2e8f0', borderLeft: `4px solid ${fila?.cor || '#94a3b8'}`,
        borderRadius: '10px', padding: '12px 14px', backgroundColor: '#fff', marginBottom: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
          <strong style={{ fontSize: '14px', color: '#0f172a' }}>{lead.nome || 'Sem nome'}</strong>
          {fila && (
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: fila.cor, border: `1px solid ${fila.cor}`, borderRadius: '4px', padding: '1px 5px' }}>
              FILA {fila.id} · TOQUE {(lead.toque_num || 0) + 1}
            </span>
          )}
          {lead.plano_pago && (
            <span style={{ fontSize: '10px', fontWeight: 700, backgroundColor: '#dcfce7', color: '#166534', borderRadius: '4px', padding: '1px 5px' }}>PAGANTE</span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: '11.5px', color: '#b45309' }}>
            {tipo === 'lembrete'
              ? `lembrete de ${formatarDataCurta(lead.retornar_em)}`
              : `agendado para ${formatarDataCurta(lead.proximo_toque_em)}`}
          </span>
        </div>

        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
          Última conversa {tempoDesde(lead.ultima_interacao)}
          {lead.alunos ? ` · ${lead.alunos} alunos` : ''}
          {lead.nicho ? ` · ${lead.nicho}` : ''}
        </div>

        {previa && (
          <div style={{
            backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
            padding: '9px 11px', fontSize: '12px', color: '#475569', whiteSpace: 'pre-line',
            marginBottom: '10px', maxHeight: '110px', overflow: 'hidden', position: 'relative'
          }}>
            <div style={{ fontSize: '10.5px', color: '#94a3b8', marginBottom: '4px' }}>
              Sugestão do playbook · /{resposta.atalho}
            </div>
            {previa}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button variant="primary" size="sm" icon="mdi:message-text-outline" onClick={() => onAbrirConversa(lead.id)}>
            Abrir conversa
          </Button>
          <Button variant="outline" size="sm" loading={adiando === lead.id} onClick={() => adiar(lead, 1)}>
            Adiar 1 dia
          </Button>
          <Button variant="ghost" size="sm" onClick={() => encerrarFila(lead)}>
            Tirar da fila
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '760px' }}>
      {vencidos.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', margin: '0 0 10px' }}>
            <Icon icon="mdi:calendar-clock" width="18" color="#b45309" />
            <h2 style={{ fontSize: '15px', margin: 0, color: '#0f172a' }}>
              {vencidos.length} toque(s) de follow-up para hoje
            </h2>
          </div>
          {vencidos.map(l => <Cartao key={l.id} lead={l} tipo="toque" />)}
        </>
      )}

      {lembretes.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', margin: '22px 0 10px' }}>
            <Icon icon="mdi:pin-outline" width="18" color="#64748b" />
            <h2 style={{ fontSize: '15px', margin: 0, color: '#0f172a' }}>
              {lembretes.length} lembrete(s) que você marcou
            </h2>
          </div>
          {lembretes.map(l => <Cartao key={l.id} lead={l} tipo="lembrete" />)}
        </>
      )}
    </div>
  )
}
