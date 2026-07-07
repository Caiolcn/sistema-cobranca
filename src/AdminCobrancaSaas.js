import { useState, useEffect, useCallback } from 'react'
import { useUser } from './contexts/UserContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import useWindowSize from './hooks/useWindowSize'
import { Icon } from '@iconify/react'

// Cobrança SaaS Automática — lembretes de vencimento do plano para os clientes
// pagantes do Mensalli (D-3 / no dia / D+3). Dispara pela edge function
// `cobranca-saas`, agendada no pg_cron às 9h BRT. Este painel liga/desliga,
// edita as mensagens e permite simular ou rodar na hora.

const BUCKETS = {
  venc_d3:      { label: '3 dias antes', icon: 'mdi:calendar-clock', cor: '#f97316', bg: '#fff7ed' },
  venc_hoje:    { label: 'Vence hoje',   icon: 'mdi:calendar-today', cor: '#f59e0b', bg: '#fffbeb' },
  venc_vencido: { label: '3 dias depois', icon: 'mdi:calendar-alert', cor: '#ef4444', bg: '#fef2f2' }
}

const TEMPLATE_ORDEM = [
  { tipo: 'venc_d3',      label: '📅 3 dias antes do vencimento' },
  { tipo: 'venc_hoje',    label: '⏰ No dia do vencimento' },
  { tipo: 'venc_vencido', label: '⚠️ 3 dias após o vencimento' }
]

const formatarValor = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatarData = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso + (String(iso).length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}
const formatarDataHora = (iso) => iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'

