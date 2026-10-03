import { supabase } from '../supabaseClient'
import whatsappService from './whatsappService'

/**
 * Reenvio manual de uma mensagem que falhou — usado pela Central de Mensagens.
 *
 * Por que existe um módulo só pra isso, em vez de chamar enviarCobranca():
 * enviarCobranca() → enviarMensagem() reinicia a instância ao ver 'Connection
 * Closed'. E a única classe que ganha botão "Reenviar" (`transitoria`) é
 * composta exatamente desse tipo de falha — ou seja, o botão óbvio seria um
 * botão de restart em massa. Restart derruba cliente saudável, e é por isso
 * que o whatsapp-zumbi-diario limita a 1x/24h por instância.
 *
 * Aqui o caminho é: 1 chamada à Evolution, sem sonda, sem retry, sem restart.
 *
 * As travas de verdade moram no banco (reivindicar_reenvio), não aqui:
 * autorização, classe da falha, instância conectada, cooldown por conta e
 * duplicidade são decididos numa transação só. Botão desabilitado na UI não
 * protege contra duas abas nem contra dois admins.
 */

const MENSAGENS_ERRO = {
  log_inexistente: 'Esta mensagem não existe mais.',
  sem_permissao: 'Você não tem permissão para reenviar esta mensagem.',
  nao_reenviavel:
    'Esta mensagem não pode ser reenviada. Só falha de conexão/infra é reenviável — número inválido exige corrigir o cadastro, e mensagem já entregue não deve ser reenviada.',
  sem_texto_original: 'O texto original não foi registrado, então não há o que reenviar.',
  sem_telefone: 'O aluno está sem telefone cadastrado.',
  sem_instancia: 'Esta conta não tem instância de WhatsApp configurada.',
  whatsapp_desconectado:
    'O WhatsApp desta conta está marcado como desconectado. Reconecte em WhatsApp → Conexão, ou tente mesmo assim.',
  cooldown: 'Aguarde alguns segundos antes de reenviar outra mensagem desta conta.',
  ja_reenviada: 'Esta mensagem já foi reenviada.'
}

/**
 * @param {string} logId  id em logs_mensagens da mensagem que falhou
 * @returns {{ ok: boolean, motivo?: string, mensagem: string }}
 */
export async function reenviarMensagem(logId) {
  if (!logId) return { ok: false, motivo: 'log_inexistente', mensagem: MENSAGENS_ERRO.log_inexistente }

  // 1. Reivindica. Se outro clique/aba chegou antes, morre aqui — antes de
  //    qualquer chamada à Evolution. Conta desconectada também para aqui: o
  //    fluxo da tela é reconectar e ENTÃO reenviar, nunca bater em socket
  //    morto. (O RPC aceita p_forcar, mas a tela nunca passa — existe só como
  //    escape para diagnóstico manual.)
  const { data, error } = await supabase.rpc('reivindicar_reenvio', {
    p_log_id: logId,
    p_cooldown_seg: 20
  })

  if (error) {
    console.error('Reenvio: falha ao reivindicar', error)
    return { ok: false, motivo: 'erro_rpc', mensagem: 'Não foi possível iniciar o reenvio. Tente de novo.' }
  }

  const claim = Array.isArray(data) ? data[0] : data
  if (!claim) {
    return { ok: false, motivo: 'erro_rpc', mensagem: 'Não foi possível iniciar o reenvio. Tente de novo.' }
  }
  if (claim.erro) {
    return {
      ok: false,
      motivo: claim.erro,
      mensagem: MENSAGENS_ERRO[claim.erro] || 'Não foi possível reenviar esta mensagem.'
    }
  }

  // 2. Envio. Mesmo texto e mesma instância do envio original — reenviar é
  //    repetir a entrega, não gerar cobrança nova.
  const resultado = await whatsappService.reenviarMensagemSegura({
    jid: claim.destino,
    mensagem: claim.mensagem,
    instanceName: claim.instance_name
  })

  // 3. Registra a tentativa como um log novo. O trigger de logs_mensagens
  //    classifica falha_classe sozinho, então o reenvio que falhar de novo
  //    volta pra tela já classificado.
  let logNovoId = null
  try {
    const { data: origem } = await supabase
      .from('logs_mensagens')
      .select('user_id, devedor_id, mensalidade_id, tipo, telefone, valor_mensalidade, data_vencimento')
      .eq('id', logId)
      .single()

    const { data: inserido } = await supabase
      .from('logs_mensagens')
      .insert({
        user_id: origem?.user_id,
        devedor_id: origem?.devedor_id,
        mensalidade_id: origem?.mensalidade_id,
        tipo: origem?.tipo,
        telefone: origem?.telefone,
        valor_mensalidade: origem?.valor_mensalidade,
        data_vencimento: origem?.data_vencimento,
        mensagem: claim.mensagem,
        status: resultado.sucesso ? 'enviado' : 'falha',
        erro: resultado.erro || null,
        erro_codigo: resultado.erroCodigo || (resultado.sucesso ? null : 'unknown'),
        http_status: resultado.httpStatus || null,
        response_api: resultado.responseApi || null
      })
      .select('id')
      .single()

    logNovoId = inserido?.id || null
  } catch (e) {
    // Log é rastro, não pode derrubar o resultado do envio — a mensagem pode
    // ter saído de verdade.
    console.error('Reenvio: falha ao registrar log', e)
  }

  // 4. Fecha a reivindicação com o desfecho real.
  try {
    await supabase.rpc('concluir_reenvio', {
      p_fila_id: claim.fila_id,
      p_log_novo: logNovoId,
      p_ok: !!resultado.sucesso
    })
  } catch (e) {
    console.error('Reenvio: falha ao concluir', e)
  }

  if (resultado.sucesso) {
    return { ok: true, mensagem: 'Mensagem reenviada.' }
  }
  return {
    ok: false,
    motivo: resultado.erroCodigo || 'falha_envio',
    mensagem: resultado.erro || 'O reenvio falhou.'
  }
}

