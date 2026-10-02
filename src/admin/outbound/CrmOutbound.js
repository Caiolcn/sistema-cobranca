import { useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import SearchInput from '../../design-system/components/SearchInput'
import EmptyState from '../../design-system/components/EmptyState'
import Modal from '../../design-system/components/Modal'
import Button from '../../design-system/components/Button'
import Select from '../../design-system/components/Select'
import { hojeISO, formatarDataCurta } from '../leads/utils'
import { diasNaEtapa, diasEntre } from '../leads/funilFollowup'
import {
  COLUNAS_OUTBOUND, PROXIMO_PASSO, tituloEtapa, linkWhatsApp, linkInstagram, textoParaIA
} from './utils'
import { estiloColuna, ESTILO_CARD, ESTILO_TITULO_COLUNA, ESTILO_HINT_COLUNA } from '../kanbanEstilo'

// CRM do outbound no mesmo formato do Funil de leads: arrastar move a etapa,
// o card mostra há quantos dias está ali e o que fazer em seguida, e a coluna
// põe o mais urgente no topo.

const diaBRT = (iso) => iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) : null
const somarDias = (dia, n) => {
  const d = new Date(dia + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Abordado → follow-up em 2 dias; follow-up → sem resposta em 3.
function proximaAcao(lead) {
  const base = diaBRT(lead.etapa_desde)
  if (!base) return null
  if (lead.status === 'abordado') return { due: somarDias(base, 2), label: 'Follow-up' }
  if (lead.status === 'follow_up') return { due: somarDias(base, 3), label: '→ Sem resposta' }
  return null
}

function Tag({ bg, cor, icon, children, title, forte }) {
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      fontSize: '10.5px', backgroundColor: bg, color: cor, borderRadius: '5px',
      padding: '1px 6px', fontWeight: forte ? 700 : 600, whiteSpace: 'nowrap'
    }}>
      {icon && <Icon icon={icon} width="11" />}
      {children}
    </span>
  )
}

function TagAcao({ acao }) {
  if (!acao) return null
  const falta = diasEntre(hojeISO(), acao.due)
  if (falta < 0) return <Tag bg="#fee2e2" cor="#b91c1c" icon="mdi:alarm" forte>{acao.label} · atrasado {-falta}d</Tag>
  if (falta === 0) return <Tag bg="#fef3c7" cor="#92400e" icon="mdi:alarm" forte>{acao.label} · hoje</Tag>
  return <Tag bg="#f1f5f9" cor="#475569" icon="mdi:alarm">{acao.label} · em {falta}d</Tag>
}

// Ícones de contato no card: abrem fora sem abrir a ficha
function LinksContato({ lead, tamanho = 15 }) {
  const links = [
    { href: linkWhatsApp(lead.telefone), icon: 'mdi:whatsapp', title: 'Abrir no WhatsApp', cor: '#16a34a' },
    { href: linkInstagram(lead.instagram_handle), icon: 'mdi:instagram', title: 'Abrir Instagram', cor: '#c026d3' },
    { href: lead.google_maps_url, icon: 'mdi:map-marker-outline', title: 'Ver no Maps', cor: '#2563eb' }
  ].filter(l => l.href)
  return (
    <span style={{ display: 'inline-flex', gap: '8px' }}>
      {links.map(l => (
        <a key={l.icon} href={l.href} target="_blank" rel="noreferrer" title={l.title}
          onClick={(e) => e.stopPropagation()} style={{ color: l.cor, display: 'inline-flex' }}>
          <Icon icon={l.icon} width={tamanho} />
        </a>
      ))}
    </span>
  )
}

function CardOutbound({ lead, acao, onAbrir, onDragStart, onDragEnd }) {
  const dias = diasNaEtapa(lead)
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('outboundId', String(lead.id)); onDragStart() }}
      onDragEnd={onDragEnd}
      onClick={onAbrir}
      style={ESTILO_CARD}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '6px' }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: 'block', fontSize: '13px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.nome}
          </strong>
          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'capitalize' }}>{lead.vertical}</div>
        </div>
        <div title="Dias nesta etapa" style={{
          flexShrink: 0, textAlign: 'center', minWidth: '34px', borderRadius: '7px', padding: '2px 5px',
          backgroundColor: dias >= 7 ? '#fef3c7' : '#f1f5f9', color: dias >= 7 ? '#92400e' : '#475569'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 800, lineHeight: 1.1 }}>{dias === 0 ? 'hoje' : dias}</div>
          {dias > 0 && <div style={{ fontSize: '9px', fontWeight: 600 }}>{dias === 1 ? 'dia' : 'dias'}</div>}
        </div>
      </div>

      {(acao || lead.trial_id) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
          <TagAcao acao={acao} />
          {lead.trial_id && lead.status !== 'trial_criado' && lead.status !== 'fechado' && (
            <Tag bg="#cffafe" cor="#155e75" icon="mdi:link-variant">tem conta</Tag>
          )}
        </div>
      )}

      {lead.notas && (
        <div title={lead.notas} style={{
          fontSize: '11.5px', color: '#78350f', backgroundColor: '#fffbeb', borderRadius: '5px',
          padding: '4px 6px', marginTop: '6px', lineHeight: 1.3,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
        }}>
          📝 {lead.notas}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '7px', fontSize: '10.5px', color: '#94a3b8' }}>
        <LinksContato lead={lead} />
        {lead.dados_google?.nota && <span>⭐ {lead.dados_google.nota}</span>}
      </div>
    </div>
  )
}

