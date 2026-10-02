import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useUser } from '../contexts/UserContext'
import { getLeads, updateLead, createBulkLeads } from '../api/outbound'
import Button from '../design-system/components/Button'
import Tabs from '../design-system/components/Tabs'
import Modal from '../design-system/components/Modal'
import StatCard from '../design-system/components/StatCard'
import EmptyState from '../design-system/components/EmptyState'
import CrmOutbound from './outbound/CrmOutbound'
import { COLUNAS_OUTBOUND, linkWhatsApp, linkInstagram, textoParaIA } from './outbound/utils'
import { hojeISO } from './leads/utils'
import './AbaOutbound.css'

// Outbound: lista do dia (10 contatos importados do Google), CRM em kanban e
// métricas. Tudo manual: nenhum card muda de etapa sozinho.

const ABAS = [
  { value: 'daily',    label: 'Lista do dia', icon: 'mdi:format-list-checks' },
  { value: 'crm',      label: 'CRM',          icon: 'mdi:view-column-outline' },
  { value: 'metricas', label: 'Métricas',     icon: 'mdi:chart-line' }
]

// criado_em é timestamp sem fuso gravado em UTC
const diaImportacao = (lead) => lead.criado_em
  ? new Date(lead.criado_em + 'Z').toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  : null

const ABORDADOS = ['abordado', 'follow_up', 'respondeu', 'nao_respondeu', 'trial_criado', 'fechado']
const foiAbordado = (l) => !!l.data_abordagem || ABORDADOS.includes(l.status)
const respondeu = (l) => !!l.data_resposta || ['respondeu', 'trial_criado', 'fechado'].includes(l.status)
const criouConta = (l) => !!l.trial_id || ['trial_criado', 'fechado'].includes(l.status)
const pct = (parte, total) => (total ? `${Math.round((parte / total) * 100)}%` : '—')

