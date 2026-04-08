import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from './supabaseClient'
import { Icon } from '@iconify/react'
import { showToast } from './Toast'
import ConfirmModal from './ConfirmModal'
import { SkeletonList } from './components/Skeleton'
import useWindowSize from './hooks/useWindowSize'
import { useUser } from './contexts/UserContext'
import { useUserPlan } from './hooks/useUserPlan'
import whatsappService from './services/whatsappService'

const DIAS_SEMANA = [
  { valor: 1, label: 'Segunda', abrev: 'Seg' },
  { valor: 2, label: 'Terça', abrev: 'Ter' },
  { valor: 3, label: 'Quarta', abrev: 'Qua' },
  { valor: 4, label: 'Quinta', abrev: 'Qui' },
  { valor: 5, label: 'Sexta', abrev: 'Sex' },
  { valor: 6, label: 'Sábado', abrev: 'Sáb' },
  { valor: 0, label: 'Domingo', abrev: 'Dom' }
]

const getDiaLabel = (dia) => DIAS_SEMANA.find(d => d.valor === dia)?.label || ''
const getDiaAbrev = (dia) => DIAS_SEMANA.find(d => d.valor === dia)?.abrev || ''

export default function GradeHorarios() {
  const { isMobile } = useWindowSize()
  const { userId } = useUser()
  const { isLocked } = useUserPlan()

  // Dados
  const [horarios, setHorarios] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [filtroDia, setFiltroDia] = useState('todos')
  const [busca, setBusca] = useState('')

  // Modal add/edit
  const [mostrarModal, setMostrarModal] = useState(false)
  const [editando, setEditando] = useState(null)

  // Form fields
  const [formClienteId, setFormClienteId] = useState('')
  const [formDiasSemana, setFormDiasSemana] = useState([1])
  const [formHorario, setFormHorario] = useState('09:00')
  const [formDescricao, setFormDescricao] = useState('')

  // Confirmação de exclusão
  const [confirmDelete, setConfirmDelete] = useState({ show: false, horario: null })

  // Salvando
  const [salvando, setSalvando] = useState(false)

  // Créditos de aulas (pacote)
  const [creditosAlunos, setCreditosAlunos] = useState({}) // { devedor_id: { aulas_restantes, aulas_total } }

  // Notificação de presença via WhatsApp
  const [enviarNotifPresenca, setEnviarNotifPresenca] = useState(false)

  // Vista
  const [vistaAtual, setVistaAtual] = useState('semana') // 'hoje' | 'semana' | 'agendamento'

  // Agendamento Online
  const [aulasAgendamento, setAulasAgendamento] = useState([])
  const [agendamentosOnline, setAgendamentosOnline] = useState([])
  const [loadingAgendamento, setLoadingAgendamento] = useState(false)
  const [mostrarModalAula, setMostrarModalAula] = useState(false)
  const [editandoAula, setEditandoAula] = useState(null)
  const [formAulaDias, setFormAulaDias] = useState([1])
  const [formAulaHorario, setFormAulaHorario] = useState('09:00')
  const [formAulaDescricao, setFormAulaDescricao] = useState('')
  const [formAulaCapacidade, setFormAulaCapacidade] = useState(10)
  const [salvandoAula, setSalvandoAula] = useState(false)
  const [confirmDeleteAula, setConfirmDeleteAula] = useState({ show: false, aula: null })
  const [confirmRemoverAgendamento, setConfirmRemoverAgendamento] = useState({ show: false, agendamento: null })
  const [fixosAulas, setFixosAulas] = useState([])
  const [mostrarModalFixo, setMostrarModalFixo] = useState(false)
  const [aulaParaFixo, setAulaParaFixo] = useState(null)
  const [fixoClienteId, setFixoClienteId] = useState('')
  const [confirmRemoverFixo, setConfirmRemoverFixo] = useState({ show: false, fixo: null })
  const [listaEspera, setListaEspera] = useState([]) // lista_espera com devedores join
  const [filtroAgendamentoDia, setFiltroAgendamentoDia] = useState('todos')
  const [formAulaHorarioFim, setFormAulaHorarioFim] = useState('18:00')
  const [formAulaIntervalo, setFormAulaIntervalo] = useState(60) // minutos

  // Presença (agendamento - por aula_id + devedor_id)
  const [presencasAgendamento, setPresencasAgendamento] = useState({}) // { `${aula_id}_${devedor_id}`: { id, presente, observacao } }
  const [mostrarModalPresencaAg, setMostrarModalPresencaAg] = useState(false)
  const [presencaAgAtual, setPresencaAgAtual] = useState(null) // { aula, devedor_id, nome, telefone, descricao }
  const [presencaAgPresente, setPresencaAgPresente] = useState(true)
  const [presencaAgObs, setPresencaAgObs] = useState('')
  const [salvandoPresencaAg, setSalvandoPresencaAg] = useState(false)

  // Presença (grade horários - legado)
  const [presencasHoje, setPresencasHoje] = useState({}) // { grade_horario_id: { id, presente, observacao } }
  const [mostrarModalPresenca, setMostrarModalPresenca] = useState(false)
  const [presencaAtual, setPresencaAtual] = useState(null) // { horario, presente, observacao }
  const [presencaObservacao, setPresencaObservacao] = useState('')
  const [presencaPresente, setPresencaPresente] = useState(true)
  const [salvandoPresenca, setSalvandoPresenca] = useState(false)
  const [presencaModoEdicao, setPresencaModoEdicao] = useState(false)

  const hojeStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }, [])

  // Carregar dados
  const carregarDados = useCallback(async () => {
    if (!userId) return
    setLoading(true)

    const [horariosRes, clientesRes] = await Promise.all([
      supabase
        .from('grade_horarios')
        .select('*, devedores(nome, telefone, foto_url)')
        .eq('user_id', userId)
        .order('dia_semana')
        .order('horario'),
      supabase
        .from('devedores')
        .select('id, nome, telefone, aulas_restantes, aulas_total, foto_url')
        .eq('user_id', userId)
        .or('lixo.is.null,lixo.eq.false')
        .order('nome')
    ])

    if (horariosRes.data) setHorarios(horariosRes.data)
    if (clientesRes.data) {
      setClientes(clientesRes.data)
      const credMap = {}
      clientesRes.data.forEach(c => {
        if (c.aulas_restantes !== null && c.aulas_restantes !== undefined) {
          credMap[c.id] = { aulas_restantes: c.aulas_restantes, aulas_total: c.aulas_total }
        }
      })
      setCreditosAlunos(credMap)
    }

    // Carregar presenças de hoje
    const { data: presencasData } = await supabase
      .from('presencas')
      .select('*')
      .eq('user_id', userId)
      .eq('data', hojeStr)

    if (presencasData) {
      const map = {}
      presencasData.forEach(p => { map[p.grade_horario_id] = p })
      setPresencasHoje(map)
    }

    // Carregar config de notificação de presença
    const { data: configNotif } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', `${userId}_notif_presenca_whatsapp`)
      .maybeSingle()
    setEnviarNotifPresenca(configNotif?.valor === 'true')

    setLoading(false)
  }, [userId, hojeStr])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Carregar dados de agendamento online
  const carregarAgendamento = useCallback(async () => {
    if (!userId) return
    setLoadingAgendamento(true)

    const [aulasRes, agRes, fixosRes] = await Promise.all([
      supabase
        .from('aulas')
        .select('*')
        .eq('user_id', userId)
        .order('dia_semana')
        .order('horario'),
      supabase
        .from('agendamentos')
        .select('*, devedores(nome, telefone, origem, assinatura_ativa, plano_id)')
        .eq('user_id', userId)
        .eq('status', 'confirmado')
        .gte('data', hojeStr)
        .order('data'),
      supabase
        .from('aulas_fixos')
        .select('*, devedores(nome, telefone)')
        .eq('user_id', userId)
    ])

    // Buscar lista de espera
    const { data: filaRes } = await supabase
      .from('lista_espera')
      .select('*, devedores(nome, telefone)')
      .eq('user_id', userId)
      .eq('status', 'aguardando')
      .order('posicao')

    if (aulasRes.data) setAulasAgendamento(aulasRes.data)
    if (agRes.data) setAgendamentosOnline(agRes.data)
    if (fixosRes.data) setFixosAulas(fixosRes.data)
    if (filaRes) setListaEspera(filaRes)

    // Carregar presenças de hoje por aula_id
    const { data: presAgData } = await supabase
      .from('presencas')
      .select('*')
      .eq('user_id', userId)
      .eq('data', hojeStr)
      .not('aula_id', 'is', null)
    if (presAgData) {
      const map = {}
      presAgData.forEach(p => { if (p.aula_id && p.devedor_id) map[`${p.aula_id}_${p.devedor_id}`] = p })
      setPresencasAgendamento(map)
    }
    setLoadingAgendamento(false)
  }, [userId, hojeStr])

  useEffect(() => {
    if (vistaAtual === 'agendamento') carregarAgendamento()
  }, [vistaAtual, carregarAgendamento])

  // Realtime: atualizar quando aluno agenda ou cancela pelo link público
  useEffect(() => {
    if (!userId || vistaAtual !== 'agendamento') return
    const channel = supabase
      .channel(`agendamento-grade-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agendamentos', filter: `user_id=eq.${userId}` }, () => carregarAgendamento())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, vistaAtual, carregarAgendamento])

  // Cancelar agendamento pelo admin
  const cancelarAgendamentoAdmin = async (agendamento) => {
    try {
      // 1. Cancelar agendamento
      const { error } = await supabase
        .from('agendamentos')
        .update({ status: 'cancelado', cancelado_em: new Date().toISOString() })
        .eq('id', agendamento.id)

      if (error) throw error

      // 2. Devolver crédito se aluno tem pacote
      const { data: devedor } = await supabase
        .from('devedores')
        .select('aulas_restantes')
        .eq('id', agendamento.devedor_id)
        .single()

      if (devedor && devedor.aulas_restantes !== null) {
        await supabase
          .from('devedores')
          .update({ aulas_restantes: devedor.aulas_restantes + 1 })
          .eq('id', agendamento.devedor_id)
      }

      showToast(`${agendamento?.devedores?.nome?.split(' ')[0] || 'Aluno'} removido do horário`, 'success')

      // Processar lista de espera: notificar próximo da fila
      try {
        const { data: proximoFila } = await supabase
          .from('lista_espera')
          .select('id, devedor_id')
          .eq('aula_id', agendamento.aula_id)
          .eq('data', agendamento.data)
          .eq('status', 'aguardando')
          .order('posicao', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (proximoFila) {
          const expiraEm = new Date(Date.now() + 60 * 60 * 1000).toISOString()
          await supabase.from('lista_espera').update({
            status: 'notificado',
            notificado_em: new Date().toISOString(),
            expira_em: expiraEm
          }).eq('id', proximoFila.id)

          // Notificar aluno da fila via WhatsApp
          const { data: alunoFila } = await supabase.from('devedores').select('nome, telefone').eq('id', proximoFila.devedor_id).single()
          if (alunoFila?.telefone) {
            const { data: aulaInfo } = await supabase.from('aulas').select('descricao, horario').eq('id', agendamento.aula_id).single()
            const { data: empresaInfo } = await supabase.from('usuarios').select('agendamento_slug').eq('id', userId).single()
            const linkConfirmacao = `https://www.mensalli.com.br/agendar/${empresaInfo?.agendamento_slug || ''}?confirmar=${proximoFila.id}`
            const msgFila = `🎉 *Vaga disponível!*\n\nUma vaga abriu na aula que você está esperando:\n\n📚 ${aulaInfo?.descricao || 'Aula'}\n📅 ${new Date(agendamento.data + 'T12:00:00').toLocaleDateString('pt-BR')}\n🕐 ${aulaInfo?.horario || ''}\n\nConfirme sua vaga em até 1 hora:\n${linkConfirmacao}\n\nSe não confirmar a tempo, a vaga passa para o próximo da fila.`
            await whatsappService.enviarMensagem(alunoFila.telefone, msgFila)
            showToast(`${alunoFila.nome?.split(' ')[0]} foi notificado da vaga (lista de espera)`, 'info')
          }
        }
      } catch (filaErr) {
        console.error('Erro ao processar fila de espera:', filaErr)
      }

      carregarAgendamento()
    } catch (err) {
      console.error('Erro ao cancelar agendamento:', err)
      showToast('Erro ao remover aluno', 'error')
    }
  }

  // === FIXOS ===
  const adicionarFixo = async () => {
    if (!fixoClienteId || !aulaParaFixo) return
    try {
      const jaExiste = fixosAulas.find(f => f.aula_id === aulaParaFixo.id && f.devedor_id === fixoClienteId)
      if (jaExiste) { showToast('Aluno já é fixo nesta aula', 'warning'); return }
      const fixosNaAula = fixosAulas.filter(f => f.aula_id === aulaParaFixo.id).length
      const agendadosNaAula = contagemAgendamentos(aulaParaFixo.id)
      if (fixosNaAula + agendadosNaAula >= aulaParaFixo.capacidade) {
        showToast('Aula lotada, sem vagas disponíveis', 'warning'); return
      }
      const { error } = await supabase.from('aulas_fixos').insert({ aula_id: aulaParaFixo.id, devedor_id: fixoClienteId, user_id: userId })
      if (error) throw error
      showToast('Aluno fixo adicionado!', 'success')
      setMostrarModalFixo(false); setFixoClienteId(''); carregarAgendamento()
    } catch (err) { console.error(err); showToast('Erro ao adicionar aluno fixo', 'error') }
  }

  const removerFixo = async (fixo) => {
    try {
      const { error } = await supabase.from('aulas_fixos').delete().eq('id', fixo.id)
      if (error) throw error
      showToast(`${fixo?.devedores?.nome?.split(' ')[0] || 'Aluno'} removido dos fixos`, 'success')
      carregarAgendamento()
    } catch (err) { console.error(err); showToast('Erro ao remover aluno fixo', 'error') }
  }

  // === PRESENÇA AGENDAMENTO ===
  const presAgKey = (aulaId, devedorId) => `${aulaId}_${devedorId}`

  const abrirPresencaAgendamento = (aula, devedorId, devedores) => {
    // Só funciona se a aula é do dia de hoje
    if (aula.dia_semana !== new Date().getDay()) return
    const key = presAgKey(aula.id, devedorId)
    const existente = presencasAgendamento[key]
    setPresencaAgAtual({ aula, devedor_id: devedorId, devedores })
    setPresencaAgPresente(existente ? existente.presente : true)
    setPresencaAgObs(existente ? (existente.observacao || '') : '')
    setMostrarModalPresencaAg(true)
  }

  const salvarPresencaAgendamento = async () => {
    if (!presencaAgAtual) return
    setSalvandoPresencaAg(true)
    const key = presAgKey(presencaAgAtual.aula.id, presencaAgAtual.devedor_id)
    const existente = presencasAgendamento[key]

    let result
    if (existente) {
      result = await supabase.from('presencas')
        .update({ presente: presencaAgPresente, observacao: presencaAgObs.trim() || null, updated_at: new Date().toISOString() })
        .eq('id', existente.id).select()
    } else {
      result = await supabase.from('presencas').insert({
        user_id: userId, aula_id: presencaAgAtual.aula.id, devedor_id: presencaAgAtual.devedor_id,
        data: hojeStr, presente: presencaAgPresente, observacao: presencaAgObs.trim() || null
      }).select()
    }

    if (result.error) {
      showToast('Erro ao salvar presença: ' + result.error.message, 'error')
    } else {
      setPresencasAgendamento(prev => ({ ...prev, [key]: result.data[0] }))

      // Créditos
      const creditos = creditosAlunos[presencaAgAtual.devedor_id]
      let novoRestante = creditos?.aulas_restantes
      if (creditos) {
        if (!existente && presencaAgPresente) novoRestante = Math.max(creditos.aulas_restantes - 1, 0)
        else if (existente && existente.presente && !presencaAgPresente) novoRestante = creditos.aulas_restantes + 1
        else if (existente && !existente.presente && presencaAgPresente) novoRestante = Math.max(creditos.aulas_restantes - 1, 0)

        if (novoRestante !== creditos.aulas_restantes) {
          await supabase.from('devedores').update({ aulas_restantes: novoRestante }).eq('id', presencaAgAtual.devedor_id)
          setCreditosAlunos(prev => ({ ...prev, [presencaAgAtual.devedor_id]: { ...prev[presencaAgAtual.devedor_id], aulas_restantes: novoRestante } }))
          if (novoRestante === 0) showToast(`${presencaAgAtual.devedores?.nome || 'Aluno'} usou todas as aulas do pacote!`, 'warning')
          else if (novoRestante <= 2) showToast(`${presencaAgAtual.devedores?.nome || 'Aluno'} tem ${novoRestante} aula(s) restante(s)`, 'warning')
        }
      }
      showToast(presencaAgPresente ? 'Presença registrada!' : 'Falta registrada!', 'success')

      // WhatsApp
      if (enviarNotifPresenca && presencaAgAtual.devedores?.telefone) {
        try {
          const nome = presencaAgAtual.devedores?.nome || 'Aluno'
          const cred = creditos ? { ...creditos, aulas_restantes: novoRestante } : null
          let msg = ''
          if (presencaAgPresente) {
            if (cred) {
              const aulaNum = cred.aulas_total - cred.aulas_restantes
              msg = `✅ Presença confirmada, ${nome}!\n\n📚 Aula ${aulaNum} de ${cred.aulas_total}${presencaAgAtual.aula.descricao ? ` - ${presencaAgAtual.aula.descricao}` : ''}${presencaAgObs.trim() ? `\n📝 ${presencaAgObs.trim()}` : ''}\n\n📊 Restam ${cred.aulas_restantes} aula(s) no seu pacote.`
            } else {
              msg = `✅ Presença confirmada, ${nome}!${presencaAgAtual.aula.descricao ? `\n📚 ${presencaAgAtual.aula.descricao}` : ''}${presencaAgObs.trim() ? `\n📝 ${presencaAgObs.trim()}` : ''}`
            }
          } else {
            msg = `❌ Falta registrada, ${nome}.${presencaAgAtual.aula.descricao ? `\n📚 ${presencaAgAtual.aula.descricao}` : ''}${presencaAgObs.trim() ? `\n📝 Motivo: ${presencaAgObs.trim()}` : ''}`
            if (cred) msg += `\n\n📊 Você tem ${cred.aulas_restantes} aula(s) restante(s).`
          }
          await whatsappService.enviarMensagem(presencaAgAtual.devedores.telefone, msg)
        } catch (err) { console.error('Erro notificação presença:', err) }
      }

      setMostrarModalPresencaAg(false)
    }
    setSalvandoPresencaAg(false)
  }

  // Salvar config de notificação
  const toggleNotifPresenca = async (novoValor) => {
    setEnviarNotifPresenca(novoValor)
    await supabase.from('config').upsert({
      chave: `${userId}_notif_presenca_whatsapp`,
      valor: novoValor ? 'true' : 'false',
      user_id: userId
    }, { onConflict: 'chave' })
  }

  // Enviar notificação de presença via WhatsApp (fire-and-forget)
  const enviarNotificacaoPresenca = async (horario, presente, observacao, creditoAtual) => {
    if (!enviarNotifPresenca) return
    const telefone = horario.devedores?.telefone
    const nome = horario.devedores?.nome || 'Aluno'
    if (!telefone) return

    try {
      let mensagem = ''
      if (presente) {
        const cred = creditoAtual || creditosAlunos[horario.devedor_id]
        if (cred) {
          const aulaNumero = cred.aulas_total - cred.aulas_restantes
          mensagem = `✅ Presença confirmada, ${nome}!\n\n📚 Aula ${aulaNumero} de ${cred.aulas_total}${horario.descricao ? ` - ${horario.descricao}` : ''}${observacao ? `\n📝 ${observacao}` : ''}\n\n📊 Restam ${cred.aulas_restantes} aula(s) no seu pacote.`
        } else {
          mensagem = `✅ Presença confirmada, ${nome}!${horario.descricao ? `\n📚 ${horario.descricao}` : ''}${observacao ? `\n📝 ${observacao}` : ''}`
        }
      } else {
        mensagem = `❌ Falta registrada, ${nome}.${horario.descricao ? `\n📚 ${horario.descricao}` : ''}${observacao ? `\n📝 Motivo: ${observacao}` : ''}`
        const cred = creditosAlunos[horario.devedor_id]
        if (cred) {
          mensagem += `\n\n📊 Você tem ${cred.aulas_restantes} aula(s) restante(s) no seu pacote.`
        }
      }

      await whatsappService.enviarMensagem(telefone, mensagem)
    } catch (err) {
      console.error('Erro ao enviar notificação de presença:', err)
    }
  }

  // Filtrar horários
  const horariosFiltrados = horarios.filter(h => {
    if (filtroDia !== 'todos' && h.dia_semana !== Number(filtroDia)) return false
    if (busca) {
      const termo = busca.toLowerCase()
      const nomeCliente = h.devedores?.nome?.toLowerCase() || ''
      const descricao = h.descricao?.toLowerCase() || ''
      if (!nomeCliente.includes(termo) && !descricao.includes(termo)) return false
    }
    return true
  })

  // Agrupar por dia da semana
  const horariosAgrupados = DIAS_SEMANA.reduce((acc, dia) => {
    const dodia = horariosFiltrados.filter(h => h.dia_semana === dia.valor)
    if (dodia.length > 0) acc.push({ dia, horarios: dodia })
    return acc
  }, [])

  // Abrir modal para novo
  const abrirModalNovo = () => {
    setEditando(null)
    setFormClienteId('')
    setFormDiasSemana([1])
    setFormHorario('09:00')
    setFormDescricao('')
    setMostrarModal(true)
  }

  // Abrir modal para editar
  const abrirModalEditar = (h) => {
    setEditando(h)
    setFormClienteId(h.devedor_id)
    setFormDiasSemana([h.dia_semana])
    setFormHorario(h.horario?.substring(0, 5) || '09:00')
    setFormDescricao(h.descricao || '')
    setMostrarModal(true)
  }

  // Toggle dia no array (multi-select para novo)
  const toggleDiaSemana = (valor) => {
    if (editando) {
      setFormDiasSemana([valor])
      return
    }
    setFormDiasSemana(prev => {
      if (prev.includes(valor)) {
        if (prev.length === 1) return prev // manter pelo menos 1
        return prev.filter(d => d !== valor)
      }
      return [...prev, valor]
    })
  }

  // Salvar (criar ou atualizar)
  const salvarHorario = async () => {
    if (!formClienteId) {
      showToast('Selecione um aluno', 'warning')
      return
    }
    if (!formHorario) {
      showToast('Informe o horário', 'warning')
      return
    }
    if (formDiasSemana.length === 0) {
      showToast('Selecione pelo menos um dia', 'warning')
      return
    }

    setSalvando(true)

    if (editando) {
      const { error } = await supabase
        .from('grade_horarios')
        .update({
          devedor_id: formClienteId,
          dia_semana: formDiasSemana[0],
          horario: formHorario,
          descricao: formDescricao.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', editando.id)

      if (error) {
        showToast('Erro ao atualizar: ' + error.message, 'error')
      } else {
        showToast('Horário atualizado!', 'success')
        setMostrarModal(false)
        carregarDados()
      }
    } else {
      // Criar um registro para cada dia selecionado
      const registros = formDiasSemana.map(dia => ({
        user_id: userId,
        devedor_id: formClienteId,
        dia_semana: dia,
        horario: formHorario,
        descricao: formDescricao.trim()
      }))

      const { error } = await supabase
        .from('grade_horarios')
        .insert(registros)

      if (error) {
        showToast('Erro ao criar: ' + error.message, 'error')
      } else {
        const diasLabel = formDiasSemana.map(d => getDiaAbrev(d)).join(', ')
        showToast(formDiasSemana.length > 1
          ? `${formDiasSemana.length} horários adicionados (${diasLabel})!`
          : 'Horário adicionado!', 'success')
        setMostrarModal(false)
        carregarDados()
      }
    }

    setSalvando(false)
  }

  // Excluir
  const excluirHorario = async (id) => {
    const { error } = await supabase
      .from('grade_horarios')
      .delete()
      .eq('id', id)

    if (error) {
      showToast('Erro ao excluir: ' + error.message, 'error')
    } else {
      showToast('Horário removido!', 'success')
      setHorarios(prev => prev.filter(h => h.id !== id))
    }
    setConfirmDelete({ show: false, horario: null })
  }

  // Toggle ativo
  const toggleAtivo = async (h) => {
    const { error } = await supabase
      .from('grade_horarios')
      .update({ ativo: !h.ativo, updated_at: new Date().toISOString() })
      .eq('id', h.id)

    if (!error) {
      setHorarios(prev => prev.map(item =>
        item.id === h.id ? { ...item, ativo: !item.ativo } : item
      ))
    }
  }

  // Abrir modal de presença
  const abrirPresenca = (h) => {
    const existente = presencasHoje[h.id]
    setPresencaAtual(h)
    setPresencaPresente(existente ? existente.presente : true)
    setPresencaObservacao(existente ? (existente.observacao || '') : '')
    setPresencaModoEdicao(!existente) // se já existe, abre em modo visualização
    setMostrarModalPresenca(true)
  }

  // Salvar presença
  const salvarPresenca = async () => {
    if (!presencaAtual) return
    setSalvandoPresenca(true)

    const existente = presencasHoje[presencaAtual.id]
    const dados = {
      user_id: userId,
      grade_horario_id: presencaAtual.id,
      devedor_id: presencaAtual.devedor_id,
      data: hojeStr,
      presente: presencaPresente,
      observacao: presencaObservacao.trim() || null,
      updated_at: new Date().toISOString()
    }

    let result
    if (existente) {
      result = await supabase
        .from('presencas')
        .update({ presente: dados.presente, observacao: dados.observacao, updated_at: dados.updated_at })
        .eq('id', existente.id)
        .select()
    } else {
      result = await supabase
        .from('presencas')
        .insert(dados)
        .select()
    }

    if (result.error) {
      showToast('Erro ao salvar presença: ' + result.error.message, 'error')
    } else {
      const saved = result.data[0]
      setPresencasHoje(prev => ({ ...prev, [presencaAtual.id]: saved }))

      // Auto-decremento/incremento de créditos de pacote
      const creditos = creditosAlunos[presencaAtual.devedor_id]
      let novoRestante = creditos?.aulas_restantes
      if (creditos) {
        if (!existente && presencaPresente) {
          // Nova presença marcada como presente → decrementar
          novoRestante = Math.max(creditos.aulas_restantes - 1, 0)
        } else if (existente && existente.presente && !presencaPresente) {
          // Mudou de presente → falta → incrementar de volta
          novoRestante = creditos.aulas_restantes + 1
        } else if (existente && !existente.presente && presencaPresente) {
          // Mudou de falta → presente → decrementar
          novoRestante = Math.max(creditos.aulas_restantes - 1, 0)
        }

        if (novoRestante !== creditos.aulas_restantes) {
          await supabase.from('devedores').update({ aulas_restantes: novoRestante }).eq('id', presencaAtual.devedor_id)
          setCreditosAlunos(prev => ({
            ...prev,
            [presencaAtual.devedor_id]: { ...prev[presencaAtual.devedor_id], aulas_restantes: novoRestante }
          }))

          if (novoRestante === 0) {
            showToast(`${presencaAtual.devedores?.nome || 'Aluno'} usou todas as aulas do pacote!`, 'warning')
          } else if (novoRestante <= 2) {
            showToast(`${presencaAtual.devedores?.nome || 'Aluno'} tem ${novoRestante} aula(s) restante(s)`, 'warning')
          }
        }
      }

      showToast(presencaPresente ? 'Presença registrada!' : 'Falta registrada!', 'success')

      // Enviar notificação via WhatsApp com crédito atualizado (fire-and-forget)
      const credParaNotif = creditos ? { ...creditos, aulas_restantes: novoRestante } : null
      enviarNotificacaoPresenca(presencaAtual, presencaPresente, presencaObservacao.trim(), credParaNotif)

      setMostrarModalPresenca(false)
    }
    setSalvandoPresenca(false)
  }

  // Remover presença
  const removerPresenca = async () => {
    if (!presencaAtual) return
    const existente = presencasHoje[presencaAtual.id]
    if (!existente) return

    setSalvandoPresenca(true)
    const { error } = await supabase
      .from('presencas')
      .delete()
      .eq('id', existente.id)

    if (error) {
      showToast('Erro ao remover presença: ' + error.message, 'error')
    } else {
      // Se era presente, incrementar créditos de volta
      if (existente.presente) {
        const creditos = creditosAlunos[presencaAtual.devedor_id]
        if (creditos) {
          const novoRestante = creditos.aulas_restantes + 1
          await supabase.from('devedores').update({ aulas_restantes: novoRestante }).eq('id', presencaAtual.devedor_id)
          setCreditosAlunos(prev => ({
            ...prev,
            [presencaAtual.devedor_id]: { ...prev[presencaAtual.devedor_id], aulas_restantes: novoRestante }
          }))
        }
      }

      setPresencasHoje(prev => {
        const novo = { ...prev }
        delete novo[presencaAtual.id]
        return novo
      })
      showToast('Presença removida!', 'success')
      setMostrarModalPresenca(false)
    }
    setSalvandoPresenca(false)
  }

  // ===== CRUD Aulas de Agendamento Online =====
  const abrirModalNovaAula = () => {
    setEditandoAula(null)
    setFormAulaDias([1, 2, 3, 4, 5])
    setFormAulaHorario('09:00')
    setFormAulaHorarioFim('18:00')
    setFormAulaIntervalo(60)
    setFormAulaDescricao('')
    setFormAulaCapacidade(10)
    setMostrarModalAula(true)
  }

  const abrirModalEditarAula = (aula) => {
    setEditandoAula(aula)
    setFormAulaDias([aula.dia_semana])
    setFormAulaHorario(aula.horario?.substring(0, 5) || '09:00')
    setFormAulaDescricao(aula.descricao || '')
    setFormAulaCapacidade(aula.capacidade || 10)
    setMostrarModalAula(true)
  }

  // Gerar lista de horários entre inicio e fim com intervalo
  const gerarHorarios = (inicio, fim, intervaloMin) => {
    const horarios = []
    const [hI, mI] = inicio.split(':').map(Number)
    const [hF, mF] = fim.split(':').map(Number)
    let minAtual = hI * 60 + mI
    const minFim = hF * 60 + mF
    while (minAtual < minFim) {
      const h = String(Math.floor(minAtual / 60)).padStart(2, '0')
      const m = String(minAtual % 60).padStart(2, '0')
      horarios.push(`${h}:${m}`)
      minAtual += intervaloMin
    }
    return horarios
  }

  const salvarAula = async () => {
    if (!formAulaHorario) { showToast('Informe o horário', 'warning'); return }
    if (formAulaDias.length === 0) { showToast('Selecione pelo menos um dia', 'warning'); return }
    if (formAulaCapacidade < 1) { showToast('Capacidade mínima é 1', 'warning'); return }

    setSalvandoAula(true)

    if (editandoAula) {
      const { error } = await supabase
        .from('aulas')
        .update({
          dia_semana: formAulaDias[0],
          horario: formAulaHorario,
          descricao: formAulaDescricao.trim(),
          capacidade: formAulaCapacidade,
          updated_at: new Date().toISOString()
        })
        .eq('id', editandoAula.id)

      if (error) {
        showToast('Erro ao atualizar: ' + error.message, 'error')
      } else {
        showToast('Aula atualizada!', 'success')
        setMostrarModalAula(false)
        carregarAgendamento()
      }
    } else {
      // Gerar todos os horários entre inicio e fim
      const horarios = gerarHorarios(formAulaHorario, formAulaHorarioFim, formAulaIntervalo)

      if (horarios.length === 0) {
        showToast('Horário de início deve ser menor que o de fim', 'warning')
        setSalvandoAula(false)
        return
      }

      // Criar registro para cada dia × horário
      const registros = []
      for (const dia of formAulaDias) {
        for (const horario of horarios) {
          registros.push({
            user_id: userId,
            dia_semana: dia,
            horario,
            descricao: formAulaDescricao.trim(),
            capacidade: formAulaCapacidade
          })
        }
      }

      const { error } = await supabase.from('aulas').insert(registros)

      if (error) {
        showToast('Erro ao criar: ' + error.message, 'error')
      } else {
        showToast(`${registros.length} aulas criadas! (${formAulaDias.length} dia(s) × ${horarios.length} horário(s))`, 'success')
        setMostrarModalAula(false)
        carregarAgendamento()
      }
    }
    setSalvandoAula(false)
  }

  const excluirAula = async (id) => {
    const { error } = await supabase.from('aulas').delete().eq('id', id)
    if (error) {
      showToast('Erro ao excluir: ' + error.message, 'error')
    } else {
      showToast('Aula removida!', 'success')
      setAulasAgendamento(prev => prev.filter(a => a.id !== id))
    }
    setConfirmDeleteAula({ show: false, aula: null })
  }

  const toggleAtivoAula = async (aula) => {
    const { error } = await supabase
      .from('aulas')
      .update({ ativo: !aula.ativo, updated_at: new Date().toISOString() })
      .eq('id', aula.id)
    if (!error) {
      setAulasAgendamento(prev => prev.map(a => a.id === aula.id ? { ...a, ativo: !a.ativo } : a))
    }
  }

  // Agrupar aulas agendamento por dia
  const aulasAgendamentoAgrupadas = DIAS_SEMANA.reduce((acc, dia) => {
    const filtradas = aulasAgendamento.filter(a => {
      if (filtroAgendamentoDia !== 'todos' && a.dia_semana !== Number(filtroAgendamentoDia)) return false
      return a.dia_semana === dia.valor
    })
    if (filtradas.length > 0) acc.push({ dia, aulas: filtradas })
    return acc
  }, [])

  // Contar agendamentos por aula
  const contagemAgendamentos = (aulaId) => {
    return agendamentosOnline.filter(a => a.aula_id === aulaId).length
  }

  const contagemFixos = (aulaId) => {
    return fixosAulas.filter(f => f.aula_id === aulaId).length
  }

  const totalOcupado = (aulaId) => {
    return contagemFixos(aulaId) + contagemAgendamentos(aulaId)
  }

  const contagemFilaEspera = (aulaId) => {
    return listaEspera.filter(f => f.aula_id === aulaId).length
  }

  // Contadores
  const totalHorarios = horarios.length
  const totalAtivos = horarios.filter(h => h.ativo).length
  const totalAlunos = new Set(horarios.map(h => h.devedor_id)).size

  if (loading) {
    return (
      <div style={{ flex: 1, padding: isMobile ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh' }}>
        <SkeletonList count={6} />
      </div>
    )
  }

  // Cores por tipo de aula (baseado na descricao, cicla entre cores)
  const CORES_AULA = [
    { bg: '#ede9fe', border: '#8b5cf6', text: '#5b21b6' },
    { bg: '#e0f2fe', border: '#0ea5e9', text: '#0369a1' },
    { bg: '#fce7f3', border: '#ec4899', text: '#be185d' },
    { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    { bg: '#e0e7ff', border: '#6366f1', text: '#3730a3' }
  ]

  const descricoesCores = {}
  let corIndex = 0
  const getCorAula = (descricao) => {
    const key = (descricao || '').toLowerCase().trim() || '_default'
    if (!descricoesCores[key]) {
      descricoesCores[key] = CORES_AULA[corIndex % CORES_AULA.length]
      corIndex++
    }
    return descricoesCores[key]
  }

  // Dia de hoje (para destaque)
  const hoje = new Date().getDay() // 0=Dom, 1=Seg...

  // Grid: todos os dias (para visão calendário)
  const diasParaGrid = filtroDia === 'todos'
    ? DIAS_SEMANA
    : DIAS_SEMANA.filter(d => d.valor === Number(filtroDia))

  return (
    <div style={{ flex: 1, padding: isMobile ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh' }}>
      {/* Título */}
      <div style={{ marginBottom: isMobile ? '16px' : '20px' }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? '16px' : '18px', fontWeight: '600', color: '#344848' }}>
          Grade de Horários
        </h2>
        <p style={{ margin: '5px 0 0 0', fontSize: isMobile ? '13px' : '14px', color: '#666' }}>
          {horariosFiltrados.length} de {totalHorarios} aula(s)
          <span style={{
            marginLeft: '10px',
            padding: '2px 8px',
            backgroundColor: '#e8f5e9',
            color: '#2e7d32',
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: '600'
          }}>
            {totalAtivos} ativas
          </span>
          <span style={{
            marginLeft: '6px',
            padding: '2px 8px',
            backgroundColor: '#eef2ff',
            color: '#4338ca',
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: '600'
          }}>
            {totalAlunos} aluno{totalAlunos !== 1 ? 's' : ''}
          </span>
        </p>
      </div>

      {/* Toggle Hoje / Semana + Notificação */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
      <div style={{
        display: 'inline-flex',
        gap: '4px',
        backgroundColor: '#f3f4f6',
        borderRadius: '10px',
        padding: '4px'
      }}>
        {[
          { value: 'hoje', label: 'Hoje', icon: 'mdi:calendar-today' },
          { value: 'semana', label: 'Semana', icon: 'mdi:calendar-week' },
          { value: 'agendamento', label: isMobile ? 'Online' : 'Agendamento', icon: 'mdi:calendar-cursor' }
        ].map(v => (
          <button
            key={v.value}
            onClick={() => {
              setVistaAtual(v.value)
              if (v.value === 'hoje') setFiltroDia(hoje.toString())
            }}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: vistaAtual === v.value ? 'white' : 'transparent',
              color: vistaAtual === v.value ? '#1a1a1a' : '#555',
              fontSize: '13px',
              fontWeight: vistaAtual === v.value ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: vistaAtual === v.value ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Icon icon={v.icon} width={16} />
            {v.label}
          </button>
        ))}
      </div>

      {/* Toggle notificação WhatsApp */}
      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer',
        fontSize: '12px',
        color: enviarNotifPresenca ? '#16a34a' : '#999',
        fontWeight: '500'
      }}>
        <div
          onClick={() => toggleNotifPresenca(!enviarNotifPresenca)}
          style={{
            width: '36px',
            height: '20px',
            borderRadius: '10px',
            backgroundColor: enviarNotifPresenca ? '#16a34a' : '#d1d5db',
            position: 'relative',
            transition: 'background-color 0.2s',
            cursor: 'pointer',
            flexShrink: 0
          }}
        >
          <div style={{
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: 'white',
            position: 'absolute',
            top: '2px',
            left: enviarNotifPresenca ? '18px' : '2px',
            transition: 'left 0.2s',
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
          }} />
        </div>
        <Icon icon="mdi:whatsapp" width={16} style={{ color: enviarNotifPresenca ? '#25D366' : '#999' }} />
        {!isMobile && (enviarNotifPresenca ? 'Notificar aluno' : 'Notificação off')}
      </label>
      </div>

      {/* === VISÃO HOJE === */}
      {vistaAtual === 'hoje' && (() => {
        const aulasHoje = horarios.filter(h => h.dia_semana === hoje && h.ativo).sort((a, b) => a.horario.localeCompare(b.horario))
        const presencasMarcadas = aulasHoje.filter(h => presencasHoje[h.id]).length
        const creditosBaixos = aulasHoje.filter(h => creditosAlunos[h.devedor_id] && creditosAlunos[h.devedor_id].aulas_restantes <= 2).length

        return (
          <div style={{ marginBottom: '24px' }}>
            {/* Summary Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              marginBottom: '20px'
            }}>
              <div style={{
                backgroundColor: '#eff6ff',
                borderRadius: '10px',
                padding: '14px',
                border: '1px solid #bfdbfe',
                textAlign: 'center'
              }}>
                <Icon icon="mdi:calendar-check" width={24} style={{ color: '#3b82f6', marginBottom: '4px' }} />
                <p style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#3b82f6' }}>{aulasHoje.length}</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Aulas Hoje</p>
              </div>
              <div style={{
                backgroundColor: '#f0fdf4',
                borderRadius: '10px',
                padding: '14px',
                border: '1px solid #bbf7d0',
                textAlign: 'center'
              }}>
                <Icon icon="mdi:check-circle-outline" width={24} style={{ color: '#16a34a', marginBottom: '4px' }} />
                <p style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: '#16a34a' }}>{presencasMarcadas}/{aulasHoje.length}</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Presenças</p>
              </div>
              <div style={{
                backgroundColor: creditosBaixos > 0 ? '#fffbeb' : '#f8f9fa',
                borderRadius: '10px',
                padding: '14px',
                border: `1px solid ${creditosBaixos > 0 ? '#fde68a' : '#e5e7eb'}`,
                textAlign: 'center'
              }}>
                <Icon icon="mdi:alert-circle-outline" width={24} style={{ color: creditosBaixos > 0 ? '#d97706' : '#9ca3af', marginBottom: '4px' }} />
                <p style={{ margin: 0, fontSize: '22px', fontWeight: '700', color: creditosBaixos > 0 ? '#d97706' : '#9ca3af' }}>{creditosBaixos}</p>
                <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Créditos Baixos</p>
              </div>
            </div>

            {/* Alerta créditos baixos */}
            {creditosBaixos > 0 && (
              <div style={{
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Icon icon="mdi:alert" width={18} style={{ color: '#d97706' }} />
                <span style={{ fontSize: '13px', color: '#92400e' }}>
                  {creditosBaixos} aluno{creditosBaixos > 1 ? 's' : ''} com poucas aulas restantes
                </span>
              </div>
            )}

            {/* Timeline de aulas */}
            {aulasHoje.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                backgroundColor: '#f8f8f8',
                borderRadius: '12px',
                border: '1px solid #ebebeb'
              }}>
                <Icon icon="mdi:calendar-blank-outline" width="40" style={{ color: '#ccc', marginBottom: '12px' }} />
                <p style={{ color: '#666', fontSize: '14px', fontWeight: '500' }}>Nenhuma aula hoje</p>
                <p style={{ color: '#999', fontSize: '13px' }}>{getDiaLabel(hoje)}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {aulasHoje.map(h => {
                  const presenca = presencasHoje[h.id]
                  const credito = creditosAlunos[h.devedor_id]
                  const cor = getCorAula(h.descricao)

                  return (
                    <div
                      key={h.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 16px',
                        backgroundColor: presenca ? (presenca.presente ? '#f0fdf4' : '#fef2f2') : 'white',
                        borderRadius: '10px',
                        border: `1px solid ${presenca ? (presenca.presente ? '#bbf7d0' : '#fecaca') : '#e5e7eb'}`,
                        transition: 'all 0.2s'
                      }}
                    >
                      {/* Horário */}
                      <div style={{
                        fontSize: '15px',
                        fontWeight: '700',
                        color: '#333',
                        minWidth: '50px'
                      }}>
                        {h.horario?.slice(0, 5)}
                      </div>

                      {/* Avatar */}
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: cor.bg,
                        color: cor.text,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '13px',
                        fontWeight: '700',
                        flexShrink: 0,
                        overflow: 'hidden'
                      }}>
                        {h.devedores?.foto_url ? (
                          <img src={h.devedores.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = (h.devedores?.nome || 'A').charAt(0).toUpperCase() }} />
                        ) : (
                          (h.devedores?.nome || 'A').charAt(0).toUpperCase()
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#333',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {h.devedores?.nome || 'Aluno'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                          {h.descricao && (
                            <span style={{ fontSize: '12px', color: '#888' }}>{h.descricao}</span>
                          )}
                          {credito && (
                            <span style={{
                              fontSize: '10px',
                              fontWeight: '700',
                              padding: '1px 6px',
                              borderRadius: '8px',
                              backgroundColor: credito.aulas_restantes <= 0 ? '#fef2f2'
                                : credito.aulas_restantes <= 2 ? '#fffbeb' : '#f0fdf4',
                              color: credito.aulas_restantes <= 0 ? '#dc2626'
                                : credito.aulas_restantes <= 2 ? '#d97706' : '#16a34a'
                            }}>
                              {credito.aulas_restantes}/{credito.aulas_total}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botão presença rápida */}
                      <button
                        onClick={async () => {
                          if (!presenca) {
                            // Primeiro toque: marca presente direto
                            const dados = {
                              user_id: userId,
                              grade_horario_id: h.id,
                              devedor_id: h.devedor_id,
                              data: hojeStr,
                              presente: true,
                              observacao: null,
                              updated_at: new Date().toISOString()
                            }
                            const result = await supabase.from('presencas').insert(dados).select()
                            if (result.data) {
                              setPresencasHoje(prev => ({ ...prev, [h.id]: result.data[0] }))
                              // Decrementar crédito
                              const cred = creditosAlunos[h.devedor_id]
                              if (cred) {
                                const novoR = Math.max(cred.aulas_restantes - 1, 0)
                                await supabase.from('devedores').update({ aulas_restantes: novoR }).eq('id', h.devedor_id)
                                setCreditosAlunos(prev => ({
                                  ...prev,
                                  [h.devedor_id]: { ...prev[h.devedor_id], aulas_restantes: novoR }
                                }))
                                if (novoR === 0) showToast(`${h.devedores?.nome} usou todas as aulas!`, 'warning')
                                else if (novoR <= 2) showToast(`${h.devedores?.nome} tem ${novoR} aula(s) restante(s)`, 'warning')
                              }
                              showToast('Presença registrada!', 'success')
                              // Enviar notificação via WhatsApp (fire-and-forget)
                              const credAtual = creditosAlunos[h.devedor_id] ? { ...creditosAlunos[h.devedor_id], aulas_restantes: Math.max(creditosAlunos[h.devedor_id].aulas_restantes - 1, 0) } : null
                              enviarNotificacaoPresenca(h, true, null, credAtual)
                            }
                          } else {
                            // Segundo toque: abre modal completo
                            abrirPresenca(h)
                          }
                        }}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          border: presenca
                            ? `2px solid ${presenca.presente ? '#16a34a' : '#dc2626'}`
                            : '2px dashed #d1d5db',
                          backgroundColor: presenca
                            ? (presenca.presente ? '#dcfce7' : '#fef2f2')
                            : 'white',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'all 0.2s'
                        }}
                      >
                        {presenca ? (
                          presenca.presente
                            ? <Icon icon="mdi:check" width={20} style={{ color: '#16a34a' }} />
                            : <Icon icon="mdi:close" width={20} style={{ color: '#dc2626' }} />
                        ) : (
                          <Icon icon="mdi:circle-outline" width={20} style={{ color: '#d1d5db' }} />
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* Dias da semana + Busca + Adicionar */}
      {vistaAtual === 'semana' && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: isMobile ? '16px' : '24px', flexWrap: 'wrap' }}>
        {/* Pills de dia - esquerda */}
        <div style={{
          display: 'inline-flex',
          gap: '4px',
          backgroundColor: '#f3f4f6',
          borderRadius: '10px',
          padding: '4px',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={() => setFiltroDia('todos')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: filtroDia === 'todos' ? 'white' : 'transparent',
              color: filtroDia === 'todos' ? '#1a1a1a' : '#555',
              fontSize: isMobile ? '12px' : '13px',
              fontWeight: filtroDia === 'todos' ? '600' : '400',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: filtroDia === 'todos' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              opacity: filtroDia === 'todos' ? 1 : 0.75
            }}
          >
            Todos
          </button>
          {DIAS_SEMANA.map(dia => (
            <button
              key={dia.valor}
              onClick={() => setFiltroDia(dia.valor.toString())}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: filtroDia === dia.valor.toString() ? 'white' : 'transparent',
                color: filtroDia === dia.valor.toString() ? '#1a1a1a' : '#555',
                fontSize: isMobile ? '12px' : '13px',
                fontWeight: filtroDia === dia.valor.toString() ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: filtroDia === dia.valor.toString() ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                opacity: filtroDia === dia.valor.toString() ? 1 : 0.75
              }}
            >
              {dia.abrev}
            </button>
          ))}
        </div>

        {/* Busca + Adicionar - direita */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Icon icon="mdi:magnify" width="18" style={{
              position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#999'
            }} />
            <input
              type="text"
              placeholder="Buscar aluno..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{
                width: isMobile ? '120px' : '200px',
                padding: '9px 32px 9px 34px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '16px',
                backgroundColor: 'white',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: '#999' }}
              >
                <Icon icon="mdi:close-circle" width="16" />
              </button>
            )}
          </div>
          <button
            onClick={abrirModalNovo}
            style={{
              padding: isMobile ? '10px 14px' : '10px 20px',
              backgroundColor: '#333',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#222'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#333'}
          >
            <Icon icon="mdi:plus" width="18" />
            {!isMobile && 'Adicionar'}
          </button>
        </div>
      </div>
      )}

      {/* Conteúdo principal */}
      {vistaAtual === 'semana' && (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '0',
        border: 'none',
        boxShadow: 'none'
      }}>

      {/* Estado vazio */}
      {horariosFiltrados.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          backgroundColor: '#f8f8f8',
          borderRadius: '12px',
          border: '1px solid #ebebeb'
        }}>
          <Icon icon="mdi:calendar-blank-outline" width="48" style={{ color: '#ccc', marginBottom: '16px' }} />
          <h3 style={{ color: '#666', marginBottom: '8px', fontWeight: '600' }}>
            {busca || filtroDia !== 'todos' ? 'Nenhum horário encontrado' : 'Nenhum horário cadastrado'}
          </h3>
          <p style={{ color: '#999', fontSize: '14px', marginBottom: '20px' }}>
            {busca || filtroDia !== 'todos'
              ? 'Tente alterar os filtros'
              : 'Cadastre os horários de aula dos seus alunos para enviar lembretes automáticos'}
          </p>
          {!busca && filtroDia === 'todos' && (
            <button
              onClick={abrirModalNovo}
              style={{
                padding: '10px 24px',
                backgroundColor: '#344848',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Icon icon="mdi:plus" width="18" />
              Adicionar Primeiro Horário
            </button>
          )}
        </div>
      )}

      {/* Grade semanal (calendário) */}
      {horariosFiltrados.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile
            ? '1fr'
            : diasParaGrid.length <= 3
              ? `repeat(${diasParaGrid.length}, 1fr)`
              : `repeat(${Math.min(diasParaGrid.length, 7)}, minmax(130px, 1fr))`,
          gap: isMobile ? '12px' : '10px',
          alignItems: 'start',
          overflowX: !isMobile && diasParaGrid.length > 5 ? 'auto' : 'visible',
          paddingBottom: !isMobile && diasParaGrid.length > 5 ? '4px' : '0'
        }}>
          {diasParaGrid.map(dia => {
            const aulasDoDia = horariosFiltrados.filter(h => h.dia_semana === dia.valor)
            const isHoje = dia.valor === hoje

            return (
              <div
                key={dia.valor}
                style={{
                  backgroundColor: isHoje ? '#f0f7f7' : '#f8f8f8',
                  borderRadius: '12px',
                  border: isHoje ? '2px solid #344848' : '1px solid #ebebeb',
                  overflow: 'hidden',
                  minHeight: isMobile ? 'auto' : '200px'
                }}
              >
                {/* Header do dia */}
                <div style={{
                  padding: '10px 14px',
                  backgroundColor: isHoje ? '#344848' : '#f0f0f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: '700',
                      color: isHoje ? 'white' : '#444'
                    }}>
                      {isMobile ? dia.label : dia.abrev}
                    </span>
                    {isHoje && (
                      <span style={{
                        fontSize: '10px',
                        backgroundColor: 'rgba(255,255,255,0.25)',
                        padding: '1px 8px',
                        borderRadius: '10px',
                        color: 'white',
                        fontWeight: '600'
                      }}>
                        HOJE
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    color: isHoje ? 'rgba(255,255,255,0.7)' : '#999'
                  }}>
                    {aulasDoDia.length} {aulasDoDia.length === 1 ? 'aula' : 'aulas'}
                  </span>
                </div>

                {/* Aulas do dia */}
                <div style={{ padding: '8px' }}>
                  {aulasDoDia.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: '20px 8px',
                      color: '#ccc',
                      fontSize: '12px'
                    }}>
                      Sem aulas
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {aulasDoDia.map(h => {
                        const cor = getCorAula(h.descricao)
                        return (
                          <div
                            key={h.id}
                            onClick={() => abrirModalEditar(h)}
                            style={{
                              backgroundColor: h.ativo ? cor.bg : '#f5f5f5',
                              borderLeft: `3px solid ${h.ativo ? cor.border : '#ccc'}`,
                              borderRadius: '6px',
                              padding: '8px 10px',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                              opacity: h.ativo ? 1 : 0.5,
                              position: 'relative'
                            }}
                            onMouseEnter={e => { if (!isMobile) { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; e.currentTarget.querySelector('.aula-acoes').style.opacity = '1' }}}
                            onMouseLeave={e => { if (!isMobile) { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.querySelector('.aula-acoes').style.opacity = '0' }}}
                          >
                            {/* Badge pausado */}
                            {!h.ativo && (
                              <div style={{
                                position: 'absolute',
                                top: '4px',
                                left: '14px',
                                fontSize: '9px',
                                fontWeight: '700',
                                color: '#ef4444',
                                backgroundColor: '#fef2f2',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                border: '1px solid #fecaca',
                                letterSpacing: '0.5px',
                                textTransform: 'uppercase'
                              }}>
                                Pausado
                              </div>
                            )}
                            {/* Horário */}
                            <div style={{
                              fontSize: '14px',
                              fontWeight: '700',
                              color: h.ativo ? cor.text : '#999',
                              marginBottom: '2px',
                              marginTop: !h.ativo ? '14px' : '0'
                            }}>
                              {h.horario?.substring(0, 5)}
                            </div>
                            {/* Nome */}
                            <div style={{
                              fontSize: '12px',
                              fontWeight: '600',
                              color: h.ativo ? '#333' : '#999',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {h.devedores?.nome || 'Aluno'}
                            </div>
                            {/* Tipo de aula */}
                            {h.descricao && (
                              <div style={{
                                fontSize: '11px',
                                color: h.ativo ? cor.text : '#bbb',
                                marginTop: '1px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {h.descricao}
                              </div>
                            )}

                            {/* Badge de créditos (pacote de aulas) */}
                            {creditosAlunos[h.devedor_id] && (
                              <div style={{
                                fontSize: '10px',
                                fontWeight: '700',
                                padding: '1px 6px',
                                borderRadius: '8px',
                                backgroundColor: creditosAlunos[h.devedor_id].aulas_restantes <= 0 ? '#fef2f2'
                                  : creditosAlunos[h.devedor_id].aulas_restantes <= 2 ? '#fffbeb' : '#f0fdf4',
                                color: creditosAlunos[h.devedor_id].aulas_restantes <= 0 ? '#dc2626'
                                  : creditosAlunos[h.devedor_id].aulas_restantes <= 2 ? '#d97706' : '#16a34a',
                                display: 'inline-block',
                                marginTop: '3px'
                              }}>
                                {creditosAlunos[h.devedor_id].aulas_restantes}/{creditosAlunos[h.devedor_id].aulas_total} aulas
                              </div>
                            )}

                            {/* Botão de presença (só no dia atual) */}
                            {isHoje && h.ativo && (() => {
                              const presenca = presencasHoje[h.id]
                              return (
                                <button
                                  onClick={(e) => { e.stopPropagation(); abrirPresenca(h) }}
                                  style={{
                                    marginTop: '6px',
                                    padding: '4px 8px',
                                    borderRadius: '5px',
                                    border: presenca ? 'none' : '1px dashed #aaa',
                                    backgroundColor: presenca
                                      ? presenca.presente ? '#dcfce7' : '#fee2e2'
                                      : 'white',
                                    color: presenca
                                      ? presenca.presente ? '#16a34a' : '#dc2626'
                                      : '#888',
                                    fontSize: '10px',
                                    fontWeight: '600',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    width: '100%',
                                    justifyContent: 'center'
                                  }}
                                >
                                  <Icon
                                    icon={presenca
                                      ? presenca.presente ? 'mdi:check-circle' : 'mdi:close-circle'
                                      : 'mdi:checkbox-blank-circle-outline'}
                                    width="13"
                                  />
                                  {presenca
                                    ? presenca.presente ? 'Presente' : 'Falta'
                                    : 'Marcar presença'}
                                </button>
                              )
                            })()}

                            {/* Ações hover (sempre visíveis no mobile) */}
                            <div
                              className="aula-acoes"
                              onClick={e => e.stopPropagation()}
                              style={{
                                position: 'absolute',
                                top: '3px',
                                right: '3px',
                                display: 'flex',
                                gap: '3px',
                                opacity: isMobile ? 1 : 0,
                                transition: 'opacity 0.15s'
                              }}
                            >
                              <button
                                onClick={() => toggleAtivo(h)}
                                title={h.ativo ? 'Desativar' : 'Ativar'}
                                style={{
                                  padding: '5px',
                                  backgroundColor: 'white',
                                  border: '1px solid #e0e0e0',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  lineHeight: 1,
                                  minWidth: '28px',
                                  minHeight: '28px'
                                }}
                              >
                                <Icon icon={h.ativo ? 'mdi:pause' : 'mdi:play'} width="14" color="#666" />
                              </button>
                              <button
                                onClick={() => setConfirmDelete({ show: true, horario: h })}
                                title="Excluir"
                                style={{
                                  padding: '5px',
                                  backgroundColor: 'white',
                                  border: '1px solid #e0e0e0',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  lineHeight: 1,
                                  minWidth: '28px',
                                  minHeight: '28px'
                                }}
                              >
                                <Icon icon="mdi:close" width="14" color="#ef4444" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      </div>)}{/* Fim card conteúdo + vistaAtual semana */}

      {/* Modal de confirmação de exclusão */}
      <ConfirmModal
        isOpen={confirmDelete.show}
        onClose={() => setConfirmDelete({ show: false, horario: null })}
        onConfirm={() => excluirHorario(confirmDelete.horario?.id)}
        title="Excluir Horário"
        message={`Tem certeza que deseja excluir o horário de ${confirmDelete.horario?.devedores?.nome || 'este aluno'}?`}
        confirmText="Excluir"
        confirmColor="#ef4444"
      />

      {/* Modal de criar/editar */}
      {mostrarModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setMostrarModal(false) }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px'
          }}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '14px',
            padding: '28px',
            maxWidth: '480px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '24px'
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>
                {editando ? 'Editar Horário' : 'Novo Horário'}
              </h2>
              <button
                onClick={() => setMostrarModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
              >
                <Icon icon="mdi:close" width="22" color="#666" />
              </button>
            </div>

            {/* Cliente */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>
                Aluno
              </label>
              <select
                value={formClienteId}
                onChange={e => setFormClienteId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  backgroundColor: 'white'
                }}
              >
                <option value="">Selecione um aluno</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>

            {/* Dia da semana */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>
                {editando ? 'Dia da Semana' : 'Dias da Semana'}
                {!editando && (
                  <span style={{ fontWeight: '400', color: '#888', fontSize: '12px', marginLeft: '6px' }}>
                    (selecione um ou mais)
                  </span>
                )}
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {DIAS_SEMANA.map(dia => {
                  const selecionado = formDiasSemana.includes(dia.valor)
                  return (
                    <button
                      key={dia.valor}
                      type="button"
                      onClick={() => toggleDiaSemana(dia.valor)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: selecionado ? 'none' : '1px solid #ddd',
                        backgroundColor: selecionado ? '#344848' : 'white',
                        color: selecionado ? 'white' : '#333',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {isMobile ? dia.abrev : dia.label}
                    </button>
                  )
                })}
              </div>
              {!editando && formDiasSemana.length > 1 && (
                <div style={{
                  marginTop: '8px',
                  fontSize: '12px',
                  color: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <Icon icon="mdi:information-outline" width="14" />
                  {formDiasSemana.length} dias selecionados — será criado um horário para cada dia
                </div>
              )}
            </div>

            {/* Horário e Descrição */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '18px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>
                  Horário
                </label>
                <input
                  type="time"
                  value={formHorario}
                  onChange={e => setFormHorario(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ flex: 2 }}>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>
                  Tipo de Aula
                </label>
                <input
                  type="text"
                  value={formDescricao}
                  onChange={e => setFormDescricao(e.target.value)}
                  placeholder="Ex: Pilates, Yoga, Funcional"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Dica */}
            <div style={{
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <Icon icon="mdi:information-outline" width="18" color="#16a34a" />
              <span style={{ fontSize: '13px', color: '#166534' }}>
                O lembrete será enviado automaticamente 1 hora antes da aula via WhatsApp.
              </span>
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setMostrarModal(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#f5f5f5',
                  color: '#333',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={salvarHorario}
                disabled={salvando}
                style={{
                  flex: 2,
                  padding: '12px',
                  backgroundColor: salvando ? '#ccc' : '#344848',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: salvando ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {salvando ? 'Salvando...' : (
                  <>
                    <Icon icon="mdi:check" width="18" />
                    {editando ? 'Salvar Alterações' : (
                      formDiasSemana.length > 1 ? `Adicionar ${formDiasSemana.length} Horários` : 'Adicionar Horário'
                    )}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Presença */}
      {/* ===== VISTA AGENDAMENTO ONLINE ===== */}
      {vistaAtual === 'agendamento' && (
        <div>
          {/* PREMIUM LOCK */}
          {isLocked('premium') ? (
            <div style={{
              backgroundColor: 'white', borderRadius: '12px', padding: '60px 40px',
              textAlign: 'center', border: '1px solid #e5e7eb', maxWidth: '500px', margin: '40px auto'
            }}>
              <div style={{
                width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#fff3e0',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto'
              }}>
                <Icon icon="mdi:lock" width="32" style={{ color: '#ff9800' }} />
              </div>
              <h2 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: '600', color: '#1a1a1a' }}>
                Agendamento Online
              </h2>
              <p style={{ margin: '0 0 24px', fontSize: '15px', color: '#666', lineHeight: '1.6' }}>
                Permita que seus alunos agendem e cancelem aulas por um link público.
                Gerencie turmas com capacidade, alunos fixos e agendados online.
                Disponível no plano <strong>Premium</strong>.
              </p>
              <button onClick={() => window.location.href = '/app/configuracao?aba=upgrade'}
                style={{
                  padding: '12px 32px', backgroundColor: '#ff9800', color: 'white',
                  border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer'
                }}>
                Fazer Upgrade
              </button>
            </div>
          ) : (
          <>
          {/* Header + Adicionar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{
              display: 'inline-flex', gap: '4px', backgroundColor: '#f3f4f6',
              borderRadius: '10px', padding: '4px', flexWrap: 'wrap'
            }}>
              <button
                onClick={() => setFiltroAgendamentoDia('todos')}
                style={{
                  padding: '8px 14px', borderRadius: '8px', border: 'none',
                  backgroundColor: filtroAgendamentoDia === 'todos' ? 'white' : 'transparent',
                  color: filtroAgendamentoDia === 'todos' ? '#1a1a1a' : '#555',
                  fontSize: isMobile ? '12px' : '13px', fontWeight: filtroAgendamentoDia === 'todos' ? '600' : '400',
                  cursor: 'pointer', transition: 'all 0.2s',
                  boxShadow: filtroAgendamentoDia === 'todos' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                Todos
              </button>
              {DIAS_SEMANA.map(dia => (
                <button
                  key={dia.valor}
                  onClick={() => setFiltroAgendamentoDia(dia.valor.toString())}
                  style={{
                    padding: '8px 14px', borderRadius: '8px', border: 'none',
                    backgroundColor: filtroAgendamentoDia === dia.valor.toString() ? 'white' : 'transparent',
                    color: filtroAgendamentoDia === dia.valor.toString() ? '#1a1a1a' : '#555',
                    fontSize: isMobile ? '12px' : '13px',
                    fontWeight: filtroAgendamentoDia === dia.valor.toString() ? '600' : '400',
                    cursor: 'pointer', transition: 'all 0.2s',
                    boxShadow: filtroAgendamentoDia === dia.valor.toString() ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                  }}
                >
                  {dia.abrev}
                </button>
              ))}
            </div>

            <button
              onClick={abrirModalNovaAula}
              style={{
                padding: isMobile ? '10px 14px' : '10px 20px',
                backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '6px',
                fontSize: '14px', fontWeight: '500', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px', transition: 'background-color 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#222'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = '#333'}
            >
              <Icon icon="mdi:plus" width="18" />
              {!isMobile && 'Nova Aula'}
            </button>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {[
              { label: 'Aulas', value: aulasAgendamento.filter(a => a.ativo).length, icon: 'mdi:calendar-clock', color: '#4338ca', bg: '#eef2ff' },
              { label: 'Fixos', value: fixosAulas.length, icon: 'mdi:account-lock', color: '#b45309', bg: '#fef3c7' },
              { label: 'Agendados', value: agendamentosOnline.length, icon: 'mdi:account-check', color: '#16a34a', bg: '#f0fdf4' },
            ].map((s, i) => (
              <div key={i} style={{
                flex: 1, minWidth: '120px', padding: '14px 16px', backgroundColor: s.bg,
                borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px'
              }}>
                <Icon icon={s.icon} width="22" style={{ color: s.color }} />
                <div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: '#666' }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {loadingAgendamento ? (
            <SkeletonList count={4} />
          ) : aulasAgendamento.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#999' }}>
              <Icon icon="mdi:calendar-plus" width="56" style={{ color: '#ccc', marginBottom: '12px' }} />
              <p style={{ fontSize: '15px', fontWeight: '600', margin: '0 0 6px' }}>Nenhuma aula cadastrada</p>
              <p style={{ fontSize: '13px', margin: 0 }}>Crie aulas com horários e capacidade para seus alunos agendarem online</p>
            </div>
          ) : (
            <div>
              {aulasAgendamentoAgrupadas.map(grupo => (
                <div key={grupo.dia.valor} style={{ marginBottom: '20px' }}>
                  <div style={{
                    fontSize: '13px', fontWeight: '700', color: '#344848', marginBottom: '8px',
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}>
                    <div style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      backgroundColor: grupo.dia.valor === new Date().getDay() ? '#16a34a' : '#ccc'
                    }} />
                    {grupo.dia.label}
                  </div>

                  {grupo.aulas.map(aula => {
                    const nFixos = contagemFixos(aula.id)
                    const nAgendados = contagemAgendamentos(aula.id)
                    const nTotal = nFixos + nAgendados
                    const nFila = contagemFilaEspera(aula.id)
                    const fixosDaAula = fixosAulas.filter(f => f.aula_id === aula.id)
                    // Calcular próxima data desta aula (próximo dia_semana a partir de hoje)
                    const proximaData = (() => {
                      const hoje = new Date()
                      for (let i = 0; i < 7; i++) {
                        const d = new Date(hoje)
                        d.setDate(d.getDate() + i)
                        if (d.getDay() === aula.dia_semana) {
                          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                        }
                      }
                      return null
                    })()
                    const agendadosLista = agendamentosOnline.filter(a => a.aula_id === aula.id && a.data === proximaData)
                    const filaDaAula = listaEspera.filter(f => f.aula_id === aula.id)

                    return (
                      <div key={aula.id} style={{
                        marginBottom: '8px', padding: '14px 16px',
                        border: '1px solid #eee', borderRadius: '10px',
                        backgroundColor: aula.ativo ? '#fff' : '#fafafa',
                        opacity: aula.ativo ? 1 : 0.6
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                              width: '40px', height: '40px', borderRadius: '10px',
                              backgroundColor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                              <Icon icon="mdi:clock-outline" width="20" style={{ color: '#4338ca' }} />
                            </div>
                            <div>
                              <div style={{ fontSize: '15px', fontWeight: '600', color: '#1a1a1a' }}>
                                {aula.horario?.substring(0, 5)} {aula.descricao && `- ${aula.descricao}`}
                              </div>
                              <div style={{ fontSize: '12px', color: '#888', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>{nTotal}/{aula.capacidade} vagas</span>
                                {nFixos > 0 && <span style={{ color: '#b45309' }}>({nFixos} fixo{nFixos > 1 ? 's' : ''})</span>}
                                {nFila > 0 && <span style={{ color: '#f59e0b' }}>({nFila} na fila)</span>}
                                {!aula.ativo && <span style={{ color: '#ef4444', fontWeight: '600' }}>Inativa</span>}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button onClick={() => { setAulaParaFixo(aula); setFixoClienteId(''); setMostrarModalFixo(true) }} title="Adicionar aluno fixo"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex' }}>
                              <Icon icon="mdi:account-plus" width="18" style={{ color: '#b45309' }} />
                            </button>
                            <button onClick={() => toggleAtivoAula(aula)} title={aula.ativo ? 'Desativar' : 'Ativar'}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex' }}>
                              <Icon icon={aula.ativo ? 'mdi:eye' : 'mdi:eye-off'} width="18" style={{ color: aula.ativo ? '#16a34a' : '#ccc' }} />
                            </button>
                            <button onClick={() => abrirModalEditarAula(aula)} title="Editar"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex' }}>
                              <Icon icon="mdi:pencil" width="18" style={{ color: '#666' }} />
                            </button>
                            <button onClick={() => setConfirmDeleteAula({ show: true, aula })} title="Excluir"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex' }}>
                              <Icon icon="mdi:delete-outline" width="18" style={{ color: '#ef4444' }} />
                            </button>
                          </div>
                        </div>

                        {/* Lista de alunos fixos */}
                        {fixosDaAula.length > 0 && (
                          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f3f4f6' }}>
                            <div style={{ fontSize: '11px', fontWeight: '600', color: '#b45309', marginBottom: '6px', textTransform: 'uppercase' }}>
                              Alunos fixos
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {fixosDaAula.map(fixo => {
                                const isHoje = aula.dia_semana === new Date().getDay()
                                const pKey = presAgKey(aula.id, fixo.devedor_id)
                                const presenca = presencasAgendamento[pKey]
                                return (
                                <div key={fixo.id}
                                  onClick={() => isHoje && abrirPresencaAgendamento(aula, fixo.devedor_id, fixo.devedores)}
                                  style={{
                                  fontSize: '12px', padding: '4px 10px',
                                  backgroundColor: presenca ? (presenca.presente ? '#d1fae5' : '#fee2e2') : '#fef3c7',
                                  borderRadius: '6px', color: presenca ? (presenca.presente ? '#065f46' : '#991b1b') : '#92400e', fontWeight: '500',
                                  display: 'flex', alignItems: 'center', gap: '4px',
                                  cursor: isHoje ? 'pointer' : 'default',
                                  transition: 'all 0.15s'
                                }}>
                                  {presenca ? (
                                    <Icon icon={presenca.presente ? 'mdi:check-circle' : 'mdi:close-circle'} width="12" style={{ color: presenca.presente ? '#16a34a' : '#ef4444' }} />
                                  ) : (
                                    <Icon icon="mdi:pin" width="12" style={{ color: '#b45309' }} />
                                  )}
                                  <span>{fixo.devedores?.nome?.split(' ')[0] || 'Aluno'}</span>
                                  <span
                                    onClick={(e) => { e.stopPropagation(); setConfirmRemoverFixo({ show: true, fixo }) }}
                                    style={{
                                      cursor: 'pointer', marginLeft: '2px', color: '#ef4444',
                                      fontSize: '14px', fontWeight: '700', lineHeight: '1',
                                      display: 'flex', alignItems: 'center'
                                    }}
                                    title="Remover aluno fixo"
                                  >×</span>
                                </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Lista de agendados — só da próxima ocorrência */}
                        {agendadosLista.length > 0 && (
                          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f3f4f6' }}>
                            <div style={{ fontSize: '11px', fontWeight: '600', color: '#888', marginBottom: '6px', textTransform: 'uppercase' }}>
                              Agendados {proximaData && new Date(proximaData + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ({agendadosLista.length})
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {agendadosLista.map(ag => {
                                const isExperimental = ag.devedores?.origem === 'agendamento' && !ag.devedores?.assinatura_ativa && !ag.devedores?.plano_id
                                const isAgHoje = ag.data === hojeStr
                                const pKey = presAgKey(aula.id, ag.devedor_id)
                                const presenca = presencasAgendamento[pKey]
                                return (
                                  <div key={ag.id}
                                    onClick={() => isAgHoje && abrirPresencaAgendamento(aula, ag.devedor_id, ag.devedores)}
                                    style={{
                                      fontSize: '12px', padding: '4px 10px',
                                      backgroundColor: presenca ? (presenca.presente ? '#d1fae5' : '#fee2e2') : (isExperimental ? '#fef3c7' : '#f0fdf4'),
                                      borderRadius: '6px', color: presenca ? (presenca.presente ? '#065f46' : '#991b1b') : (isExperimental ? '#92400e' : '#16a34a'), fontWeight: '500',
                                      display: 'flex', alignItems: 'center', gap: '4px',
                                      cursor: isAgHoje ? 'pointer' : 'default'
                                    }}>
                                    {presenca && (
                                      <Icon icon={presenca.presente ? 'mdi:check-circle' : 'mdi:close-circle'} width="12" style={{ color: presenca.presente ? '#16a34a' : '#ef4444' }} />
                                    )}
                                    <span>{ag.devedores?.nome?.split(' ')[0] || 'Aluno'}</span>
                                    {isExperimental && (
                                      <span style={{ fontSize: '9px', padding: '1px 5px', backgroundColor: '#f59e0b', borderRadius: '4px', color: '#fff', fontWeight: '700' }}>Exp</span>
                                    )}
                                    <span onClick={(e) => { e.stopPropagation(); setConfirmRemoverAgendamento({ show: true, agendamento: ag }) }}
                                      style={{ cursor: 'pointer', marginLeft: '2px', color: '#ef4444', fontSize: '14px', fontWeight: '700', lineHeight: '1', display: 'flex', alignItems: 'center' }}
                                      title="Remover">×</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Lista de espera */}
                        {filaDaAula.length > 0 && (
                          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f3f4f6' }}>
                            <div style={{ fontSize: '11px', fontWeight: '600', color: '#f59e0b', marginBottom: '6px', textTransform: 'uppercase' }}>
                              Lista de espera ({filaDaAula.length})
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {filaDaAula.map(fila => (
                                <div key={fila.id} style={{
                                  fontSize: '12px', padding: '4px 10px',
                                  backgroundColor: '#fef3c7', borderRadius: '6px', color: '#92400e', fontWeight: '500',
                                  display: 'flex', alignItems: 'center', gap: '4px'
                                }}>
                                  <Icon icon="mdi:clock-outline" width="12" style={{ color: '#f59e0b' }} />
                                  <span>{fila.posicao}º</span>
                                  <span>{fila.devedores?.nome?.split(' ')[0] || 'Aluno'}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
          </>
          )}
        </div>
      )}

      {/* Modal Criar/Editar Aula Agendamento */}
      {mostrarModalAula && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '12px', padding: '24px',
            width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                {editandoAula ? 'Editar Aula' : 'Liberar Horários'}
              </h3>
              <button onClick={() => setMostrarModalAula(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <Icon icon="mdi:close" width="20" style={{ color: '#999' }} />
              </button>
            </div>

            {/* Dias da semana */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
                Dia(s) da semana
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {DIAS_SEMANA.map(dia => {
                  const sel = formAulaDias.includes(dia.valor)
                  return (
                    <button
                      key={dia.valor}
                      onClick={() => {
                        if (editandoAula) { setFormAulaDias([dia.valor]); return }
                        setFormAulaDias(prev => {
                          if (prev.includes(dia.valor)) {
                            if (prev.length === 1) return prev
                            return prev.filter(d => d !== dia.valor)
                          }
                          return [...prev, dia.valor]
                        })
                      }}
                      style={{
                        padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                        border: sel ? '2px solid #344848' : '1px solid #ddd',
                        backgroundColor: sel ? '#f0f4f4' : 'white',
                        color: sel ? '#344848' : '#666', cursor: 'pointer'
                      }}
                    >
                      {dia.abrev}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Horário */}
            {editandoAula ? (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
                  Horário
                </label>
                <input
                  type="time"
                  value={formAulaHorario}
                  onChange={e => setFormAulaHorario(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
                    fontSize: '16px', boxSizing: 'border-box'
                  }}
                />
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
                      Início
                    </label>
                    <input
                      type="time"
                      value={formAulaHorario}
                      onChange={e => setFormAulaHorario(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
                        fontSize: '16px', boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
                      Fim
                    </label>
                    <input
                      type="time"
                      value={formAulaHorarioFim}
                      onChange={e => setFormAulaHorarioFim(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
                        fontSize: '16px', boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
                    Intervalo entre aulas
                  </label>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[30, 60, 90, 120].map(min => (
                      <button
                        key={min}
                        onClick={() => setFormAulaIntervalo(min)}
                        style={{
                          padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                          border: formAulaIntervalo === min ? '2px solid #344848' : '1px solid #ddd',
                          backgroundColor: formAulaIntervalo === min ? '#f0f4f4' : 'white',
                          color: formAulaIntervalo === min ? '#344848' : '#666', cursor: 'pointer'
                        }}
                      >
                        {min >= 60 ? `${min / 60}h` : `${min}min`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                {(() => {
                  const preview = []
                  const [hI, mI] = formAulaHorario.split(':').map(Number)
                  const [hF, mF] = formAulaHorarioFim.split(':').map(Number)
                  let min = hI * 60 + mI
                  const fim = hF * 60 + mF
                  while (min < fim) {
                    const h = String(Math.floor(min / 60)).padStart(2, '0')
                    const m = String(min % 60).padStart(2, '0')
                    preview.push(`${h}:${m}`)
                    min += formAulaIntervalo
                  }
                  if (preview.length === 0) return null
                  return (
                    <div style={{
                      marginBottom: '16px', padding: '12px', backgroundColor: '#f8fafc',
                      borderRadius: '8px', border: '1px solid #e2e8f0'
                    }}>
                      <div style={{ fontSize: '12px', fontWeight: '600', color: '#888', marginBottom: '6px' }}>
                        {preview.length} horário(s) × {formAulaDias.length} dia(s) = {preview.length * formAulaDias.length} aula(s)
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {preview.map(h => (
                          <span key={h} style={{
                            fontSize: '12px', padding: '3px 8px', backgroundColor: '#eef2ff',
                            borderRadius: '4px', color: '#4338ca', fontWeight: '600'
                          }}>
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </>
            )}

            {/* Descrição */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
                Descrição (ex: Pilates, Yoga, Musculação)
              </label>
              <input
                type="text"
                value={formAulaDescricao}
                onChange={e => setFormAulaDescricao(e.target.value)}
                placeholder="Ex: Pilates avançado"
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
                  fontSize: '14px', boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Capacidade */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
                Capacidade (vagas)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={formAulaCapacidade}
                onChange={e => setFormAulaCapacidade(parseInt(e.target.value) || 1)}
                style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
                  fontSize: '16px', boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setMostrarModalAula(false)}
                style={{
                  flex: 1, padding: '12px', backgroundColor: '#f5f5f5', color: '#333',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={salvarAula}
                disabled={salvandoAula}
                style={{
                  flex: 2, padding: '12px',
                  backgroundColor: salvandoAula ? '#ccc' : '#344848',
                  color: 'white', border: 'none', borderRadius: '8px',
                  fontSize: '14px', fontWeight: '600',
                  cursor: salvandoAula ? 'not-allowed' : 'pointer'
                }}
              >
                {salvandoAula ? 'Salvando...' : (editandoAula ? 'Salvar' : 'Criar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Aula */}
      <ConfirmModal
        isOpen={confirmDeleteAula.show}
        onClose={() => setConfirmDeleteAula({ show: false, aula: null })}
        onConfirm={() => excluirAula(confirmDeleteAula.aula?.id)}
        title="Excluir aula"
        message={`Tem certeza que deseja excluir esta aula? Agendamentos futuros serão removidos.`}
      />

      <ConfirmModal
        isOpen={confirmRemoverAgendamento.show}
        onClose={() => setConfirmRemoverAgendamento({ show: false, agendamento: null })}
        onConfirm={() => {
          cancelarAgendamentoAdmin(confirmRemoverAgendamento.agendamento)
          setConfirmRemoverAgendamento({ show: false, agendamento: null })
        }}
        title="Remover aluno do horário"
        message={`Tem certeza que deseja remover ${confirmRemoverAgendamento.agendamento?.devedores?.nome?.split(' ')[0] || 'este aluno'} deste horário?`}
        confirmText="Remover"
        confirmColor="#ef4444"
      />

      {/* Confirmar remover fixo */}
      <ConfirmModal
        isOpen={confirmRemoverFixo.show}
        onClose={() => setConfirmRemoverFixo({ show: false, fixo: null })}
        onConfirm={() => {
          removerFixo(confirmRemoverFixo.fixo)
          setConfirmRemoverFixo({ show: false, fixo: null })
        }}
        title="Remover aluno fixo"
        message={`Tem certeza que deseja remover ${confirmRemoverFixo.fixo?.devedores?.nome?.split(' ')[0] || 'este aluno'} dos fixos desta aula?`}
        confirmText="Remover"
        confirmColor="#ef4444"
      />

      {/* Modal Adicionar Aluno Fixo */}
      {mostrarModalFixo && aulaParaFixo && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '12px', padding: '24px',
            width: '100%', maxWidth: '400px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                Adicionar aluno fixo
              </h3>
              <button onClick={() => setMostrarModalFixo(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <Icon icon="mdi:close" width="20" style={{ color: '#999' }} />
              </button>
            </div>

            <div style={{
              padding: '10px 14px', backgroundColor: '#f8f9fa', borderRadius: '8px', marginBottom: '16px',
              fontSize: '13px', color: '#555'
            }}>
              <strong>{aulaParaFixo.horario?.substring(0, 5)}</strong> {aulaParaFixo.descricao && `- ${aulaParaFixo.descricao}`}
              <span style={{ marginLeft: '8px', color: '#888' }}>
                ({totalOcupado(aulaParaFixo.id)}/{aulaParaFixo.capacidade} vagas)
              </span>
            </div>

            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>
              Selecione o aluno
            </label>
            <select
              value={fixoClienteId}
              onChange={e => setFixoClienteId(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
                fontSize: '14px', marginBottom: '20px', boxSizing: 'border-box'
              }}
            >
              <option value="">Selecionar aluno...</option>
              {clientes
                .filter(c => !fixosAulas.find(f => f.aula_id === aulaParaFixo.id && f.devedor_id === c.id))
                .map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))
              }
            </select>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setMostrarModalFixo(false)}
                style={{
                  flex: 1, padding: '10px', backgroundColor: '#f3f4f6', color: '#555',
                  border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
                }}>
                Cancelar
              </button>
              <button onClick={adicionarFixo} disabled={!fixoClienteId}
                style={{
                  flex: 1, padding: '10px', backgroundColor: fixoClienteId ? '#344848' : '#ccc', color: 'white',
                  border: 'none', borderRadius: '8px', cursor: fixoClienteId ? 'pointer' : 'not-allowed',
                  fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}>
                <Icon icon="mdi:account-plus" width="18" />
                Adicionar fixo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Presença Agendamento */}
      {mostrarModalPresencaAg && presencaAgAtual && (
        <div onClick={e => { if (e.target === e.currentTarget) setMostrarModalPresencaAg(false) }}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '380px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>Registrar Presença</h3>
              <button onClick={() => setMostrarModalPresencaAg(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <Icon icon="mdi:close" width="20" style={{ color: '#999' }} />
              </button>
            </div>

            {/* Info */}
            <div style={{ padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '10px', marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a' }}>{presencaAgAtual.devedores?.nome || 'Aluno'}</div>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                {presencaAgAtual.aula.horario?.substring(0, 5)} {presencaAgAtual.aula.descricao && `- ${presencaAgAtual.aula.descricao}`}
              </div>
              {creditosAlunos[presencaAgAtual.devedor_id] && (
                <div style={{ fontSize: '11px', color: '#b45309', marginTop: '4px', fontWeight: '600' }}>
                  {creditosAlunos[presencaAgAtual.devedor_id].aulas_restantes}/{creditosAlunos[presencaAgAtual.devedor_id].aulas_total} aulas restantes
                </div>
              )}
            </div>

            {/* Presente / Falta */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button onClick={() => setPresencaAgPresente(true)} style={{
                flex: 1, padding: '12px', borderRadius: '10px', cursor: 'pointer',
                backgroundColor: presencaAgPresente ? '#f0fdf4' : 'white',
                border: presencaAgPresente ? '2px solid #16a34a' : '1px solid #e5e7eb',
                fontSize: '14px', fontWeight: '600', color: presencaAgPresente ? '#16a34a' : '#666',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}>
                <Icon icon="mdi:check-circle" width="20" /> Presente
              </button>
              <button onClick={() => setPresencaAgPresente(false)} style={{
                flex: 1, padding: '12px', borderRadius: '10px', cursor: 'pointer',
                backgroundColor: !presencaAgPresente ? '#fef2f2' : 'white',
                border: !presencaAgPresente ? '2px solid #dc2626' : '1px solid #e5e7eb',
                fontSize: '14px', fontWeight: '600', color: !presencaAgPresente ? '#dc2626' : '#666',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}>
                <Icon icon="mdi:close-circle" width="20" /> Falta
              </button>
            </div>

            {/* Observação */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>
                {presencaAgPresente ? 'O que foi feito na aula?' : 'Motivo da falta'} <span style={{ color: '#999', fontWeight: '400' }}>(opcional)</span>
              </label>
              <textarea value={presencaAgObs} onChange={e => setPresencaAgObs(e.target.value)}
                rows={3} placeholder={presencaAgPresente ? 'Ex: Treino de peito e costas' : 'Ex: Aluno avisou que não poderia vir'}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setMostrarModalPresencaAg(false)} style={{
                flex: 1, padding: '10px', backgroundColor: '#f3f4f6', color: '#555',
                border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
              }}>Cancelar</button>
              <button onClick={salvarPresencaAgendamento} disabled={salvandoPresencaAg} style={{
                flex: 1, padding: '10px',
                backgroundColor: salvandoPresencaAg ? '#ccc' : (presencaAgPresente ? '#16a34a' : '#ef4444'),
                color: 'white', border: 'none', borderRadius: '8px',
                cursor: salvandoPresencaAg ? 'not-allowed' : 'pointer',
                fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
              }}>
                <Icon icon={presencaAgPresente ? 'mdi:check' : 'mdi:close'} width="18" />
                {salvandoPresencaAg ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalPresenca && presencaAtual && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setMostrarModalPresenca(false) }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
            padding: '16px'
          }}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '14px',
            padding: '28px',
            maxWidth: '420px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>
                {presencaModoEdicao ? 'Registrar Presença' : 'Presença Registrada'}
              </h2>
              <button
                onClick={() => setMostrarModalPresenca(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
              >
                <Icon icon="mdi:close" width="22" color="#666" />
              </button>
            </div>

            {/* Info do aluno */}
            <div style={{
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#344848',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: '600',
                flexShrink: 0,
                overflow: 'hidden'
              }}>
                {presencaAtual.devedores?.foto_url ? (
                  <img src={presencaAtual.devedores.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentElement.textContent = (presencaAtual.devedores?.nome || 'A').charAt(0).toUpperCase() }} />
                ) : (
                  (presencaAtual.devedores?.nome || 'A').charAt(0).toUpperCase()
                )}
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#333' }}>
                  {presencaAtual.devedores?.nome || 'Aluno'}
                </div>
                <div style={{ fontSize: '12px', color: '#888' }}>
                  {presencaAtual.horario?.substring(0, 5)} — {presencaAtual.descricao || 'Aula'} — {new Date().toLocaleDateString('pt-BR')}
                </div>
              </div>
            </div>

            {presencaModoEdicao ? (
              <>
                {/* Toggle Presente/Falta */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px' }}>
                    Status
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setPresencaPresente(true)}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '8px',
                        border: presencaPresente ? '2px solid #16a34a' : '1px solid #ddd',
                        backgroundColor: presencaPresente ? '#f0fdf4' : 'white',
                        color: presencaPresente ? '#16a34a' : '#666',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <Icon icon="mdi:check-circle" width="20" />
                      Presente
                    </button>
                    <button
                      onClick={() => setPresencaPresente(false)}
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '8px',
                        border: !presencaPresente ? '2px solid #dc2626' : '1px solid #ddd',
                        backgroundColor: !presencaPresente ? '#fef2f2' : 'white',
                        color: !presencaPresente ? '#dc2626' : '#666',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <Icon icon="mdi:close-circle" width="20" />
                      Falta
                    </button>
                  </div>
                </div>

                {/* Observação */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '6px' }}>
                    {presencaPresente ? 'O que foi feito na aula?' : 'Motivo da falta'} <span style={{ fontWeight: '400', color: '#999', fontSize: '12px' }}>(opcional)</span>
                  </label>
                  <textarea
                    value={presencaObservacao}
                    onChange={e => setPresencaObservacao(e.target.value)}
                    placeholder={presencaPresente
                      ? "Ex: Treino de força, exercícios de respiração, revisão de escala musical..."
                      : "Ex: Atestado médico, viagem, sem justificativa..."}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      resize: 'vertical',
                      fontFamily: 'inherit'
                    }}
                  />
                </div>

                {/* Botões edição */}
                <div style={{ display: 'flex', gap: '10px' }}>
                  {presencasHoje[presencaAtual.id] && (
                    <button
                      onClick={removerPresenca}
                      disabled={salvandoPresenca}
                      style={{
                        padding: '12px',
                        backgroundColor: 'white',
                        color: '#ef4444',
                        border: '1px solid #fecaca',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Icon icon="mdi:delete-outline" width="16" />
                      Remover
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (presencasHoje[presencaAtual.id]) {
                        // Cancelar edição, voltar pra visualização
                        const existente = presencasHoje[presencaAtual.id]
                        setPresencaPresente(existente.presente)
                        setPresencaObservacao(existente.observacao || '')
                        setPresencaModoEdicao(false)
                      } else {
                        setMostrarModalPresenca(false)
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: '#f5f5f5',
                      color: '#333',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={salvarPresenca}
                    disabled={salvandoPresenca}
                    style={{
                      flex: 2,
                      padding: '12px',
                      backgroundColor: salvandoPresenca ? '#ccc' : presencaPresente ? '#16a34a' : '#dc2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: salvandoPresenca ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    {salvandoPresenca ? 'Salvando...' : (
                      <>
                        <Icon icon={presencaPresente ? 'mdi:check' : 'mdi:close'} width="18" />
                        {presencaPresente ? 'Registrar Presença' : 'Registrar Falta'}
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Modo visualização */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '14px',
                  borderRadius: '8px',
                  backgroundColor: presencaPresente ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${presencaPresente ? '#bbf7d0' : '#fecaca'}`,
                  marginBottom: '16px'
                }}>
                  <Icon
                    icon={presencaPresente ? 'mdi:check-circle' : 'mdi:close-circle'}
                    width="22"
                    color={presencaPresente ? '#16a34a' : '#dc2626'}
                  />
                  <span style={{
                    fontSize: '15px',
                    fontWeight: '600',
                    color: presencaPresente ? '#16a34a' : '#dc2626'
                  }}>
                    {presencaPresente ? 'Presente' : 'Falta'}
                  </span>
                </div>

                {presencaObservacao && (
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#888', marginBottom: '4px' }}>
                      {presencaPresente ? 'O que foi feito na aula' : 'Motivo da falta'}
                    </label>
                    <p style={{ fontSize: '14px', color: '#333', margin: 0, lineHeight: '1.5' }}>
                      {presencaObservacao}
                    </p>
                  </div>
                )}

                {/* Botões visualização */}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => setMostrarModalPresenca(false)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      backgroundColor: '#f5f5f5',
                      color: '#333',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Fechar
                  </button>
                  <button
                    onClick={() => setPresencaModoEdicao(true)}
                    style={{
                      flex: 2,
                      padding: '12px',
                      backgroundColor: '#344848',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Icon icon="mdi:pencil" width="18" />
                    Editar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