function FichaOutbound({ lead, onFechar, onSalvar }) {
  const [status, setStatus] = useState(lead.status)
  const [notas, setNotas] = useState(lead.notas || '')
  const [salvando, setSalvando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const passo = PROXIMO_PASSO[lead.status]
  const g = lead.dados_google || {}

  const salvar = async (extra = {}) => {
    setSalvando(true)
    try {
      await onSalvar({ status, notas: notas.trim() || null, ...extra })
      onFechar()
    } catch (e) {
      window.alert('Não consegui salvar: ' + e.message)
    } finally {
      setSalvando(false)
    }
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoParaIA(lead))
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      window.prompt('Copie os dados:', textoParaIA(lead))
    }
  }

  const dias = diasNaEtapa(lead)

  return (
    <Modal isOpen onClose={onFechar} size="md" title={lead.nome}
      subtitle={`${lead.vertical} · ${dias === 0 ? 'entrou hoje' : `${dias} dias`} em ${tituloEtapa(lead.status)}`}>
      <Modal.Body>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '12.5px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {lead.telefone && <span><Icon icon="mdi:phone" width="13" /> {lead.telefone}</span>}
              {g.nota && <span>⭐ {g.nota} ({g.avaliacoes || 0} avaliações no Google)</span>}
              {g.endereco && <span style={{ color: '#64748b' }}>{g.endereco}</span>}
            </div>
            <LinksContato lead={lead} tamanho={20} />
          </div>

          <div style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <span>Importado em {formatarDataCurta(diaBRT(lead.criado_em + 'Z'))}</span>
            {lead.data_abordagem && <span>Abordado em {formatarDataCurta(diaBRT(lead.data_abordagem + 'Z'))}</span>}
            {lead.data_resposta && <span>Respondeu em {formatarDataCurta(diaBRT(lead.data_resposta + 'Z'))}</span>}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button variant="outline" size="sm" icon={copiado ? 'mdi:check' : 'mdi:content-copy'} onClick={copiar}>
              {copiado ? 'Copiado' : 'Copiar dados p/ IA'}
            </Button>
            {passo && (
              <Button variant="primary" size="sm" icon={passo.icon} loading={salvando}
                onClick={() => salvar({ status: passo.para })}>
                {passo.label}
              </Button>
            )}
          </div>

          <Select label="Etapa" size="sm" fullWidth value={status} onChange={setStatus}
            options={COLUNAS_OUTBOUND.map(c => ({ value: c.id, label: c.auto ? `${c.titulo} (auto)` : c.titulo }))} />

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>Anotação</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3}
              placeholder="Ex: falei com a recepção, dono volta segunda / 120 alunos / usa planilha"
              style={{ width: '100%', padding: '9px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" loading={salvando} onClick={() => salvar()}>Salvar</Button>
      </Modal.Footer>
    </Modal>
  )
}

