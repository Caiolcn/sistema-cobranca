import { supabase, FUNCTIONS_URL } from '../supabaseClient'

/**
 * Único caminho do frontend para a Evolution API.
 *
 * POR QUE ISSO EXISTE
 * A chave da Evolution é GLOBAL — uma só para o servidor inteiro, não uma por
 * conta. Até 08/09/2026 o front lia `config.evolution_api_key` e falava direto
 * com a Evolution, o que colocava a chave mestra no navegador de todo cliente:
 * com ela dá para ler conversas, enviar mensagens e derrubar a sessão de
 * QUALQUER outra escola. Agora quem conhece a chave é a edge function
 * `evolution-proxy`; aqui só se pede a operação pelo nome.
 *
 * REGRAS QUE O SERVIDOR IMPÕE (não dá para contornar daqui)
 * - A instância é resolvida no servidor a partir do user_id. Mandar `instance`
 *   só funciona para admin; cliente comum recebe 403 se pedir a instância alheia.
 * - Só passam as operações da allowlist do proxy.
 * - `fetchInstances` sem instância e `delete` são restritos a admin.
 *
 * NÃO reintroduza leitura de `evolution_api_key` no front.
 */

/**
 * @param {string} op       nome da operação na allowlist do proxy
 * @param {object} [params] corpo enviado à Evolution (só em operações POST)
 * @param {string} [instance] só admin; ignorado para cliente comum
 * @returns {Promise<{ok:boolean,status:number,data:any,instancia:string|null,erro?:string}>}
 */
export async function chamarEvolution(op, params = {}, instance = undefined, timeoutMs = 0) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { ok: false, status: 401, data: null, instancia: null, erro: 'Sessão expirada' }
  }

  // Timeout opcional: as sondas de socket dependem de desistir em ~12s. Sem
  // isso, uma instância pendurada seguraria a tela do cliente indefinidamente.
  const controller = timeoutMs > 0 ? new AbortController() : null
  const idTimeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    const resposta = await fetch(`${FUNCTIONS_URL}/evolution-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ op, params, ...(instance ? { instance } : {}) }),
      ...(controller ? { signal: controller.signal } : {}),
    })

    const corpo = await resposta.json().catch(() => ({}))

    // O proxy devolve 200 mesmo quando a Evolution falha, com o status real em
    // `status` — assim "instância caiu" (500 da Evolution) não se confunde com
    // "sua chamada está errada" (4xx do proxy). Aqui normalizamos os dois.
    if (!resposta.ok) {
      return {
        ok: false,
        status: resposta.status,
        data: corpo,
        instancia: null,
        erro: corpo?.error || `Proxy retornou ${resposta.status}`,
      }
    }
    return corpo
  } catch (erro) {
    return { ok: false, status: 0, data: null, instancia: null, erro: erro?.message || 'Falha de rede' }
  } finally {
    if (idTimeout) clearTimeout(idTimeout)
  }
}

/** Açúcar: devolve só o corpo que a Evolution retornou, ou null se falhou. */
export async function dadosEvolution(op, params = {}, instance = undefined) {
  const r = await chamarEvolution(op, params, instance)
  return r.ok ? r.data : null
}
