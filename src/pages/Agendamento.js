import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { FUNCTIONS_URL, SUPABASE_ANON_KEY as ANON_KEY } from '../supabaseClient'

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const headers = { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }

function formatarHorario(h) {
  if (!h) return ''
  return h.substring(0, 5)
}

function gerarProximasDatas(aulas, dias = 14) {
  const datas = []
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  for (let i = 0; i < dias; i++) {
    const d = new Date(hoje)
    d.setDate(d.getDate() + i)
    datas.push(d)
  }
  return datas
}

function formatarDataCurta(date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function dataParaString(date) {
  return date.toISOString().split('T')[0]
}

export default function Agendamento() {
  const { slug } = useParams()

  // Estados
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [aulas, setAulas] = useState([])
  const [contagemAgendamentos, setContagemAgendamentos] = useState({})
  const [contagemFixos, setContagemFixos] = useState({}) // { aulaId: count }

  // Identificacao
  const [etapa, setEtapa] = useState('telefone') // telefone | nome | selecionar | grade
  const [telefone, setTelefone] = useState('')
  const [nome, setNome] = useState('')
  const [aluno, setAluno] = useState(null)
  const [meusAgendamentos, setMeusAgendamentos] = useState([])
  const [identificando, setIdentificando] = useState(false)
  const [cadastrando, setCadastrando] = useState(false)
  const [multiplosAlunos, setMultiplosAlunos] = useState([]) // quando tem mais de 1 com mesmo telefone

  // Agendamento
  const [diaSelecionado, setDiaSelecionado] = useState(null)
  const [agendando, setAgendando] = useState(null)
  const [cancelando, setCancelando] = useState(null)
  const [toast, setToast] = useState(null)

  // Tab
  const [tab, setTab] = useState('agendar') // agendar | meus

  const mostrarToast = useCallback((msg, tipo = 'success') => {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 3500)
  }, [])

  // Carregar dados da empresa
  useEffect(() => {
    async function carregar() {
      try {
        const res = await fetch(`${FUNCTIONS_URL}/agendamento-dados?slug=${slug}`, { headers })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error || 'Empresa não encontrada')
        }
        const json = await res.json()
        setEmpresa(json.empresa)
        setAulas(json.aulas)
        setContagemAgendamentos(json.agendamentos_contagem || {})
        setContagemFixos(json.fixos_contagem || {})
        setLoading(false)
      } catch (err) {
        setErro(err.message)
        setLoading(false)
      }
    }
    carregar()
  }, [slug])

  // Selecionar primeiro dia com aulas
  useEffect(() => {
    if (aulas.length > 0 && !diaSelecionado) {
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const diasComAula = [...new Set(aulas.map(a => a.dia_semana))]
      // Encontrar proximo dia com aula a partir de hoje
      for (let i = 0; i < 7; i++) {
        const d = new Date(hoje)
        d.setDate(d.getDate() + i)
        if (diasComAula.includes(d.getDay())) {
          setDiaSelecionado(dataParaString(d))
          return
        }
      }
      // Fallback: primeira data disponivel
      const datas = gerarProximasDatas(aulas)
      const primeira = datas.find(d => diasComAula.includes(d.getDay()))
      if (primeira) setDiaSelecionado(dataParaString(primeira))
    }
  }, [aulas, diaSelecionado])

  // Mascara telefone
  const mascaraTelefone = (v) => {
    v = v.replace(/\D/g, '')
    if (v.length <= 2) return `(${v}`
    if (v.length <= 7) return `(${v.slice(0, 2)}) ${v.slice(2)}`
    if (v.length <= 11) return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`
    return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7, 11)}`
  }

  // Identificar aluno
  const identificarAluno = async () => {
    const telLimpo = telefone.replace(/\D/g, '')
    if (telLimpo.length < 10) { mostrarToast('Digite um telefone válido', 'error'); return }

    setIdentificando(true)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/agendamento-identificar`, {
        method: 'POST', headers,
        body: JSON.stringify({ slug, telefone: telLimpo })
      })
      const json = await res.json()

      if (json.bloqueado) {
        mostrarToast(json.error || 'Agendamento bloqueado por mensalidade em atraso', 'error')
        return
      }
      if (json.multiplos) {
        setMultiplosAlunos(json.alunos)
        setEtapa('selecionar')
      } else if (json.encontrado) {
        setAluno(json.aluno)
        setMeusAgendamentos(json.agendamentos || [])
        setEtapa('grade')
      } else {
        setEtapa('nome')
      }
    } catch {
      mostrarToast('Erro ao buscar. Tente novamente.', 'error')
    } finally {
      setIdentificando(false)
    }
  }

  // Selecionar aluno quando há múltiplos com mesmo telefone
  const selecionarAluno = async (alunoSelecionado) => {
    setIdentificando(true)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/agendamento-identificar`, {
        method: 'POST', headers,
        body: JSON.stringify({ slug, telefone: telefone.replace(/\D/g, ''), devedor_id: alunoSelecionado.id })
      })
      const json = await res.json()

      if (json.bloqueado) {
        mostrarToast(json.error || 'Agendamento bloqueado por mensalidade em atraso', 'error')
        return
      }
      if (json.encontrado) {
        setAluno(json.aluno)
        setMeusAgendamentos(json.agendamentos || [])
        setEtapa('grade')
      }
    } catch {
      mostrarToast('Erro ao buscar. Tente novamente.', 'error')
    } finally {
      setIdentificando(false)
    }
  }

  // Cadastrar novo aluno
  const cadastrarAluno = async () => {
    if (nome.trim().length < 2) { mostrarToast('Digite seu nome completo', 'error'); return }

    setCadastrando(true)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/agendamento-cadastrar`, {
        method: 'POST', headers,
        body: JSON.stringify({ slug, nome: nome.trim(), telefone: telefone.replace(/\D/g, '') })
      })
      const json = await res.json()

      if (json.sucesso) {
        setAluno(json.aluno)
        setMeusAgendamentos([])
        setEtapa('grade')
        mostrarToast('Cadastro realizado!', 'success')
      } else {
        mostrarToast(json.error || 'Erro ao cadastrar', 'error')
      }
    } catch {
      mostrarToast('Erro ao cadastrar. Tente novamente.', 'error')
    } finally {
      setCadastrando(false)
    }
  }

  // Agendar aula
  const agendarAula = async (aula, data) => {
    setAgendando(`${aula.id}_${data}`)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/agendamento-agendar`, {
        method: 'POST', headers,
        body: JSON.stringify({ slug, devedor_id: aluno.id, aula_id: aula.id, data })
      })
      const json = await res.json()

      if (json.sucesso) {
        // Atualizar contagem local
        const chave = `${aula.id}_${data}`
        setContagemAgendamentos(prev => ({ ...prev, [chave]: (prev[chave] || 0) + 1 }))
        // Atualizar meus agendamentos
        setMeusAgendamentos(prev => [...prev, { ...json.agendamento, aula: { dia_semana: aula.dia_semana, horario: aula.horario, descricao: aula.descricao } }])
        // Atualizar creditos
        if (json.aulas_restantes !== null) {
          setAluno(prev => ({ ...prev, aulas_restantes: json.aulas_restantes }))
        }
        mostrarToast('Aula agendada!', 'success')
      } else {
        mostrarToast(json.error || 'Erro ao agendar', 'error')
      }
    } catch {
      mostrarToast('Erro ao agendar. Tente novamente.', 'error')
    } finally {
      setAgendando(null)
    }
  }

  // Cancelar agendamento
  const cancelarAgendamento = async (agendamento) => {
    setCancelando(agendamento.id)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/agendamento-cancelar`, {
        method: 'POST', headers,
        body: JSON.stringify({ slug, devedor_id: aluno.id, agendamento_id: agendamento.id })
      })
      const json = await res.json()

      if (json.sucesso) {
        // Atualizar contagem local
        const chave = `${agendamento.aula_id}_${agendamento.data}`
        setContagemAgendamentos(prev => ({ ...prev, [chave]: Math.max(0, (prev[chave] || 1) - 1) }))
        // Remover dos meus agendamentos
        setMeusAgendamentos(prev => prev.filter(a => a.id !== agendamento.id))
        // Atualizar creditos
        if (json.aulas_restantes !== null) {
          setAluno(prev => ({ ...prev, aulas_restantes: json.aulas_restantes }))
        }
        mostrarToast('Aula cancelada', 'success')
      } else {
        mostrarToast(json.error || 'Erro ao cancelar', 'error')
      }
    } catch {
      mostrarToast('Erro ao cancelar. Tente novamente.', 'error')
    } finally {
      setCancelando(null)
    }
  }

  // Calcular datas disponiveis
  const datasDisponiveis = gerarProximasDatas(aulas).filter(d => {
    return aulas.some(a => a.dia_semana === d.getDay())
  })

  // Aulas do dia selecionado (esconde horários com menos de 1h de antecedência)
  const aulaDoDia = diaSelecionado ? aulas.filter(a => {
    const dataSel = new Date(diaSelecionado + 'T12:00:00')
    if (a.dia_semana !== dataSel.getDay()) return false

    // Se for hoje, esconder aulas que já passaram ou faltam menos de 1h
    const hoje = new Date()
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
    if (diaSelecionado === hojeStr && a.horario) {
      const [h, m] = a.horario.split(':').map(Number)
      const horarioAula = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), h, m)
      const diffMs = horarioAula.getTime() - hoje.getTime()
      if (diffMs < 60 * 60 * 1000) return false // menos de 1h de antecedência
    }

    return true
  }) : []

  // Verificar se aluno ja agendou nesta aula/data
  const jaAgendou = (aulaId, data) => {
    return meusAgendamentos.some(a => a.aula_id === aulaId && a.data === data)
  }

  // Vagas restantes (descontando fixos + agendados)
  const vagasRestantes = (aulaId, data) => {
    const aula = aulas.find(a => a.id === aulaId)
    if (!aula) return 0
    const chave = `${aulaId}_${data}`
    const agendados = contagemAgendamentos[chave] || 0
    const fixos = contagemFixos[aulaId] || 0
    return aula.capacidade - fixos - agendados
  }

  // ===== RENDER =====

  // Loading
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#22c55e',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 20px'
          }} />
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 500 }}>Carregando...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    )
  }

  // Erro
  if (erro) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%', background: 'rgba(239,68,68,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px'
          }}>
            <Icon icon="mdi:calendar-remove" width="40" style={{ color: '#ef4444' }} />
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800, color: '#fff' }}>Link indisponível</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)', fontSize: 15, lineHeight: 1.5 }}>{erro}</p>
        </div>
      </div>
    )
  }

  // Tela de identificacao (telefone)
  if (etapa === 'telefone') {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }`}</style>
        <div style={{ width: '100%', maxWidth: 400, animation: 'fadeIn 0.4s ease both' }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            {empresa.logo_url ? (
              <div style={{
                width: 72, height: 72, borderRadius: 16, background: '#fff', overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
              }}>
                <img src={empresa.logo_url} alt={empresa.nome} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }} />
              </div>
            ) : (
              <div style={{
                width: 72, height: 72, borderRadius: 16,
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 800, color: '#fff', margin: '0 auto 16px'
              }}>
                {(empresa.nome || 'E').charAt(0).toUpperCase()}
              </div>
            )}
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#fff' }}>{empresa.nome}</h1>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Agende sua aula</p>
          </div>

          {/* Card */}
          <div style={{
            background: '#fff', borderRadius: 16, padding: 24,
            boxShadow: '0 4px 24px rgba(0,0,0,0.2)'
          }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
              Seu telefone
            </label>
            <input
              type="tel"
              value={telefone}
              onChange={e => setTelefone(mascaraTelefone(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && identificarAluno()}
              placeholder="(00) 00000-0000"
              style={{
                width: '100%', padding: '14px 16px', fontSize: 18, fontWeight: 600,
                border: '2px solid #e2e8f0', borderRadius: 12, outline: 'none',
                transition: 'border-color 0.2s', textAlign: 'center',
                boxSizing: 'border-box', letterSpacing: 1
              }}
              onFocus={e => e.target.style.borderColor = '#22c55e'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
              autoFocus
            />
            <button
              onClick={identificarAluno}
              disabled={identificando || telefone.replace(/\D/g, '').length < 10}
              style={{
                width: '100%', padding: '14px 24px', marginTop: 16,
                background: telefone.replace(/\D/g, '').length >= 10 ? 'linear-gradient(135deg, #22c55e, #16a34a)' : '#e2e8f0',
                color: telefone.replace(/\D/g, '').length >= 10 ? '#fff' : '#94a3b8',
                border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700,
                cursor: telefone.replace(/\D/g, '').length >= 10 ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s'
              }}
            >
              {identificando ? (
                <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.6s linear infinite' }} />
              ) : (
                <>
                  <Icon icon="mdi:arrow-right" width="20" />
                  Continuar
                </>
              )}
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: toast.tipo === 'error' ? '#ef4444' : '#22c55e', color: '#fff',
            padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 999,
            animation: 'fadeIn 0.3s ease'
          }}>
            {toast.msg}
          </div>
        )}
      </div>
    )
  }

  // Tela de seleção (múltiplos alunos com mesmo telefone)
  if (etapa === 'selecionar') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: 20
      }}>
        {empresa?.logo_url && (
          <img src={empresa.logo_url} alt="" style={{ width: 64, height: 64, borderRadius: 16, marginBottom: 16, objectFit: 'cover' }} />
        )}
        <div style={{
          background: '#fff', borderRadius: 20, padding: '32px 24px', width: '100%', maxWidth: 380,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <Icon icon="mdi:account-group" width="40" style={{ color: '#4338ca', marginBottom: 8 }} />
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#1e293b' }}>
              Quem vai agendar?
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: '#94a3b8' }}>
              Encontramos mais de um cadastro com esse telefone
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {multiplosAlunos.map(a => (
              <button key={a.id} onClick={() => selecionarAluno(a)} disabled={identificando}
                style={{
                  padding: '14px 16px', borderRadius: 12, border: '1px solid #e2e8f0',
                  backgroundColor: '#f8fafc', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12,
                  transition: 'all 0.15s', textAlign: 'left'
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#eef2ff'; e.currentTarget.style.borderColor = '#4338ca' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0' }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #4338ca, #6366f1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: '#fff'
                }}>
                  {(a.nome || 'A').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#1e293b' }}>{a.nome}</div>
                  {a.plano_nome && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{a.plano_nome}</div>
                  )}
                </div>
                <Icon icon="mdi:chevron-right" width="20" style={{ color: '#94a3b8', flexShrink: 0 }} />
              </button>
            ))}
          </div>

          <button onClick={() => { setEtapa('telefone'); setMultiplosAlunos([]) }}
            style={{
              marginTop: 16, padding: '10px', width: '100%', backgroundColor: 'transparent',
              border: 'none', cursor: 'pointer', fontSize: 13, color: '#94a3b8', fontWeight: 500
            }}>
            <Icon icon="mdi:arrow-left" width="14" style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Voltar
          </button>
        </div>
      </div>
    )
  }

  // Tela de nome (novo aluno)
  if (etapa === 'nome') {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } } @keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ width: '100%', maxWidth: 400, animation: 'fadeIn 0.4s ease both' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
            }}>
              <Icon icon="mdi:account-plus" width="32" style={{ color: '#22c55e' }} />
            </div>
            <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#fff' }}>Primeira vez aqui?</h2>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
              Digite seu nome para agendar uma aula experimental
            </p>
          </div>

          <div style={{
            background: '#fff', borderRadius: 16, padding: 24,
            boxShadow: '0 4px 24px rgba(0,0,0,0.2)'
          }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
              Seu nome completo
            </label>
            <input
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && cadastrarAluno()}
              placeholder="Ex: João Silva"
              style={{
                width: '100%', padding: '14px 16px', fontSize: 16, fontWeight: 600,
                border: '2px solid #e2e8f0', borderRadius: 12, outline: 'none',
                transition: 'border-color 0.2s', boxSizing: 'border-box'
              }}
              onFocus={e => e.target.style.borderColor = '#22c55e'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
              autoFocus
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => setEtapa('telefone')}
                style={{
                  padding: '14px 20px', background: '#f1f5f9', color: '#475569',
                  border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer'
                }}
              >
                <Icon icon="mdi:arrow-left" width="18" />
              </button>
              <button
                onClick={cadastrarAluno}
                disabled={cadastrando || nome.trim().length < 2}
                style={{
                  flex: 1, padding: '14px 24px',
                  background: nome.trim().length >= 2 ? 'linear-gradient(135deg, #22c55e, #16a34a)' : '#e2e8f0',
                  color: nome.trim().length >= 2 ? '#fff' : '#94a3b8',
                  border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700,
                  cursor: nome.trim().length >= 2 ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}
              >
                {cadastrando ? (
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.6s linear infinite' }} />
                ) : (
                  'Cadastrar e agendar'
                )}
              </button>
            </div>
          </div>
        </div>

        {toast && (
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: toast.tipo === 'error' ? '#ef4444' : '#22c55e', color: '#fff',
            padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 999
          }}>
            {toast.msg}
          </div>
        )}
      </div>
    )
  }

  // ===== TELA PRINCIPAL: GRADE DE AGENDAMENTO =====
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', paddingBottom: 80 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>

      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        padding: '12px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {empresa.logo_url ? (
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: '#fff', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <img src={empresa.logo_url} alt={empresa.nome} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 3 }} />
            </div>
          ) : (
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 800, color: '#fff', flexShrink: 0
            }}>
              {(empresa.nome || 'E').charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{empresa.nome}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Olá, {aluno?.nome?.split(' ')[0]}</div>
          </div>
        </div>

        {/* Creditos se for pacote */}
        {aluno?.aulas_restantes !== null && aluno?.aulas_restantes !== undefined && (
          <div style={{
            background: 'rgba(34,197,94,0.2)', padding: '6px 12px', borderRadius: 8,
            fontSize: 12, fontWeight: 700, color: '#22c55e'
          }}>
            {aluno.aulas_restantes} crédito{aluno.aulas_restantes !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', background: '#fff', borderBottom: '1px solid #e2e8f0',
        padding: '0 16px'
      }}>
        {[
          { id: 'agendar', label: 'Agendar', icon: 'mdi:calendar-plus' },
          { id: 'meus', label: `Meus (${meusAgendamentos.length})`, icon: 'mdi:calendar-check' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '12px 0', border: 'none', background: 'none',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              color: tab === t.id ? '#22c55e' : '#94a3b8',
              borderBottom: tab === t.id ? '2px solid #22c55e' : '2px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.2s'
            }}
          >
            <Icon icon={t.icon} width="18" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>

        {/* ===== TAB AGENDAR ===== */}
        {tab === 'agendar' && (
          <div style={{ animation: 'fadeIn 0.3s ease both' }}>
            {/* Seletor de dias */}
            <div style={{
              display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8,
              WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
              msOverflowStyle: 'none'
            }}>
              {datasDisponiveis.map(d => {
                const str = dataParaString(d)
                const isHoje = str === dataParaString(new Date())
                const sel = str === diaSelecionado
                return (
                  <button
                    key={str}
                    onClick={() => setDiaSelecionado(str)}
                    style={{
                      minWidth: 56, padding: '8px 4px', border: 'none', borderRadius: 12,
                      background: sel ? 'linear-gradient(135deg, #22c55e, #16a34a)' : '#fff',
                      color: sel ? '#fff' : '#475569',
                      cursor: 'pointer', textAlign: 'center', flexShrink: 0,
                      boxShadow: sel ? '0 2px 8px rgba(34,197,94,0.3)' : '0 1px 3px rgba(0,0,0,0.08)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.7, textTransform: 'uppercase' }}>
                      {DIAS_CURTO[d.getDay()]}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, margin: '2px 0' }}>
                      {d.getDate()}
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 500, opacity: 0.6 }}>
                      {isHoje ? 'Hoje' : formatarDataCurta(d)}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Header do dia */}
            {diaSelecionado && (
              <div style={{ margin: '16px 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon icon="mdi:calendar" width="18" style={{ color: '#22c55e' }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
                  {DIAS_SEMANA[new Date(diaSelecionado + 'T12:00:00').getDay()]}, {formatarDataCurta(new Date(diaSelecionado + 'T12:00:00'))}
                </span>
                <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                  {aulaDoDia.length} aula{aulaDoDia.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {/* Lista de aulas do dia */}
            {aulaDoDia.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: 40, background: '#fff', borderRadius: 16,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
              }}>
                <Icon icon="mdi:calendar-blank" width="48" style={{ color: '#cbd5e1' }} />
                <p style={{ margin: '12px 0 0', color: '#94a3b8', fontSize: 14 }}>Sem aulas neste dia</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {aulaDoDia.map(aula => {
                  const vagas = vagasRestantes(aula.id, diaSelecionado)
                  const lotado = vagas <= 0
                  const agendado = jaAgendou(aula.id, diaSelecionado)
                  const isAgendando = agendando === `${aula.id}_${diaSelecionado}`

                  return (
                    <div key={aula.id} style={{
                      background: '#fff', borderRadius: 14, padding: 16,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                      border: agendado ? '2px solid #22c55e' : '1px solid #f1f5f9',
                      opacity: lotado && !agendado ? 0.6 : 1,
                      transition: 'all 0.2s'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 44, height: 44, borderRadius: 12,
                            background: agendado ? 'linear-gradient(135deg, #22c55e, #16a34a)' : lotado ? '#fef2f2' : '#f0fdf4',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            <Icon
                              icon={agendado ? 'mdi:check' : lotado ? 'mdi:account-group' : 'mdi:dumbbell'}
                              width="22"
                              style={{ color: agendado ? '#fff' : lotado ? '#ef4444' : '#22c55e' }}
                            />
                          </div>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                              {formatarHorario(aula.horario)}
                            </div>
                            {aula.descricao && (
                              <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
                                {aula.descricao}
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          {agendado ? (
                            <div style={{
                              background: '#f0fdf4', padding: '4px 10px', borderRadius: 8,
                              fontSize: 11, fontWeight: 700, color: '#22c55e'
                            }}>
                              Agendado
                            </div>
                          ) : lotado ? (
                            <div style={{
                              background: '#fef2f2', padding: '4px 10px', borderRadius: 8,
                              fontSize: 11, fontWeight: 700, color: '#ef4444'
                            }}>
                              Esgotado
                            </div>
                          ) : (
                            <div style={{
                              fontSize: 12, color: vagas <= 3 ? '#f59e0b' : '#94a3b8', fontWeight: 600
                            }}>
                              {vagas} vaga{vagas !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Botao de acao */}
                      {!agendado && !lotado && (
                        <button
                          onClick={() => agendarAula(aula, diaSelecionado)}
                          disabled={isAgendando}
                          style={{
                            width: '100%', marginTop: 12, padding: '10px 16px',
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            color: '#fff', border: 'none', borderRadius: 10,
                            fontSize: 14, fontWeight: 700, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            transition: 'all 0.2s'
                          }}
                        >
                          {isAgendando ? (
                            <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.6s linear infinite' }} />
                          ) : (
                            <>
                              <Icon icon="mdi:calendar-plus" width="18" />
                              Agendar esta aula
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== TAB MEUS AGENDAMENTOS ===== */}
        {tab === 'meus' && (
          <div style={{ animation: 'fadeIn 0.3s ease both' }}>
            {meusAgendamentos.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: 48, background: '#fff', borderRadius: 16,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
              }}>
                <Icon icon="mdi:calendar-blank-outline" width="56" style={{ color: '#cbd5e1' }} />
                <p style={{ margin: '16px 0 4px', fontSize: 16, fontWeight: 700, color: '#475569' }}>Nenhum agendamento</p>
                <p style={{ margin: 0, fontSize: 14, color: '#94a3b8' }}>Escolha um horário na aba "Agendar"</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {meusAgendamentos.sort((a, b) => a.data.localeCompare(b.data)).map(ag => {
                  const dataAula = new Date(ag.data + 'T12:00:00')
                  const isCancelando = cancelando === ag.id

                  return (
                    <div key={ag.id} style={{
                      background: '#fff', borderRadius: 14, padding: 16,
                      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                      border: '1px solid #f1f5f9'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 44, height: 44, borderRadius: 12,
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            <Icon icon="mdi:check" width="22" style={{ color: '#fff' }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
                              {ag.aula?.descricao || 'Aula'} - {formatarHorario(ag.aula?.horario)}
                            </div>
                            <div style={{ fontSize: 13, color: '#64748b' }}>
                              {DIAS_SEMANA[dataAula.getDay()]}, {formatarDataCurta(dataAula)}
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => cancelarAgendamento(ag)}
                        disabled={isCancelando}
                        style={{
                          width: '100%', marginTop: 12, padding: '10px 16px',
                          background: '#fef2f2', color: '#ef4444',
                          border: '1px solid #fecaca', borderRadius: 10,
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          transition: 'all 0.2s'
                        }}
                      >
                        {isCancelando ? (
                          <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #fecaca', borderTopColor: '#ef4444', animation: 'spin 0.6s linear infinite' }} />
                        ) : (
                          <>
                            <Icon icon="mdi:calendar-remove" width="16" />
                            Cancelar agendamento
                          </>
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#fff', borderTop: '1px solid #e2e8f0',
        display: 'flex', justifyContent: 'center', padding: '8px 16px',
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))'
      }}>
        <button
          onClick={() => { setEtapa('telefone'); setAluno(null); setMeusAgendamentos([]); setTelefone(''); setNome('') }}
          style={{
            background: 'none', border: 'none', color: '#94a3b8',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px'
          }}
        >
          <Icon icon="mdi:logout" width="16" />
          Trocar conta
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 72, left: '50%', transform: 'translateX(-50%)',
          background: toast.tipo === 'error' ? '#ef4444' : '#22c55e', color: '#fff',
          padding: '12px 24px', borderRadius: 12, fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 999,
          animation: 'fadeIn 0.3s ease', whiteSpace: 'nowrap'
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
