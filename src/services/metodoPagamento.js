import { supabase } from '../supabaseClient'

/* ============================================================
   Método de pagamento das mensagens — fonte única: Recebimentos.

   Quem decide é Configurações › Recebimentos (usuarios.modo_integracao).
   A chave `<user>_metodo_pagamento_whatsapp` em `config` continua
   existindo porque as views de cobrança, o portal (portal-dados) e o
   Financeiro leem dela — mas agora ela é sempre DERIVADA daqui:

     modo 'asaas' + chave do Asaas cadastrada  → 'asaas_link'
     qualquer outro caso                        → 'pix_manual'

   Ao trocar, os modelos de mensagem do cliente também trocam a
   variável ({{chavePix}} <-> {{linkPagamento}}) e o rótulo, como a
   tela do WhatsApp fazia antes. Sem isso o aluno receberia
   "Link de pagamento:" vazio.

   ORDEM IMPORTA (achado do revisor, 28/11/2026): os modelos são
   trocados ANTES de gravar o config, e a troca roda SEMPRE, não só
   quando o método muda. A troca é idempotente (modelo já certo não é
   tocado). Assim, se um modelo falhar no meio, o config fica no valor
   antigo e a próxima tentativa refaz o que faltou — em vez de sair
   cedo achando que "já está igual" e deixar modelo desencontrado.
   ============================================================ */

export function metodoDoModo(modoIntegracao, temChaveAsaas) {
  return modoIntegracao === 'asaas' && temChaveAsaas ? 'asaas_link' : 'pix_manual'
}

async function trocarVariavelNosModelos(userId, metodo) {
  const de = metodo === 'asaas_link' ? '{{chavePix}}' : '{{linkPagamento}}'
  const para = metodo === 'asaas_link' ? '{{linkPagamento}}' : '{{chavePix}}'

  const { data: modelos, error } = await supabase
    .from('templates')
    .select('id, mensagem')
    .eq('user_id', userId)
  if (error) throw error

  for (const t of modelos || []) {
    const msg = t.mensagem || ''
    const precisa = msg.includes(de) ||
      (de === '{{chavePix}}' && (msg.includes('Chave Pix:') || msg.includes('Pix para pagamento:'))) ||
      (de === '{{linkPagamento}}' && msg.includes('Link de pagamento:'))
    if (!precisa) continue

    let nova = msg.split(de).join(para)
    if (metodo === 'asaas_link') {
      nova = nova
        .replace(/🔑 Chave Pix:/g, '🔗 Link de pagamento:')
        .replace(/💳 Pix para pagamento:/g, '🔗 Link de pagamento:')
    } else {
      nova = nova.replace(/🔗 Link de pagamento:/g, '🔑 Chave Pix:')
    }
    if (nova === msg) continue

    const { error: erroUpd } = await supabase.from('templates').update({ mensagem: nova }).eq('id', t.id)
    if (erroUpd) throw erroUpd
  }
}

/**
 * Recalcula o método das mensagens a partir de Recebimentos, acerta os
 * modelos e só então grava em `config`.
 * Retorna o método final ('asaas_link' | 'pix_manual').
 */
export async function sincronizarMetodoPagamento(userId) {
  if (!userId) return null

  const { data: u, error } = await supabase
    .from('usuarios')
    .select('modo_integracao, asaas_api_key')
    .eq('id', userId)
    .single()
  if (error) throw error

  const metodo = metodoDoModo(u?.modo_integracao, !!(u?.asaas_api_key || '').trim())

  // 1) Modelos primeiro (sempre; não mexe no que já está certo)
  await trocarVariavelNosModelos(userId, metodo)

  // 2) Config depois
  const chave = `${userId}_metodo_pagamento_whatsapp`
  const { data: atual } = await supabase
    .from('config')
    .select('id, valor')
    .eq('chave', chave)
    .maybeSingle()

  if (atual && atual.valor === metodo) return metodo

  if (atual) {
    const { error: e } = await supabase
      .from('config')
      .update({ valor: metodo, updated_at: new Date().toISOString() })
      .eq('id', atual.id)
    if (e) throw e
  } else {
    const { error: e } = await supabase.from('config').insert({
      user_id: userId,
      chave,
      valor: metodo,
      descricao: 'Método de pagamento nas mensagens WhatsApp (derivado de Recebimentos)',
      updated_at: new Date().toISOString()
    })
    if (e) throw e
  }
  return metodo
}
