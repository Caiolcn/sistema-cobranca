import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from '../supabaseClient'
import { useUser } from '../contexts/UserContext'
import { useUserPlan } from '../hooks/useUserPlan'
import useWindowSize from '../hooks/useWindowSize'
import whatsappService from '../services/whatsappService'
import { showToast } from '../Toast'

const FAIXAS = [
  { key: 'critico', label: 'Crítico', min: 70, max: 100, cor: '#f44336', bg: '#fff5f5', border: '#fecaca', icon: 'solar:danger-triangle-linear' },
  { key: 'alto', label: 'Alto', min: 50, max: 69, cor: '#ff9800', bg: '#fff8f0', border: '#fed7aa', icon: 'solar:danger-circle-linear' },
  { key: 'atencao', label: 'Atenção', min: 30, max: 49, cor: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: 'solar:eye-linear' },
  { key: 'baixo', label: 'Baixo', min: 0, max: 29, cor: '#4CAF50', bg: '#f0fdf4', border: '#bbf7d0', icon: 'solar:check-circle-linear' }
]

const TEMPLATES = [
  { key: 'financeiro', label: '💰 Financeiro', gerador: (aluno) => {
    const nome = (aluno.nome || '').split(' ')[0]
    return `Oi, ${nome}! Tudo bem? 😊\n\nNotei que sua mensalidade tá pendente — sei que a rotina é corrida! Se precisar de alguma condição especial pra regularizar, me chama aqui que a gente resolve. 💛\n\nQueremos te ver por aqui de novo!`
  }},
  { key: 'saudade', label: '💛 Saudade', gerador: (aluno) => {
    const nome = (aluno.nome || '').split(' ')[0]
    return `Oi, ${nome}! Tudo bem? 💛\n\nSentimos sua falta por aqui! Reservamos um horário especial pra você essa semana. Bora retomar os treinos? 💪\n\nMe conta se mudou alguma coisa, quero te ajudar a encaixar de volta na rotina!`
  }},
  { key: 'feedback', label: '⭐ Feedback', gerador: (aluno) => {
    const nome = (aluno.nome || '').split(' ')[0]
    return `Oi, ${nome}! Tudo bem? 😊\n\nVi que sua última avaliação não foi tão positiva e queria entender melhor. Tem algo que podemos melhorar pra deixar sua experiência mais legal? Sua opinião é muito importante pra gente! 🙏`
  }},
  { key: 'generico', label: '👋 Geral', gerador: (aluno) => {
    const nome = (aluno.nome || '').split(' ')[0]
    return `Oi, ${nome}! Tudo bem? 💛\n\nFaz um tempinho que não te vejo por aqui e queria saber como você tá! Tem novidades te esperando. Bora marcar um horário essa semana? 😊`
  }}
]

// Detecta qual template é o melhor pro aluno baseado no risco dominante
function detectarTemplatePadrao(aluno) {
  if (aluno.score_atraso >= 15) return 'financeiro'
  if (aluno.score_frequencia >= 25 || aluno.score_ausencia >= 18) return 'saudade'
  if (aluno.score_nps >= 7) return 'feedback'
  return 'generico'
}

function gerarMsgRetencao(aluno) {
  const key = detectarTemplatePadrao(aluno)
  const tpl = TEMPLATES.find(t => t.key === key) || TEMPLATES[3]
  return tpl.gerador(aluno)
}

function getFaixa(score) {
  return FAIXAS.find(f => score >= f.min && score <= f.max) || FAIXAS[3]
}

function formatarTelefoneWa(tel) {
  if (!tel) return null
  let t = String(tel).replace(/\D/g, '')
  if (!t.startsWith('55')) t = '55' + t
  return t
}

