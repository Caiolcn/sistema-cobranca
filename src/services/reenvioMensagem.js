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