export default function CrmOutbound({ leads, onSalvar }) {
  const [busca, setBusca] = useState('')
  const [nicho, setNicho] = useState('')
  const [soHoje, setSoHoje] = useState(false)
  const [fichaId, setFichaId] = useState(null)
  const [arrastando, setArrastando] = useState(false)
  const [sobre, setSobre] = useState(null)

  const hoje = hojeISO()
  const comAcao = useMemo(() => leads.map(l => ({ lead: l, acao: proximaAcao(l) })), [leads])
  const fila = comAcao.filter(x => x.acao && x.acao.due <= hoje).length

  const nichos = useMemo(() => [...new Set(leads.map(l => l.vertical).filter(Boolean))].sort(), [leads])

  const porColuna = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const digitos = termo.replace(/\D/g, '')
    const lista = comAcao.filter(({ lead: l, acao }) =>
      (!nicho || l.vertical === nicho) &&
      (!soHoje || (acao && acao.due <= hoje)) &&
      (!termo ||
        (l.nome || '').toLowerCase().includes(termo) ||
        (l.notas || '').toLowerCase().includes(termo) ||
        (digitos && String(l.telefone || '').replace(/\D/g, '').includes(digitos)))
    )
    const mapa = {}
    COLUNAS_OUTBOUND.forEach(c => { mapa[c.id] = [] })
    lista.forEach(x => { if (mapa[x.lead.status]) mapa[x.lead.status].push(x) })
    // Ação mais vencida em cima; sem ação, quem está há mais tempo na etapa
    Object.values(mapa).forEach(col => col.sort((a, b) => {
      const da = a.acao?.due || '9999-12-31'
      const db = b.acao?.due || '9999-12-31'
      if (da !== db) return da.localeCompare(db)
      return String(a.lead.etapa_desde || '').localeCompare(String(b.lead.etapa_desde || ''))
    }))
    return mapa
  }, [comAcao, busca, nicho, soHoje, hoje])

  const mover = async (id, status) => {
    const lead = leads.find(l => String(l.id) === String(id))
    if (!lead || lead.status === status) return
    try {
      await onSalvar(lead.id, { status })
    } catch (e) {
      window.alert('Não consegui mover: ' + e.message)
    }
  }

  const leadFicha = fichaId != null && leads.find(l => l.id === fichaId)

  if (leads.length === 0) {
    return (
      <EmptyState icon="mdi:phone-outgoing" title="Nenhum contato ainda"
        description="Importe a lista do dia na aba Lista do dia e os contatos aparecem aqui." />
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ width: '260px', maxWidth: '100%' }}>
          <SearchInput value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome, telefone ou anotação..." size="sm" fullWidth />
        </div>
        <div style={{ width: '180px' }}>
          {/* value '' o Select trata como vazio e mostra "Selecionar..." */}
          <Select size="sm" fullWidth value={nicho || 'todos'} onChange={(v) => setNicho(v === 'todos' ? '' : v)}
            options={[{ value: 'todos', label: 'Todos os nichos' }, ...nichos.map(n => ({ value: n, label: n }))]} />
        </div>
        <Button variant="outline" size="sm" icon="mdi:calendar-today"
          selected={soHoje} selectedTone="warning" onClick={() => setSoHoje(v => !v)}>
          Fila de hoje ({fila})
        </Button>
      </div>

      <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '12px', alignItems: 'flex-start' }}>
        {COLUNAS_OUTBOUND.map(col => {
          const lista = porColuna[col.id]
          const vencidos = lista.filter(x => x.acao && x.acao.due <= hoje).length
          return (
            <div
              key={col.id}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => setSobre(col.id)}
              onDrop={(e) => {
                e.preventDefault()
                setArrastando(false)
                setSobre(null)
                const id = e.dataTransfer.getData('outboundId')
                if (id) mover(id, col.id)
              }}
              style={estiloColuna(col, arrastando && sobre === col.id)}
            >
              <div style={ESTILO_TITULO_COLUNA}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: col.cor }} />
                  <strong style={{ fontSize: '13px', color: '#334155' }}>{col.titulo}</strong>
                  {col.auto && (
                    <span title="Preenchida automaticamente" style={{ fontSize: '9.5px', color: col.cor, border: `1px solid ${col.cor}`, borderRadius: '4px', padding: '0 4px', fontWeight: 600 }}>
                      AUTO
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
                  {vencidos > 0 && <span title="Pra fazer hoje ou atrasados" style={{ color: '#b45309', marginRight: '5px' }}>{vencidos}!</span>}
                  {lista.length}
                </span>
              </div>
              <div style={ESTILO_HINT_COLUNA}>{col.hint}</div>

              {lista.map(({ lead, acao }) => (
                <CardOutbound key={lead.id} lead={lead} acao={acao}
                  onAbrir={() => setFichaId(lead.id)}
                  onDragStart={() => setArrastando(true)}
                  onDragEnd={() => { setArrastando(false); setSobre(null) }} />
              ))}
            </div>
          )
        })}
      </div>

      {leadFicha && (
        <FichaOutbound
          key={`${leadFicha.id}:${leadFicha.status}`}
          lead={leadFicha}
          onFechar={() => setFichaId(null)}
          onSalvar={(patch) => onSalvar(leadFicha.id, patch)}
        />
      )}
    </div>
  )
}