export default function AdminCobrancaSaas() {
  const { isAdmin, loading: userLoading, userId } = useUser()
  const navigate = useNavigate()
  const { isMobile } = useWindowSize()

  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState(null)
  const [alvos, setAlvos] = useState([])
  const [templates, setTemplates] = useState({})
  const [logs, setLogs] = useState([])
  const [salvandoFlag, setSalvandoFlag] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [testeNumero, setTesteNumero] = useState('')

  // Modal de templates
  const [templatesModal, setTemplatesModal] = useState(false)
  const [templatesEditando, setTemplatesEditando] = useState({})
  const [salvandoTmpl, setSalvandoTmpl] = useState(false)

  useEffect(() => {
    if (!userLoading && !isAdmin) navigate('/app/home')
  }, [isAdmin, userLoading, navigate])

  const carregar = useCallback(async () => {
    if (!isAdmin) { setLoading(false); return }
    setLoading(true)
    try {
      const [cfgRes, alvosRes, tmplRes, logsRes] = await Promise.all([
        supabase.from('mensalli_cobranca_saas_config').select('*').eq('id', true).maybeSingle(),
        supabase.from('vw_mensalli_cobranca_saas').select('*').order('data_vencimento', { ascending: true }),
        supabase.from('templates_admin').select('*').in('tipo', ['venc_d3', 'venc_hoje', 'venc_vencido']),
        supabase.from('retencao_saas_envios').select('*').eq('canal', 'crm_auto').order('created_at', { ascending: false }).limit(50)
      ])
      setConfig(cfgRes.data || { ativa: false })
      setAlvos(alvosRes.data || [])
      const tmap = {}
      ;(tmplRes.data || []).forEach(t => { tmap[t.tipo] = t })
      setTemplates(tmap)
      setLogs(logsRes.data || [])
    } catch (err) {
      console.error('Erro ao carregar cobrança SaaS:', err)
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => { carregar() }, [carregar])

  const toggleAtiva = async () => {
    const novoValor = !config?.ativa
    if (novoValor && !window.confirm('Ligar a cobrança automática? A partir de agora o sistema vai disparar WhatsApp de cobrança sozinho todo dia às 9h para os clientes pagantes nos marcos D-3, no dia e D+3.')) return
    setSalvandoFlag(true)
    try {
      const { error } = await supabase
        .from('mensalli_cobranca_saas_config')
        .update({ ativa: novoValor, updated_at: new Date().toISOString(), updated_by: userId })
        .eq('id', true)
      if (error) throw error
      setConfig(c => ({ ...c, ativa: novoValor }))
    } catch (err) {
      alert('Erro ao salvar: ' + err.message)
    } finally {
      setSalvandoFlag(false)
    }
  }

  const enviarTeste = async () => {
    const num = testeNumero.replace(/\D/g, '')
    if (num.length < 10) { alert('Digite um número com DDD (ex: 62 98161-8862).'); return }
    setRodando(true)
    setResultado(null)
    try {
      const { data, error } = await supabase.functions.invoke('cobranca-saas', {
        body: { testTo: num, testNome: 'Fulano (teste)' }
      })
      if (error) throw error
      setResultado({ teste: true, ...data })
    } catch (err) {
      setResultado({ erro: err.message || String(err) })
    } finally {
      setRodando(false)
    }
  }

  const executar = async ({ dryRun }) => {
    if (!dryRun && !window.confirm(`Disparar AGORA as ${alvos.length} cobrança(s) da lista via WhatsApp? Esta ação envia mensagens reais e não pode ser desfeita.`)) return
    setRodando(true)
    setResultado(null)
    try {
      const { data, error } = await supabase.functions.invoke('cobranca-saas', {
        body: dryRun ? { dryRun: true } : { force: true }
      })
      if (error) throw error
      setResultado({ dryRun, ...data })
      if (!dryRun) await carregar()
    } catch (err) {
      setResultado({ erro: err.message || String(err) })
    } finally {
      setRodando(false)
    }
  }

  const abrirTemplates = () => {
    setTemplatesEditando({
      venc_d3: templates.venc_d3?.mensagem || '',
      venc_hoje: templates.venc_hoje?.mensagem || '',
      venc_vencido: templates.venc_vencido?.mensagem || ''
    })
    setTemplatesModal(true)
  }

  const salvarTemplates = async () => {
    setSalvandoTmpl(true)
    try {
      for (const tipo of Object.keys(templatesEditando)) {
        await supabase.from('templates_admin')
          .update({ mensagem: templatesEditando[tipo], updated_at: new Date().toISOString() })
          .eq('tipo', tipo)
      }
      await carregar()
      setTemplatesModal(false)
    } catch (err) {
      alert('Erro ao salvar: ' + err.message)
    } finally {
      setSalvandoTmpl(false)
    }
  }

  if (userLoading || !isAdmin) return null

  const ativa = !!config?.ativa
  const contagem = {
    venc_d3: alvos.filter(a => a.bucket === 'venc_d3').length,
    venc_hoje: alvos.filter(a => a.bucket === 'venc_hoje').length,
    venc_vencido: alvos.filter(a => a.bucket === 'venc_vencido').length
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: '24px' }}>
        <button
          onClick={() => navigate('/app/admin')}
          style={{ background: 'transparent', border: 'none', color: '#667eea', cursor: 'pointer', fontSize: '13px', padding: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          <Icon icon="mdi:arrow-left" width="16" /> Voltar ao /admin
        </button>
        <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 'bold', color: '#333', margin: '0 0 6px 0' }}>
          Cobrança SaaS Automática
        </h1>
        <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
          Lembra os clientes pagantes de renovar o plano — 3 dias antes, no dia e 3 dias depois do vencimento.
          Dispara sozinho todo dia às 9h (BRT) pelo WhatsApp master.
        </p>
      </div>

      {/* Card principal: liga/desliga */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px',
        backgroundColor: ativa ? '#f0fdf4' : '#fff7ed',
        border: `1px solid ${ativa ? '#bbf7d0' : '#fed7aa'}`,
        borderRadius: '12px', padding: '18px 20px', marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: ativa ? '#dcfce7' : '#ffedd5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon icon={ativa ? 'mdi:robot-happy' : 'mdi:robot-off'} width="26" style={{ color: ativa ? '#16a34a' : '#ea580c' }} />
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1a1a1a' }}>
              {ativa ? 'Automação LIGADA' : 'Automação DESLIGADA'}
            </div>
            <div style={{ fontSize: '13px', color: '#666' }}>
              {ativa
                ? 'O sistema está disparando as cobranças automaticamente às 9h.'
                : 'Nada é enviado automaticamente. Você pode simular ou rodar na hora abaixo.'}
            </div>
          </div>
        </div>
        <button
          onClick={toggleAtiva}
          disabled={salvandoFlag}
          style={{
            padding: '12px 22px', borderRadius: '10px', border: 'none',
            backgroundColor: ativa ? '#ef4444' : '#16a34a', color: 'white',
            fontSize: '14px', fontWeight: 700, cursor: salvandoFlag ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px', opacity: salvandoFlag ? 0.6 : 1
          }}
        >
          <Icon icon={ativa ? 'mdi:pause' : 'mdi:play'} width="18" />
          {salvandoFlag ? 'Salvando...' : ativa ? 'Desligar automação' : 'Ligar automação'}
        </button>
      </div>

      {/* Contadores dos marcos + ações */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
        {TEMPLATE_ORDEM.map(({ tipo }) => {
          const b = BUCKETS[tipo]
          return (
            <div key={tipo} style={{ padding: '18px', borderLeft: `3px solid ${b.cor}`, backgroundColor: b.bg, borderRadius: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Icon icon={b.icon} width="20" style={{ color: b.cor }} />
                <span style={{ fontSize: '13px', color: '#666', fontWeight: 600 }}>{b.label}</span>
              </div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#333' }}>{contagem[tipo]}</div>
              <div style={{ fontSize: '12px', color: '#888' }}>cliente(s) na fila hoje</div>
            </div>
          )
        })}
      </div>

      {/* Enviar teste pro próprio número */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px', padding: '14px 16px', backgroundColor: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '10px' }}>
        <Icon icon="mdi:test-tube" width="20" style={{ color: '#0ea5e9' }} />
        <span style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>Testar:</span>
        <input
          value={testeNumero}
          onChange={(e) => setTesteNumero(e.target.value)}
          placeholder="Seu WhatsApp com DDD"
          style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', width: '220px', maxWidth: '100%' }}
        />
        <button onClick={enviarTeste} disabled={rodando}
          style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#0ea5e9', color: 'white', fontSize: '13px', fontWeight: 600, cursor: rodando ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: rodando ? 0.6 : 1 }}>
          <Icon icon="mdi:send" width="16" /> {rodando ? 'Enviando...' : 'Enviar os 3 modelos pra mim'}
        </button>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>Não toca em clientes nem grava histórico.</span>
      </div>

      {/* Botões de ação */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <button onClick={() => executar({ dryRun: true })} disabled={rodando}
          style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid #667eea', backgroundColor: '#f0f4ff', color: '#4f46e5', fontSize: '14px', fontWeight: 600, cursor: rodando ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: rodando ? 0.6 : 1 }}>
          <Icon icon="mdi:eye-outline" width="18" /> Simular (não envia)
        </button>
        <button onClick={() => executar({ dryRun: false })} disabled={rodando || alvos.length === 0}
          style={{ padding: '10px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#25d366', color: 'white', fontSize: '14px', fontWeight: 600, cursor: (rodando || alvos.length === 0) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: (rodando || alvos.length === 0) ? 0.6 : 1 }}>
          <Icon icon="mdi:whatsapp" width="18" /> {rodando ? 'Processando...' : 'Rodar agora'}
        </button>
        <button onClick={abrirTemplates}
          style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#374151', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icon icon="mdi:pencil-outline" width="18" /> Editar mensagens
        </button>
        <button onClick={carregar} disabled={loading}
          style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#374151', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icon icon="mdi:refresh" width="18" /> Atualizar
        </button>
      </div>

      {/* Resultado da última execução */}
      {resultado && (
        <div style={{ margin: '4px 0 20px', padding: '14px 16px', borderRadius: '10px', fontSize: '13px',
          backgroundColor: resultado.erro ? '#fef2f2' : '#eff6ff',
          border: `1px solid ${resultado.erro ? '#fecaca' : '#bfdbfe'}`, color: '#333' }}>
          {resultado.erro ? (
            <span style={{ color: '#c62828' }}>Erro: {resultado.erro}</span>
          ) : resultado.teste ? (
            <span><strong>Teste enviado</strong> para {resultado.para}: {resultado.enviados || 0} de 3 modelos entregues{resultado.falhas?.length ? ` · ${resultado.falhas.length} falha(s)` : ''}.</span>
          ) : resultado.dryRun ? (
            <div>
              <strong>Simulação:</strong> {resultado.total || 0} na fila · {(resultado.simulacao?.length ?? 0)} receberiam agora · {resultado.skipped || 0} já enviado(s) neste ciclo.
              {resultado.simulacao?.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                  {resultado.simulacao.slice(0, 10).map((s, i) => (
                    <li key={i} style={{ marginBottom: '2px' }}>{s.nome} · {BUCKETS[s.bucket]?.label} · {s.telefone}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <span><strong>Enviado:</strong> {resultado.sent || 0} · pulados (já enviados): {resultado.skipped || 0} · erros: {resultado.errors || 0}</span>
          )}
        </div>
      )}

      {/* Fila atual */}
      <div style={{ backgroundColor: 'white', padding: isMobile ? '16px' : '20px', borderRadius: '12px', border: '1px solid #e0e0e0', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#333', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon="mdi:account-clock" width="20" style={{ color: '#f97316' }} /> Na fila agora ({alvos.length})
        </h3>
        {loading ? (
          <p style={{ color: '#999', fontSize: '13px', margin: 0 }}>Carregando...</p>
        ) : alvos.length === 0 ? (
          <p style={{ color: '#999', fontSize: '13px', margin: 0 }}>Nenhum cliente nos marcos de cobrança hoje. 🎉</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#666', borderBottom: '1px solid #eee' }}>
                  <th style={{ padding: '8px' }}>Cliente</th>
                  <th style={{ padding: '8px' }}>Marco</th>
                  <th style={{ padding: '8px' }}>Plano</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Valor</th>
                  <th style={{ padding: '8px' }}>Vencimento</th>
                  <th style={{ padding: '8px' }}>Telefone</th>
                </tr>
              </thead>
              <tbody>
                {alvos.map(a => {
                  const b = BUCKETS[a.bucket] || {}
                  return (
                    <tr key={`${a.usuario_id}_${a.bucket}`} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '8px', fontWeight: 500 }}>{a.nome_cliente}</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, backgroundColor: b.bg, color: b.cor }}>{b.label}</span>
                      </td>
                      <td style={{ padding: '8px', textTransform: 'capitalize' }}>{a.plano}</td>
                      <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>R$ {formatarValor(a.valor)}</td>
                      <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{formatarData(a.data_vencimento)}</td>
                      <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{a.telefone}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Histórico de envios automáticos */}
      <div style={{ backgroundColor: 'white', padding: isMobile ? '16px' : '20px', borderRadius: '12px', border: '1px solid #e0e0e0' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#333', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon icon="mdi:history" width="20" style={{ color: '#2196F3' }} /> Últimos envios automáticos
        </h3>
        {logs.length === 0 ? (
          <p style={{ color: '#999', fontSize: '13px', margin: 0 }}>Nenhum envio registrado ainda.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#666', borderBottom: '1px solid #eee' }}>
                  <th style={{ padding: '8px' }}>Quando</th>
                  <th style={{ padding: '8px' }}>Marco</th>
                  <th style={{ padding: '8px' }}>Ciclo</th>
                  <th style={{ padding: '8px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{formatarDataHora(l.created_at)}</td>
                    <td style={{ padding: '8px' }}>{BUCKETS[l.tipo]?.label || l.tipo}</td>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{formatarData(l.ciclo_vencimento)}</td>
                    <td style={{ padding: '8px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                        backgroundColor: l.status === 'enviado' ? '#e8f5e9' : '#ffebee',
                        color: l.status === 'enviado' ? '#2e7d32' : '#c62828' }}>
                        {l.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de edição de templates */}
      {templatesModal && (
        <div onClick={() => setTemplatesModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'white', borderRadius: '14px', width: '100%', maxWidth: '720px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Editar mensagens de cobrança</h3>
              <button onClick={() => setTemplatesModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <Icon icon="mdi:close" width="22" style={{ color: '#666' }} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '20px' }}>
                Variáveis: <code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{'{{nome}}'}</code>{' '}
                <code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{'{{plano}}'}</code>{' '}
                <code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{'{{valor}}'}</code>{' '}
                <code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{'{{vencimento}}'}</code>{' '}
                <code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{'{{dias}}'}</code>{' '}
                <code style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px' }}>{'{{dias_atraso}}'}</code>
              </p>
              {TEMPLATE_ORDEM.map(({ tipo, label }) => (
                <div key={tipo} style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#344848', marginBottom: '6px' }}>{label}</label>
                  <textarea
                    value={templatesEditando[tipo] || ''}
                    onChange={(e) => setTemplatesEditando({ ...templatesEditando, [tipo]: e.target.value })}
                    rows={7}
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: '#fafafa' }}>
              <button onClick={() => setTemplatesModal(false)} style={{ padding: '10px 18px', backgroundColor: 'white', color: '#666', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvarTemplates} disabled={salvandoTmpl} style={{ padding: '10px 24px', backgroundColor: '#7c3aed', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: salvandoTmpl ? 'not-allowed' : 'pointer', opacity: salvandoTmpl ? 0.6 : 1 }}>
                {salvandoTmpl ? 'Salvando...' : 'Salvar mensagens'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
