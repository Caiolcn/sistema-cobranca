/**
 * Meta Pixel Helper
 * Funções para disparar eventos do Meta Pixel
 */

// Verifica se o fbq está disponível
const isFbqAvailable = () => typeof window !== 'undefined' && window.fbq

/**
 * Dispara evento de Lead (início de cadastro)
 */
export const trackLead = () => {
  if (isFbqAvailable()) {
    window.fbq('track', 'Lead')
  }
}

/**
 * Dispara evento de cadastro completo
 */
export const trackCompleteRegistration = () => {
  if (isFbqAvailable()) {
    window.fbq('track', 'CompleteRegistration')
  }
}

/**
 * Dispara evento de início de trial
 */
export const trackStartTrial = () => {
  if (isFbqAvailable()) {
    window.fbq('track', 'StartTrial')
  }
}

/**
 * Dispara evento de assinatura
 * @param {number} value - Valor da assinatura
 * @param {string} planName - Nome do plano
 */
export const trackSubscribe = (value, planName) => {
  if (isFbqAvailable()) {
    window.fbq('track', 'Subscribe', {
      value: value,
      currency: 'BRL',
      content_name: planName
    })
  }
}

/**
 * Dispara evento de compra/pagamento
 * @param {number} value - Valor do pagamento
 * @param {string} planName - Nome do plano
 */
export const trackPurchase = (value, planName) => {
  if (isFbqAvailable()) {
    window.fbq('track', 'Purchase', {
      value: value,
      currency: 'BRL',
      content_name: planName
    })
  }
}

/**
 * Dispara evento de visualização de conteúdo (página de preços)
 * @param {string} contentName - Nome do conteúdo
 */
export const trackViewContent = (contentName) => {
  if (isFbqAvailable()) {
    window.fbq('track', 'ViewContent', {
      content_name: contentName
    })
  }
}

/**
 * Dispara evento de início de checkout
 * @param {number} value - Valor
 * @param {string} planName - Nome do plano
 */
export const trackInitiateCheckout = (value, planName) => {
  if (isFbqAvailable()) {
    window.fbq('track', 'InitiateCheckout', {
      value: value,
      currency: 'BRL',
      content_name: planName
    })
  }
}
