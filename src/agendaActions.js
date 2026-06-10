import { supabase } from './supabaseClient'
import { showToast } from './Toast'
import whatsappService from './services/whatsappService'

// ==========================================
// Ações da Agenda compartilhadas entre as views
// (cancelar agendamento online com refund + notificação da fila,
// e atalho "1-tap presença" para marcar presente direto sem modal)
// ==========================================

const TIMESTAMP = () => new Date().toISOString()

// Cancela um agendamento (admin removendo aluno do dia):
// 1) cancela o agendamento,
// 2) devolve crédito se houver,
// 3) notifica próximo da lista de espera por WhatsApp.
// Retorna { ok, novoCredito }
export async function cancelarAgendamento({ agendamento, userId, devedoresCredito, onCreditoChange }) {
  try {
    const { error } = await supabase.from('agendamentos')
      .update({ status: 'cancelado', cancelado_em: TIMESTAMP() })
      .eq('id', agendamento.id)
    if (error) throw error

    let novoCredito
    const cred = devedoresCredito?.[agendamento.devedor_id]
    if (cred) {
      novoCredito = cred.aulas_restantes + 1
      await supabase.from('devedores').update({ aulas_restantes: novoCredito }).eq('id', agendamento.devedor_id)
      onCreditoChange?.(agendamento.devedor_id, novoCredito)
    }

    const primeiroNome = agendamento?.devedores?.nome?.split(' ')[0] || 'Aluno'
    showToast(`${primeiroNome} removido do horário`, 'success')

    // Fila de espera — notifica o próximo, se houver
    try {
      const { data: proximo } = await supabase.from('lista_espera')
        .select('id, devedor_id')
        .eq('aula_id', agendamento.aula_id)
        .eq('data', agendamento.data)
        .eq('status', 'aguardando')
        .order('posicao', { ascending: true })
        .limit(1).maybeSingle()

      if (proximo) {
        const expiraEm = new Date(Date.now() + 60 * 60 * 1000).toISOString()
        await supabase.from('lista_espera').update({
          status: 'notificado',
          notificado_em: TIMESTAMP(),
          expira_em: expiraEm
        }).eq('id', proximo.id)

        const { data: aluno } = await supabase.from('devedores').select('nome, telefone').eq('id', proximo.devedor_id).single()
        if (aluno?.telefone) {
          const { data: aulaInfo } = await supabase.from('aulas').select('descricao, horario').eq('id', agendamento.aula_id).single()
          const { data: empresa } = await supabase.from('usuarios').select('agendamento_slug').eq('id', userId).single()
          const link = `https://www.mensalli.com.br/agendar/${empresa?.agendamento_slug || ''}?confirmar=${proximo.id}`
          const dataFmt = new Date(agendamento.data + 'T12:00:00').toLocaleDateString('pt-BR')
          const msg = `🎉 *Vaga disponível!*\n\nUma vaga abriu na aula que você está esperando:\n\n📚 ${aulaInfo?.descricao || 'Aula'}\n📅 ${dataFmt}\n🕐 ${aulaInfo?.horario || ''}\n\nConfirme sua vaga em até 1 hora:\n${link}\n\nSe não confirmar a tempo, a vaga passa para o próximo da fila.`
          await whatsappService.enviarMensagem(aluno.telefone, msg)
          showToast(`${aluno.nome?.split(' ')[0]} foi notificado da vaga (lista de espera)`, 'info')
        }
      }
    } catch (e) { console.error('Erro processando fila de espera:', e) }

    return { ok: true, novoCredito }
  } catch (err) {
    console.error('Erro ao cancelar agendamento:', err)
    showToast('Erro ao remover aluno', 'error')
    return { ok: false }
  }
}

// Marca presença/falta direta (1-tap) sem abrir modal.
// Para presente=true: decrementa crédito se houver pacote.
// Para presente=false: não mexe no crédito (falta não consome aula).
// Dispara notificação WhatsApp se o toggle estiver ligado.
// Retorna { presenca, novoCredito } pra view atualizar estado local.
export async function marcarPresencaRapida({
  aula, devedorId, devedores, data, userId,
  credito, enviarNotifPresenca, presente = true
}) {
  const insert = await supabase.from('presencas').insert({
    user_id: userId, aula_id: aula.id, devedor_id: devedorId,
    data, presente, observacao: null
  }).select()

  if (insert.error) {
    showToast(`Erro ao registrar ${presente ? 'presença' : 'falta'}: ` + insert.error.message, 'error')
    return { ok: false }
  }

  let novoCredito
  // Crédito só é debitado quando o aluno PRESENTE consome aula do pacote
  if (presente && credito) {
    novoCredito = Math.max(credito.aulas_restantes - 1, 0)
    if (novoCredito !== credito.aulas_restantes) {
      await supabase.from('devedores').update({ aulas_restantes: novoCredito }).eq('id', devedorId)
      const nome = devedores?.nome || 'Aluno'
      if (novoCredito === 0) showToast(`${nome} usou todas as aulas do pacote!`, 'warning')
      else if (novoCredito <= 2) showToast(`${nome} tem ${novoCredito} aula(s) restante(s)`, 'warning')
    }
  }

  showToast(presente ? 'Presença registrada!' : 'Falta registrada!', 'success')

  // WhatsApp (fire-and-forget) — respeita o master switch do aluno
  if (enviarNotifPresenca && devedores?.telefone && !(await whatsappService.alunoSilenciado(devedorId))) {
    try {
      const nome = devedores?.nome || 'Aluno'
      const desc = aula.descricao ? ` - ${aula.descricao}` : ''
      let msg
      if (presente) {
        if (credito) {
          const restante = novoCredito !== undefined ? novoCredito : credito.aulas_restantes
          const num = credito.aulas_total - restante
          msg = `✅ Presença confirmada, ${nome}!\n\n📚 Aula ${num} de ${credito.aulas_total}${desc}\n\n📊 Restam ${restante} aula(s) no seu pacote.`
        } else {
          msg = `✅ Presença confirmada, ${nome}!${aula.descricao ? `\n📚 ${aula.descricao}` : ''}`
        }
      } else {
        msg = `❌ Falta registrada, ${nome}.${aula.descricao ? `\n📚 ${aula.descricao}` : ''}`
        if (credito) msg += `\n\n📊 Você tem ${credito.aulas_restantes} aula(s) restante(s).`
      }
      await whatsappService.enviarMensagem(devedores.telefone, msg)
    } catch (e) { console.error('Erro notificação presença:', e) }
  }

  return { ok: true, presenca: insert.data[0], novoCredito }
}
