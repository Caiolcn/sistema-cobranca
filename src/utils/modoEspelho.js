/**
 * Modo espelho — "ver como cliente" do /admin.
 *
 * A sessão aberta pelo link é a sessão REAL do cliente: se o app escrever
 * alguma coisa, escreve na conta dele, com o nome dele no log. Por isso o modo
 * espelho existe: a flag aqui é lida pelo supabaseClient e pelo whatsappService
 * para barrar TODA escrita — insert/update/delete, RPC, edge function e envio
 * de WhatsApp — em vez de depender de desabilitar botão por botão.
 *
 * Fica em sessionStorage (não localStorage) de propósito: vale para a aba, e
 * fechar o anônimo encerra o espelho junto.
 */

const CHAVE = 'mensalli_modo_espelho'

export function ativarModoEspelho({ targetUserId, conta, email }) {
  sessionStorage.setItem(CHAVE, JSON.stringify({
    targetUserId,
    conta,
    email,
    iniciadoEm: new Date().toISOString(),
  }))
}

export function dadosModoEspelho() {
  try {
    const bruto = sessionStorage.getItem(CHAVE)
    return bruto ? JSON.parse(bruto) : null
  } catch {
    return null
  }
}

export function modoEspelhoAtivo() {
  return dadosModoEspelho() !== null
}

export function limparModoEspelho() {
  sessionStorage.removeItem(CHAVE)
}

/** Erro devolvido no lugar de qualquer escrita, no formato do PostgrestError. */
export const ERRO_ESPELHO = {
  message: 'Modo espelho: você está vendo a conta do cliente, alterações estão bloqueadas.',
  details: null,
  hint: null,
  code: 'MODO_ESPELHO',
}