export default function AbaOutbound() {
  const { realUserId: instanceId } = useUser()
  const [params, setParams] = useSearchParams()
  const aba = ABAS.some(a => a.value === params.get('sub')) ? params.get('sub') : 'daily'
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [importando, setImportando] = useState(false)

  const irPara = (v) => {
    const p = new URLSearchParams(params)
    p.set('sub', v)
    setParams(p)
  }

  const loadData = useCallback(async () => {
    if (!instanceId) return
    try {
      setLeads(await getLeads(instanceId) || [])
    } catch (err) {
      console.error(err.message)
    } finally {
      setLoading(false)
    }
  }, [instanceId])

  useEffect(() => { loadData() }, [loadData])

  // Otimista: a tela muda na hora e o reload traz o que o trigger preencheu
  // (etapa_desde, data_abordagem, data_resposta).
  const salvar = useCallback(async (id, patch) => {
    const anterior = leads.find(l => l.id === id)
    setLeads(ls => ls.map(l => l.id === id
      ? { ...l, ...patch, ...(patch.status && patch.status !== l.status ? { etapa_desde: new Date().toISOString() } : {}) }
      : l))
    try {
      await updateLead(id, patch)
      loadData()
    } catch (e) {
      if (anterior) setLeads(ls => ls.map(l => (l.id === id ? anterior : l)))
      throw e
    }
  }, [leads, loadData])

  const hoje = hojeISO()
  const listaDoDia = useMemo(
    () => leads
      .filter(l => diaImportacao(l) === hoje)
      .sort((a, b) => (a.status === 'novo' ? 0 : 1) - (b.status === 'novo' ? 0 : 1)),
    [leads, hoje]
  )
  const abordadosHoje = listaDoDia.filter(l => l.status !== 'novo').length

  async function processarJSON(jsonString) {
    setImportando(true)
    try {
      const dados = JSON.parse(jsonString)
      let contatos = dados
      if (Array.isArray(contatos) && contatos.length === 1 && contatos[0]?.contatos) contatos = contatos[0].contatos
      else if (!Array.isArray(contatos) && contatos?.contatos) contatos = contatos.contatos
      else if (!Array.isArray(contatos)) contatos = [contatos]

      const inseridos = await createBulkLeads(instanceId, contatos)
      const repetidos = contatos.length - inseridos.length
      await loadData()
      setShowImportModal(false)
      setJsonText('')
      alert(`✅ ${inseridos.length} contatos importados` + (repetidos > 0 ? ` (${repetidos} já existiam e foram ignorados)` : ''))
    } catch (err) {
      alert(`❌ Erro ao importar: ${err.message}`)
    } finally {
      setImportando(false)
    }
  }

  async function handleImportJSON(event) {
    const file = event.target.files[0]
    if (!file) return
    await processarJSON(await file.text())
    event.target.value = ''
  }

  const copiar = (lead) => {
    navigator.clipboard.writeText(lead.dados_google ? textoParaIA(lead) : lead.mensagem_template || '')
    setCopiedId(lead.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const mudarStatus = async (lead, status) => {
    try { await salvar(lead.id, { status }) } catch (e) { alert(`Erro: ${e.message}`) }
  }

  // ---------- métricas ----------
  const metricas = useMemo(() => {
    const abordados = leads.filter(foiAbordado)
    const resp = abordados.filter(respondeu)
    const contas = leads.filter(criouConta)
    const fechados = leads.filter(l => l.status === 'fechado')
    const porNicho = {}
    leads.forEach(l => {
      const n = l.vertical || '—'
      porNicho[n] = porNicho[n] || { nicho: n, importados: 0, abordados: 0, responderam: 0, contas: 0 }
      porNicho[n].importados++
      if (foiAbordado(l)) porNicho[n].abordados++
      if (foiAbordado(l) && respondeu(l)) porNicho[n].responderam++
      if (criouConta(l)) porNicho[n].contas++
    })
    return {
      abordados: abordados.length, responderam: resp.length, contas: contas.length, fechados: fechados.length,
      porNicho: Object.values(porNicho).sort((a, b) => b.abordados - a.abordados)
    }
  }, [leads])

  const contagem = (id) => leads.filter(l => l.status === id).length

  return (
    <div className="aba-outbound">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <Tabs
          variant="segmented"
          value={aba}
          onChange={irPara}
          items={ABAS.map(a => ({
            ...a,
            count: a.value === 'daily' ? listaDoDia.length : a.value === 'crm' ? leads.length : undefined
          }))}
        />
        <Button variant="outline" size="sm" icon="mdi:refresh" loading={loading}
          onClick={() => { setLoading(true); loadData() }}>
          Atualizar
        </Button>
      </div>

      {loading && leads.length === 0 && <p className="loading">Carregando...</p>}

      {/* LISTA DO DIA */}
      {aba === 'daily' && !(loading && leads.length === 0) && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: '17px', color: '#0f172a' }}>Contatos para abordar hoje</h3>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                {new Date().toLocaleDateString('pt-BR')}
                {listaDoDia.length > 0 && <> · <strong style={{ color: abordadosHoje === listaDoDia.length ? '#16a34a' : '#334155' }}>{abordadosHoje} de {listaDoDia.length} abordados</strong></>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <label style={{ cursor: 'pointer' }}>
                <Button variant="primary" icon="mdi:upload" as="span" loading={importando}>Importar JSON</Button>
                <input type="file" accept=".json" onChange={handleImportJSON} style={{ display: 'none' }} disabled={importando} />
              </label>
              <Button variant="outline" icon="mdi:content-paste" onClick={() => setShowImportModal(true)}>Colar JSON</Button>
            </div>
          </div>

          {listaDoDia.length === 0 ? (
            <EmptyState icon="mdi:format-list-checks" title="Nenhum contato hoje"
              description="Importe o JSON da lista do dia para começar." />
          ) : (
            <div className="leads-grid">
              {listaDoDia.map(lead => {
                const feito = lead.status !== 'novo'
                const etapa = COLUNAS_OUTBOUND.find(c => c.id === lead.status)
                return (
                  <div key={lead.id} className="lead-card" style={feito ? { opacity: 0.6 } : undefined}>
                    <div className="lead-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="vertical-badge">{String(lead.vertical || '').toUpperCase()}</span>
                      {feito && etapa && (
                        <span style={{ fontSize: '11px', fontWeight: 700, color: etapa.cor }}>
                          <Icon icon="mdi:check-circle" width="13" style={{ verticalAlign: '-2px' }} /> {etapa.titulo}
                        </span>
                      )}
                    </div>

                    <h4>{lead.nome}</h4>

                    <div className="lead-contacts">
                      {lead.instagram_handle && (
                        <a href={linkInstagram(lead.instagram_handle)} target="_blank" rel="noreferrer">
                          <Icon icon="mdi:instagram" /> @{lead.instagram_handle}
                        </a>
                      )}
                      {lead.telefone && (
                        <a href={linkWhatsApp(lead.telefone)} target="_blank" rel="noreferrer">
                          <Icon icon="mdi:whatsapp" /> {lead.telefone}
                        </a>
                      )}
                      {lead.google_maps_url && (
                        <a href={lead.google_maps_url} target="_blank" rel="noreferrer">
                          <Icon icon="mdi:map-marker-outline" /> Ver no Maps
                        </a>
                      )}
                    </div>

                    <div className="lead-message">
                      <p style={{ whiteSpace: 'pre-line' }}>
                        {lead.dados_google
                          ? [
                              lead.dados_google.nota && `⭐ ${lead.dados_google.nota} (${lead.dados_google.avaliacoes || 0} avaliações)`,
                              lead.dados_google.endereco
                            ].filter(Boolean).join('\n')
                          : lead.mensagem_template}
                      </p>
                      <button className={`copy-btn ${copiedId === lead.id ? 'copied' : ''}`} onClick={() => copiar(lead)}>
                        <Icon icon={copiedId === lead.id ? 'mdi:check' : 'mdi:content-copy'} />
                        {' '}{copiedId === lead.id ? 'Copiado!' : lead.dados_google ? 'Copiar dados p/ IA' : 'Copiar'}
                      </button>
                    </div>

                    {!feito && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                        <Button variant="primary" size="sm" icon="mdi:send-outline" fullWidth onClick={() => mudarStatus(lead, 'abordado')}>
                          Abordei
                        </Button>
                        <Button variant="ghost" size="sm" icon="mdi:close" onClick={() => mudarStatus(lead, 'descartado')}>
                          Descartar
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* CRM */}
      {aba === 'crm' && !(loading && leads.length === 0) && (
        <CrmOutbound leads={leads} onSalvar={salvar} />
      )}

      {/* MÉTRICAS */}
      {aba === 'metricas' && !(loading && leads.length === 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', maxWidth: '1000px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
            <StatCard label="Abordados" value={metricas.abordados} icon="mdi:send-outline" accent="info"
              hint={`de ${leads.length} importados`} />
            <StatCard label="Responderam" value={metricas.responderam} icon="mdi:reply-outline" accent="primary"
              hint={`${pct(metricas.responderam, metricas.abordados)} dos abordados`} />
            <StatCard label="Criaram conta" value={metricas.contas} icon="mdi:account-plus-outline" accent="info"
              hint={`${pct(metricas.contas, metricas.abordados)} dos abordados`} />
            <StatCard label="Fechados" value={metricas.fechados} icon="mdi:check-decagram-outline" accent="success"
              hint={`${pct(metricas.fechados, metricas.abordados)} dos abordados`} />
          </div>

          <div>
            <h3 style={{ margin: '0 0 10px', fontSize: '15px', color: '#334155' }}>Por etapa</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
              {COLUNAS_OUTBOUND.map(c => (
                <div key={c.id} style={{ backgroundColor: c.bg, borderRadius: '10px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12.5px', color: '#334155' }}>{c.titulo}</span>
                  <strong style={{ color: c.cor }}>{contagem(c.id)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: '15px', color: '#334155' }}>Por nicho</h3>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>Qual nicho responde mais: é onde vale gastar a lista.</div>
            {metricas.porNicho.length === 0 ? (
              <div style={{ fontSize: '13px', color: '#94a3b8' }}>Sem dados ainda.</div>
            ) : (
              <table className="crm-table">
                <thead>
                  <tr><th>Nicho</th><th>Importados</th><th>Abordados</th><th>Responderam</th><th>% resposta</th><th>Criaram conta</th></tr>
                </thead>
                <tbody>
                  {metricas.porNicho.map(n => (
                    <tr key={n.nicho}>
                      <td style={{ textTransform: 'capitalize' }}>{n.nicho}</td>
                      <td>{n.importados}</td>
                      <td>{n.abordados}</td>
                      <td>{n.responderam}</td>
                      <td>{pct(n.responderam, n.abordados)}</td>
                      <td>{n.contas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {showImportModal && (
        <Modal isOpen onClose={() => { setShowImportModal(false); setJsonText('') }} title="Colar JSON"
          subtitle="Cole aqui o JSON com os contatos do dia" size="md">
          <Modal.Body>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder='[{"nome": "...", "vertical": "...", ...}]'
              style={{ width: '100%', height: '300px', padding: '12px', border: '1px solid #d1d5db', borderRadius: '8px', fontFamily: 'monospace', fontSize: '12px', boxSizing: 'border-box' }}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline" onClick={() => { setShowImportModal(false); setJsonText('') }}>Cancelar</Button>
            <Button variant="primary" loading={importando} disabled={!jsonText.trim()} onClick={() => processarJSON(jsonText)}>
              Importar
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  )
}