export default function RadarEvasao({ onAbrirPerfil }) {
  const { userId } = useUser()
  const { isLocked } = useUserPlan()
  const { isMobile, isSmallScreen } = useWindowSize()
  const [loading, setLoading] = useState(true)
  const [alunos, setAlunos] = useState([])
  const [filtroFaixa, setFiltroFaixa] = useState('todos')
  const [busca, setBusca] = useState('')
  const [ordenacao, setOrdenacao] = useState('score') // score | nome | dias | atraso
  const [expandido, setExpandido] = useState(null) // devedor_id do card expandido
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, text: '' })
  const [modalMsg, setModalMsg] = useState({ aberto: false, aluno: null, texto: '', enviando: false, templateAtivo: '' })
  const [contatadosHoje, setContatadosHoje] = useState(new Set()) // IDs dos alunos que já receberam msg nessa sessão

  const carregarDados = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('vw_radar_evasao')
        .select('*')
        .eq('user_id', userId)
        .order('score_total', { ascending: false })

      if (error) throw error
      setAlunos(data || [])
    } catch (err) {
      console.error('Erro ao carregar radar:', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { carregarDados() }, [carregarDados])

  // Gate de plano
  if (isLocked('premium')) {
    return (
      <div style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '60px 40px',
        textAlign: 'center', border: '1px solid #e5e7eb', maxWidth: '500px', margin: '40px auto'
      }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#fef2f2',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto'
        }}>
          <Icon icon="mdi:shield-alert-outline" width="32" style={{ color: '#dc2626' }} />
        </div>
        <h2 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: '600', color: '#1a1a1a' }}>
          Radar de Evasão
        </h2>
        <p style={{ margin: '0 0 8px', fontSize: '15px', color: '#666', lineHeight: '1.6' }}>
          Descubra quais alunos estão prestes a cancelar — antes deles saírem.
        </p>
        <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#888' }}>
          Disponível no plano <strong>Premium</strong>.
        </p>
        <button onClick={() => window.location.href = '/app/configuracao?aba=upgrade'}
          style={{
            padding: '12px 32px', backgroundColor: '#dc2626', color: 'white',
            border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer'
          }}>
          Fazer Upgrade
        </button>
      </div>
    )
  }

  // Filtrar e ordenar
  const alunosFiltrados = alunos
    .filter(a => {
      if (filtroFaixa !== 'todos') {
        const faixa = getFaixa(a.score_total)
        if (faixa.key !== filtroFaixa) return false
      }
      if (busca) {
        const b = busca.toLowerCase()
        if (!a.nome?.toLowerCase().includes(b) && !a.telefone?.includes(b)) return false
      }
      return true
    })
    .sort((a, b) => {
      switch (ordenacao) {
        case 'nome': return (a.nome || '').localeCompare(b.nome || '')
        case 'dias': return (b.dias_sem_aparecer || 0) - (a.dias_sem_aparecer || 0)
        case 'atraso': return (b.dias_atraso || 0) - (a.dias_atraso || 0)
        default: return b.score_total - a.score_total
      }
    })

  // Contadores por faixa
  const contadores = {
    critico: alunos.filter(a => a.score_total >= 70).length,
    alto: alunos.filter(a => a.score_total >= 50 && a.score_total < 70).length,
    atencao: alunos.filter(a => a.score_total >= 30 && a.score_total < 50).length,
    baixo: alunos.filter(a => a.score_total < 30).length
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Icon icon="eos-icons:loading" width="40" style={{ color: '#666' }} />
        <p style={{ marginTop: '12px', color: '#888', fontSize: '14px' }}>Analisando seus alunos...</p>
      </div>
    )
  }

  if (alunos.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <Icon icon="mdi:shield-check" width="56" style={{ color: '#16a34a' }} />
        <h3 style={{ margin: '16px 0 8px', fontSize: '18px', color: '#344848' }}>Tudo tranquilo!</h3>
        <p style={{ margin: 0, fontSize: '14px', color: '#888' }}>
          Nenhum aluno ativo com assinatura encontrado, ou todos estão com risco zero.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* KPI Cards — padrão Financeiro */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : isSmallScreen ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: isSmallScreen ? '12px' : '16px',
        marginBottom: '20px'
      }}>
        {FAIXAS.map(f => {
          const qtd = contadores[f.key]
          const ativo = filtroFaixa === f.key
          const total = alunos.length
          const pct = total > 0 ? Math.round((qtd / total) * 100) : 0

          return (
            <div
              key={f.key}
              onClick={() => setFiltroFaixa(ativo ? 'todos' : f.key)}
              style={{
                flex: 1,
                padding: '14px 18px',
                borderLeft: `3px solid ${f.cor}`,
                backgroundColor: f.bg,
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: '13px', color: '#666', margin: '0 0 6px 0' }}>{f.label}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icon icon={f.icon} width="18" style={{ color: f.cor }} />
                    <span style={{ fontSize: '20px', fontWeight: '700', color: '#344848' }}>
                      {qtd} aluno{qtd !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 0 0' }}>
                    {f.key === 'critico' ? 'Score 70–100' : f.key === 'alto' ? 'Score 50–69' : f.key === 'atencao' ? 'Score 30–49' : 'Score 0–29'}
                  </p>
                </div>
                <span style={{
                  backgroundColor: f.cor,
                  color: 'white',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  {pct}%
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setFiltroFaixa(ativo ? 'todos' : f.key) }}
                style={{
                  background: 'none',
                  color: '#555',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  textDecoration: 'underline',
                  padding: 0,
                  fontWeight: '600',
                  textAlign: 'left'
                }}
              >
                {ativo ? 'Remover filtro' : 'Ver detalhes →'}
              </button>
            </div>
          )
        })}
      </div>

      {/* Busca + Ordenação */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
          <Icon icon="mdi:magnify" width="18" style={{
            position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#999'
          }} />
          <input
            type="text"
            placeholder="Buscar aluno..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{
              width: '100%', padding: '10px 10px 10px 34px', border: '1px solid #ddd',
              borderRadius: '8px', fontSize: '16px', boxSizing: 'border-box'
            }}
          />
        </div>
        <select
          value={ordenacao}
          onChange={e => setOrdenacao(e.target.value)}
          style={{
            padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
            fontSize: '16px', backgroundColor: 'white', cursor: 'pointer'
          }}
        >
          <option value="score">Maior risco</option>
          <option value="dias">Dias sem aparecer</option>
          <option value="atraso">Dias em atraso</option>
          <option value="nome">Nome (A-Z)</option>
        </select>
      </div>

      {/* Info */}
      {filtroFaixa !== 'todos' && (
        <div style={{
          marginBottom: '12px', fontSize: '13px', color: '#888',
          display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          <span>Filtrando: <strong style={{ color: getFaixa(filtroFaixa === 'critico' ? 70 : filtroFaixa === 'alto' ? 50 : filtroFaixa === 'atencao' ? 30 : 0).cor }}>
            {getFaixa(filtroFaixa === 'critico' ? 70 : filtroFaixa === 'alto' ? 50 : filtroFaixa === 'atencao' ? 30 : 0).label}
          </strong></span>
          <button onClick={() => setFiltroFaixa('todos')}
            style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            Limpar
          </button>
        </div>
      )}

      {/* Lista de alunos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {alunosFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            {filtroFaixa === 'baixo' ? (
              <>
                <Icon icon="mdi:party-popper" width="48" style={{ color: '#16a34a', marginBottom: '12px' }} />
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#16a34a' }}>Parabéns! 🎉</div>
                <div style={{ fontSize: '14px', color: '#888', marginTop: '4px' }}>Nenhum aluno em risco baixo — todos estão engajados ou precisam de atenção.</div>
              </>
            ) : filtroFaixa === 'critico' || filtroFaixa === 'alto' ? (
              <>
                <Icon icon="mdi:shield-check" width="48" style={{ color: '#16a34a', marginBottom: '12px' }} />
                <div style={{ fontSize: '16px', fontWeight: '600', color: '#16a34a' }}>Tudo tranquilo!</div>
                <div style={{ fontSize: '14px', color: '#888', marginTop: '4px' }}>Nenhum aluno nessa faixa de risco. Continue assim!</div>
              </>
            ) : (
              <div style={{ fontSize: '14px', color: '#888' }}>Nenhum aluno encontrado com esse filtro.</div>
            )}
          </div>
        ) : alunosFiltrados.map(aluno => {
          const faixa = getFaixa(aluno.score_total)
          const aberto = expandido === aluno.devedor_id
          const telWa = formatarTelefoneWa(aluno.telefone)

          return (
            <div
              key={aluno.devedor_id}
              style={{
                backgroundColor: 'white',
                border: `1px solid ${aberto ? faixa.cor : '#e5e7eb'}`,
                borderRadius: '12px',
                overflow: 'hidden',
                transition: 'border-color 0.2s'
              }}
            >
              {/* Card header (sempre visível) */}
              <div
                onClick={() => setExpandido(aberto ? null : aluno.devedor_id)}
                style={{
                  padding: isSmallScreen ? '14px' : '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  cursor: 'pointer'
                }}
              >
                {/* Score circle com tooltip flutuante */}
                <div
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const text = [
                      aluno.score_frequencia > 0 ? `📉 Frequência: ${aluno.score_frequencia}/35` : null,
                      aluno.score_ausencia > 0 ? `📅 Ausência: ${aluno.score_ausencia}/25` : null,
                      aluno.score_atraso > 0 ? `💰 Atraso: ${aluno.score_atraso}/20` : null,
                      aluno.score_nps > 0 ? `⭐ NPS: ${aluno.score_nps}/10` : null,
                      aluno.score_tempo > 0 ? `🕐 Novato: ${aluno.score_tempo}/10` : null
                    ].filter(Boolean).join('\n') || 'Nenhum fator de risco'
                    setTooltip({ visible: true, x: rect.right + 10, y: rect.top + rect.height / 2, text })
                  }}
                  onMouseLeave={() => setTooltip(prev => ({ ...prev, visible: false }))}
                  style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    backgroundColor: faixa.bg, border: `2px solid ${faixa.cor}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, cursor: 'help'
                  }}
                >
                  <span style={{ fontSize: '16px', fontWeight: '800', color: faixa.cor }}>
                    {aluno.score_total}
                  </span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {aluno.nome}
                  </div>
                  {/* Chips coloridos dos fatores de risco */}
                  <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {contatadosHoje.has(aluno.devedor_id) && (
                      <span style={{
                        padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '600',
                        backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0'
                      }}>
                        ✓ Contatado hoje
                      </span>
                    )}
                    {aluno.score_frequencia > 0 && (
                      <span style={{
                        padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '600',
                        backgroundColor: aluno.score_frequencia >= 25 ? '#fef2f2' : '#fffbeb',
                        color: aluno.score_frequencia >= 25 ? '#dc2626' : '#d97706',
                        border: `1px solid ${aluno.score_frequencia >= 25 ? '#fecaca' : '#fde68a'}`
                      }}>
                        📉 Freq. caiu {aluno.presencas_14d_anterior > 0 ? Math.round((1 - aluno.presencas_14d / aluno.presencas_14d_anterior) * 100) : 100}%
                      </span>
                    )}
                    {aluno.dias_sem_aparecer > 7 && aluno.dias_sem_aparecer < 999 && (
                      <span style={{
                        padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '600',
                        backgroundColor: aluno.dias_sem_aparecer > 21 ? '#fef2f2' : '#fff7ed',
                        color: aluno.dias_sem_aparecer > 21 ? '#dc2626' : '#ea580c',
                        border: `1px solid ${aluno.dias_sem_aparecer > 21 ? '#fecaca' : '#fed7aa'}`
                      }}>
                        📅 {aluno.dias_sem_aparecer}d sem vir
                      </span>
                    )}
                    {aluno.dias_atraso > 0 && (
                      <span style={{
                        padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '600',
                        backgroundColor: aluno.dias_atraso > 15 ? '#fef2f2' : '#fff7ed',
                        color: aluno.dias_atraso > 15 ? '#dc2626' : '#ea580c',
                        border: `1px solid ${aluno.dias_atraso > 15 ? '#fecaca' : '#fed7aa'}`
                      }}>
                        💰 {aluno.dias_atraso}d atraso
                      </span>
                    )}
                    {aluno.nps_nota !== null && aluno.nps_nota <= 6 && (
                      <span style={{
                        padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '600',
                        backgroundColor: '#fffbeb', color: '#d97706', border: '1px solid #fde68a'
                      }}>
                        ⭐ NPS {aluno.nps_nota}
                      </span>
                    )}
                  </div>
                </div>

                {/* Badge + ações + chevron */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <span style={{
                    padding: '4px 10px', borderRadius: '999px', fontSize: '11px',
                    fontWeight: '700', backgroundColor: faixa.bg, color: faixa.cor,
                    border: `1px solid ${faixa.border}`
                  }}>
                    {faixa.label}
                  </span>

                  {telWa && (
                    <button
                      title={contatadosHoje.has(aluno.devedor_id) ? 'Contatado hoje' : 'Enviar mensagem'}
                      onClick={(e) => {
                        e.stopPropagation()
                        const tplKey = detectarTemplatePadrao(aluno)
                        setModalMsg({ aberto: true, aluno, texto: gerarMsgRetencao(aluno), enviando: false, templateAtivo: tplKey })
                      }}
                      style={{
                        width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                        backgroundColor: contatadosHoje.has(aluno.devedor_id) ? '#9ca3af' : '#25d366',
                        color: 'white', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      <Icon icon={contatadosHoje.has(aluno.devedor_id) ? 'mdi:check' : 'mdi:whatsapp'} width="18" />
                    </button>
                  )}
                  <button
                    title="Ver perfil"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (onAbrirPerfil) onAbrirPerfil(aluno.devedor_id)
                    }}
                    style={{
                      width: '32px', height: '32px', borderRadius: '8px',
                      border: '1px solid #e5e7eb', backgroundColor: 'white', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#555', transition: 'all 0.15s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f3f4f6'; e.currentTarget.style.borderColor = '#999' }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.borderColor = '#e5e7eb' }}
                  >
                    <Icon icon="mdi:account-outline" width="18" />
                  </button>

                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>

              {/* Detalhe expandido */}
              {aberto && (
                <div style={{
                  padding: isSmallScreen ? '0 14px 14px' : '0 20px 20px',
                  borderTop: '1px solid #f0f0f0'
                }}>
                  {/* Barra de score visual */}
                  <div style={{ marginTop: '14px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#999', marginBottom: '4px' }}>
                      <span>Risco baixo</span>
                      <span>Risco crítico</span>
                    </div>
                    <div style={{ height: '8px', borderRadius: '4px', backgroundColor: '#f0f0f0', position: 'relative', overflow: 'hidden' }}>
                      <div style={{
                        position: 'absolute', top: 0, left: 0, height: '100%',
                        width: `${aluno.score_total}%`,
                        borderRadius: '4px',
                        background: `linear-gradient(90deg, #16a34a, #d97706, #dc2626)`,
                        transition: 'width 0.5s'
                      }} />
                    </div>
                  </div>

                  {/* Detalhes dos 5 sinais (sempre 2 colunas pra compactar) */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '8px',
                    marginBottom: '16px'
                  }}>
                    <SinalCard icon="📉" label="Frequência" pontos={aluno.score_frequencia} max={35}
                      detalhe={aluno.presencas_14d_anterior > 0
                        ? `${aluno.presencas_14d} presenças vs ${aluno.presencas_14d_anterior} (quinzena ant.)`
                        : 'Sem histórico anterior'} />
                    <SinalCard icon="📅" label="Ausência" pontos={aluno.score_ausencia} max={25}
                      detalhe={aluno.dias_sem_aparecer < 999
                        ? `${aluno.dias_sem_aparecer} dias sem aparecer`
                        : 'Nunca registrou presença'} />
                    <SinalCard icon="💰" label="Financeiro" pontos={aluno.score_atraso} max={20}
                      detalhe={aluno.dias_atraso > 0
                        ? `${aluno.dias_atraso} dias de atraso`
                        : 'Em dia ✓'} />
                    <SinalCard icon="⭐" label="Satisfação" pontos={aluno.score_nps} max={10}
                      detalhe={aluno.nps_nota !== null
                        ? `NPS: ${aluno.nps_nota}/10`
                        : 'Sem resposta de NPS'} />
                    <SinalCard icon="🕐" label="Novato" pontos={aluno.score_tempo} max={10}
                      detalhe={aluno.data_cadastro
                        ? `Desde ${new Date(aluno.data_cadastro).toLocaleDateString('pt-BR')} (mais novo = mais risco)`
                        : 'Data não registrada'} />
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {telWa && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setModalMsg({ aberto: true, aluno, texto: gerarMsgRetencao(aluno), enviando: false })
                        }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          padding: '10px 16px', backgroundColor: '#25d366', color: 'white',
                          borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                        }}>
                        <Icon icon="mdi:whatsapp" width="18" />
                        Mandar mensagem
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (onAbrirPerfil) onAbrirPerfil(aluno.devedor_id)
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '10px 16px', backgroundColor: 'white', color: '#344848',
                        border: '1px solid #344848', borderRadius: '8px',
                        fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                      }}>
                      <Icon icon="mdi:account-outline" width="18" />
                      Ver perfil
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Total */}
      <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '12px', color: '#999' }}>
        {alunosFiltrados.length} aluno{alunosFiltrados.length !== 1 ? 's' : ''} exibido{alunosFiltrados.length !== 1 ? 's' : ''}
        {filtroFaixa !== 'todos' && ` (filtrando por ${getFaixa(filtroFaixa === 'critico' ? 70 : filtroFaixa === 'alto' ? 50 : filtroFaixa === 'atencao' ? 30 : 0).label})`}
      </div>

      {/* Modal de envio de mensagem */}
      {modalMsg.aberto && (
        <div
          onClick={() => !modalMsg.enviando && setModalMsg(prev => ({ ...prev, aberto: false }))}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: 'white', borderRadius: '16px',
              width: '100%', maxWidth: '520px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '18px 20px', borderBottom: '1px solid #f0f0f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a' }}>
                  Enviar mensagem
                </div>
                <div style={{ fontSize: '13px', color: '#888', marginTop: '2px' }}>
                  Para: <strong>{modalMsg.aluno?.nome}</strong> · {modalMsg.aluno?.telefone}
                </div>
              </div>
              <button
                onClick={() => setModalMsg(prev => ({ ...prev, aberto: false }))}
                disabled={modalMsg.enviando}
                style={{
                  width: '32px', height: '32px', borderRadius: '8px', border: 'none',
                  backgroundColor: '#f3f4f6', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <Icon icon="mdi:close" width="18" style={{ color: '#666' }} />
              </button>
            </div>

            {/* Seletor de template com indicador visual */}
            <div style={{ padding: '16px 20px 0' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
                Tipo de mensagem
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {TEMPLATES.map(t => {
                  const ativo = modalMsg.templateAtivo === t.key
                  const ehSugerido = modalMsg.aluno && detectarTemplatePadrao(modalMsg.aluno) === t.key
                  return (
                    <button
                      key={t.key}
                      onClick={() => setModalMsg(prev => ({
                        ...prev,
                        texto: t.gerador(prev.aluno),
                        templateAtivo: t.key
                      }))}
                      style={{
                        padding: '6px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '600',
                        border: ativo ? '2px solid #344848' : '1px solid #e5e7eb',
                        backgroundColor: ativo ? '#344848' : 'white',
                        color: ativo ? 'white' : '#555',
                        cursor: 'pointer', transition: 'all 0.15s',
                        position: 'relative'
                      }}
                    >
                      {t.label}
                      {ehSugerido && !ativo && (
                        <span style={{
                          position: 'absolute', top: '-6px', right: '-6px',
                          width: '14px', height: '14px', borderRadius: '50%',
                          backgroundColor: '#25d366', color: 'white',
                          fontSize: '8px', fontWeight: '800',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: '2px solid white'
                        }}>
                          ✓
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {modalMsg.aluno && (
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
                  💡 Sugerido: <strong>{TEMPLATES.find(t => t.key === detectarTemplatePadrao(modalMsg.aluno))?.label}</strong> (baseado no risco principal)
                </div>
              )}
            </div>

            {/* Textarea */}
            <div style={{ padding: '0 20px' }}>
              <textarea
                value={modalMsg.texto}
                onChange={e => setModalMsg(prev => ({ ...prev, texto: e.target.value }))}
                disabled={modalMsg.enviando}
                rows={8}
                style={{
                  width: '100%', padding: '14px', borderRadius: '10px',
                  border: '1px solid #d1d5db', fontSize: '14px',
                  fontFamily: 'inherit', resize: 'vertical',
                  boxSizing: 'border-box', lineHeight: '1.6',
                  backgroundColor: modalMsg.enviando ? '#f9fafb' : 'white'
                }}
              />
              <div style={{ fontSize: '11px', color: '#999', textAlign: 'right', marginTop: '4px' }}>
                {modalMsg.texto.length} caracteres
              </div>
            </div>

            {/* Footer com botões */}
            <div style={{
              padding: '16px 20px', borderTop: '1px solid #f0f0f0',
              display: 'flex', justifyContent: 'flex-end', gap: '10px'
            }}>
              <button
                onClick={() => setModalMsg(prev => ({ ...prev, aberto: false }))}
                disabled={modalMsg.enviando}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: '1px solid #d1d5db', backgroundColor: 'white',
                  fontSize: '14px', fontWeight: '500', cursor: 'pointer', color: '#555'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!modalMsg.texto.trim() || !modalMsg.aluno?.telefone) return
                  setModalMsg(prev => ({ ...prev, enviando: true }))
                  try {
                    const resultado = await whatsappService.enviarMensagem(
                      modalMsg.aluno.telefone,
                      modalMsg.texto.trim()
                    )
                    if (resultado.sucesso) {
                      showToast(`Mensagem enviada pra ${(modalMsg.aluno.nome || '').split(' ')[0]}!`, 'success')
                      setContatadosHoje(prev => new Set([...prev, modalMsg.aluno.devedor_id]))
                      setModalMsg({ aberto: false, aluno: null, texto: '', enviando: false, templateAtivo: '' })
                    } else {
                      showToast(resultado.erro || 'Erro ao enviar mensagem', 'error')
                      setModalMsg(prev => ({ ...prev, enviando: false }))
                    }
                  } catch (err) {
                    showToast('Erro ao enviar: ' + (err.message || 'erro desconhecido'), 'error')
                    setModalMsg(prev => ({ ...prev, enviando: false }))
                  }
                }}
                disabled={modalMsg.enviando || !modalMsg.texto.trim()}
                style={{
                  padding: '10px 24px', borderRadius: '8px', border: 'none',
                  backgroundColor: modalMsg.enviando ? '#86efac' : '#25d366',
                  color: 'white', fontSize: '14px', fontWeight: '600',
                  cursor: modalMsg.enviando ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                {modalMsg.enviando ? (
                  <><Icon icon="eos-icons:loading" width="18" /> Enviando...</>
                ) : (
                  <><Icon icon="mdi:send" width="18" /> Enviar via WhatsApp</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip flutuante (position fixed, fora de qualquer overflow) */}
      {tooltip.visible && (
        <div style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translateY(-50%)',
          backgroundColor: '#1f2937',
          color: 'white',
          padding: '10px 14px',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: '500',
          whiteSpace: 'pre-line',
          lineHeight: '1.7',
          zIndex: 10000,
          minWidth: '170px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          pointerEvents: 'none'
        }}>
          {tooltip.text}
        </div>
      )}
    </div>
  )
}

function SinalCard({ icon, label, pontos, max, detalhe }) {
  const pct = max > 0 ? (pontos / max) * 100 : 0
  const corBarra = pct > 66 ? '#dc2626' : pct > 33 ? '#d97706' : '#16a34a'
  const nivelTexto = pontos === 0 ? 'OK' : pct > 66 ? 'Alto' : pct > 33 ? 'Médio' : 'Baixo'

  return (
    <div style={{
      padding: '10px 12px', backgroundColor: pontos > 0 ? '#fafafa' : '#f8fdf8', borderRadius: '8px',
      border: `1px solid ${pontos > 0 ? '#f0f0f0' : '#e5f5e5'}`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: '600', color: '#555' }}>{icon} {label}</span>
        <span style={{
          fontSize: '10px', fontWeight: '700', color: 'white',
          backgroundColor: pontos === 0 ? '#16a34a' : corBarra,
          padding: '2px 6px', borderRadius: '4px'
        }}>
          {nivelTexto}
        </span>
      </div>
      <div style={{ height: '4px', borderRadius: '2px', backgroundColor: '#e5e7eb' }}>
        <div style={{
          height: '100%', borderRadius: '2px', backgroundColor: pontos === 0 ? '#16a34a' : corBarra,
          width: pontos === 0 ? '100%' : `${pct}%`, transition: 'width 0.3s',
          opacity: pontos === 0 ? 0.3 : 1
        }} />
      </div>
      <div style={{ fontSize: '11px', color: '#777', marginTop: '4px' }}>{detalhe}</div>
    </div>
  )
}