const MENSAGENS_ERRO_BARRADA = {
  fila_inexistente: 'Esta mensagem não existe mais.',
  sem_permissao: 'Você não tem permissão para enviar esta mensagem.',
  ja_enviada: 'Esta mensagem já foi enviada hoje.',
  fora_da_janela: 'Só dá para enviar no mesmo dia. Cobrança de vencimento no dia seguinte não é enviada.',
  tipo_nao_suportado: 'Este tipo de mensagem não pode ser enviado por aqui.',
  ja_paga: 'A mensalidade não está mais pendente — nada a cobrar.',
  sem_telefone: 'O aluno está sem telefone cadastrado.',
  sem_instancia: 'Esta conta não tem instância de WhatsApp configurada.',
  whatsapp_desconectado: 'O WhatsApp desta conta ainda consta como desconectado. Reconecte e tente de novo.',
  cooldown: 'Aguarde alguns segundos antes de enviar outra mensagem desta conta.'
}

/**
 * Envio manual de mensagem BARRADA (a régua não tentou porque o WhatsApp da
 * conta estava desconectado). Diferente do reenvio, não há texto gravado: ele
 * é montado agora com o template do dono, igual a régua faria.
 *
 * Travas no banco (reivindicar_envio_barrada): mesmo dia, mensalidade ainda
 * pendente, nada enviado hoje para ela, conta conectada, cooldown. O envio
 * vai pelo mesmo caminho seguro do reenvio — 1 chamada, sem restart.
 *
 * @param {string} filaId  id em mensagens_fila da linha barrada
 * @returns {{ ok: boolean, motivo?: string, mensagem: string }}
 */
export async function enviarMensagemBarrada(filaId) {
  if (!filaId) return { ok: false, motivo: 'fila_inexistente', mensagem: MENSAGENS_ERRO_BARRADA.fila_inexistente }

  const { data, error } = await supabase.rpc('reivindicar_envio_barrada', {
    p_fila_id: filaId,
    p_cooldown_seg: 20
  })

  if (error) {
    console.error('Envio barrada: falha ao reivindicar', error)
    return { ok: false, motivo: 'erro_rpc', mensagem: 'Não foi possível iniciar o envio. Tente de novo.' }
  }

  const claim = Array.isArray(data) ? data[0] : data
  if (!claim) {
    return { ok: false, motivo: 'erro_rpc', mensagem: 'Não foi possível iniciar o envio. Tente de novo.' }
  }
  if (claim.erro) {
    return {
      ok: false,
      motivo: claim.erro,
      mensagem: MENSAGENS_ERRO_BARRADA[claim.erro] || 'Não foi possível enviar esta mensagem.'
    }
  }

  // A linha já está em 'enviando' — daqui pra frente todo desfecho precisa
  // passar pelo concluir_reenvio, senão ela fica presa.
  let mensalidade = null
  let mensagemFinal = null
  let resultado
  try {
    const { data: m, error: mErr } = await supabase
      .from('mensalidades')
      .select('*, devedor:devedores(nome, telefone, portal_token, responsavel_nome, responsavel_telefone)')
      .eq('id', claim.mensalidade_id)
      .single()
    if (mErr || !m) throw mErr || new Error('Mensalidade não encontrada')
    mensalidade = m

    ;({ mensagemFinal } = await whatsappService.montarMensagemCobranca(mensalidade, claim.tipo))

    resultado = await whatsappService.reenviarMensagemSegura({
      jid: claim.destino,
      mensagem: mensagemFinal,
      instanceName: claim.instance_name
    })
  } catch (e) {
    console.error('Envio barrada: falha antes do envio', e)
    resultado = { sucesso: false, erro: e.message || 'Falha ao montar a mensagem', erroCodigo: 'exception' }
  }

  let logNovoId = null
  if (mensalidade) {
    try {
      const { data: inserido } = await supabase
        .from('logs_mensagens')
        .insert({
          user_id: mensalidade.user_id,
          devedor_id: mensalidade.devedor_id,
          mensalidade_id: mensalidade.id,
          tipo: claim.tipo,
          telefone: claim.destino,
          valor_mensalidade: mensalidade.valor,
          data_vencimento: mensalidade.data_vencimento,
          mensagem: mensagemFinal,
          status: resultado.sucesso ? 'enviado' : 'falha',
          erro: resultado.erro || null,
          erro_codigo: resultado.erroCodigo || (resultado.sucesso ? null : 'unknown'),
          http_status: resultado.httpStatus || null,
          response_api: resultado.responseApi || null
        })
        .select('id')
        .single()
      logNovoId = inserido?.id || null
    } catch (e) {
      console.error('Envio barrada: falha ao registrar log', e)
    }

    if (resultado.sucesso) {
      try {
        await whatsappService.registrarUsoCobranca(mensalidade, mensalidade.user_id)
      } catch (e) {
        console.error('Envio barrada: falha ao contabilizar uso', e)
      }
    }
  }

  try {
    await supabase.rpc('concluir_reenvio', {
      p_fila_id: claim.fila_id,
      p_log_novo: logNovoId,
      p_ok: !!resultado.sucesso
    })
  } catch (e) {
    console.error('Envio barrada: falha ao concluir', e)
  }

  if (resultado.sucesso) return { ok: true, mensagem: 'Mensagem enviada.' }
  return {
    ok: false,
    motivo: resultado.erroCodigo || 'falha_envio',
    mensagem: resultado.erro || 'O envio falhou.'
  }
}
