/**
 * Meta Pixel Helper
 * Funções para disparar eventos do Meta Pixel
 *
 * Todo evento que também sai pelo servidor (Conversions API) precisa levar um
 * `eventId`: é a chave de deduplicação. Sem ela o Meta conta o cadastro duas
 * vezes (uma pelo navegador, outra pela CAPI) e o CPA aparece pela metade.
 */

import { supabase } from '../supabaseClient'
import { obterAtribuicao } from './metaAttribution'

// Verifica se o fbq está disponível
const isFbqAvailable = () => typeof window !== 'undefined' && window.fbq

const disparar = (evento, dados, eventId) => {
  if (!isFbqAvailable()) return
  if (eventId) {
    window.fbq('track', evento, dados || {}, { eventID: eventId })
  } else {
    window.fbq('track', evento, dados || {})
  }
}

/**
 * Manda o mesmo evento pelo servidor (Conversions API).
 *
 * Server-side pega o que o navegador perde — adblock, ITP do Safari, aba
 * fechada antes do pixel subir. Nunca propaga erro: medição não pode derrubar
 * o fluxo que está sendo medido.
 */
export const enviarEventoCapi = async (eventName, { eventId, valor, plano } = {}) => {
  try {
    const atrib = obterAtribuicao() || {}
    await supabase.functions.invoke('meta-capi', {
      body: {
        event_name: eventName,
        event_id: eventId,
        valor,
        plano,
        event_source_url: typeof window !== 'undefined' ? window.location.href : null,
        fbp: atrib.fbp || null,
        fbc: atrib.fbc || null,
        user_agent: atrib.user_agent || null
      }
    })
  } catch (erro) {
    console.error('Falha ao enviar evento pela CAPI (não bloqueia):', erro)
  }
}

/**
 * Dispara evento de Lead (início de cadastro)
 */
export const trackLead = (eventId) => {
  disparar('Lead', {}, eventId)
}

/**
 * Dispara evento de cadastro completo
 */
export const trackCompleteRegistration = (eventId) => {
  disparar('CompleteRegistration', {}, eventId)
}

/**
 * Dispara evento de início de trial
 */
export const trackStartTrial = (eventId) => {
  disparar('StartTrial', {}, eventId)
}

/**
 * Dispara evento de assinatura
 * @param {number} value - Valor da assinatura
 * @param {string} planName - Nome do plano
 */
export const trackSubscribe = (value, planName, eventId) => {
  disparar('Subscribe', { value, currency: 'BRL', content_name: planName }, eventId)
}

/**
 * Dispara evento de compra/pagamento
 * @param {number} value - Valor do pagamento
 * @param {string} planName - Nome do plano
 */
export const trackPurchase = (value, planName, eventId) => {
  disparar('Purchase', { value, currency: 'BRL', content_name: planName }, eventId)
}

/**
 * Dispara evento de visualização de conteúdo (página de preços)
 * @param {string} contentName - Nome do conteúdo
 */
export const trackViewContent = (contentName) => {
  disparar('ViewContent', { content_name: contentName })
}

/**
 * Dispara evento de início de checkout
 * @param {number} value - Valor
 * @param {string} planName - Nome do plano
 */
export const trackInitiateCheckout = (value, planName) => {
  disparar('InitiateCheckout', { value, currency: 'BRL', content_name: planName })
}
