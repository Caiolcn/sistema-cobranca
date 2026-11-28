import React, { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import './Toast.css'

/* ============================================================
   Toast — DS Mensalli
   Uso:
     import { showSuccess, showError } from '.../design-system/components/Toast'
     showSuccess('Aluno salvo')
   O componente <Toast /> é montado uma vez só (App.js).
   O arquivo antigo src/Toast.js só reexporta este.
   ============================================================ */

const DURACAO_MS = 4000
const SAIDA_MS = 300

let toastQueue = []
let toastListeners = []
let proximoId = 0

const avisar = () => toastListeners.forEach(listener => listener([...toastQueue]))

export const hideToast = (id) => {
  toastQueue = toastQueue.filter(t => t.id !== id)
  avisar()
}

export const showToast = (message, type = 'success') => {
  proximoId += 1
  const id = proximoId
  toastQueue.push({ id, message, type })
  avisar()
  setTimeout(() => hideToast(id), DURACAO_MS)
  return id
}

export const showSuccess = (message) => showToast(message, 'success')
export const showError   = (message) => showToast(message, 'error')
export const showWarning = (message) => showToast(message, 'warning')
export const showInfo    = (message) => showToast(message, 'info')

export const subscribeToToasts = (callback) => {
  toastListeners.push(callback)
  return () => {
    toastListeners = toastListeners.filter(l => l !== callback)
  }
}

const ICONES = {
  success: 'mdi:check-circle',
  error: 'mdi:alert-circle',
  warning: 'mdi:alert',
  info: 'mdi:information',
}

export default function Toast() {
  const [toasts, setToasts] = useState([])

  useEffect(() => subscribeToToasts(setToasts), [])

  // A região fica sempre montada: leitor de tela só anuncia o que entra
  // numa região aria-live que já existia antes.
  return (
    <div className="ds-toast-region" aria-live="polite" aria-relevant="additions">
      {toasts.map(toast => <ToastItem key={toast.id} toast={toast} />)}
    </div>
  )
}

const ToastItem = React.memo(function ToastItem({ toast }) {
  const [saindo, setSaindo] = useState(false)
  const tipo = ICONES[toast.type] ? toast.type : 'success'

  const fechar = () => {
    setSaindo(true)
    setTimeout(() => hideToast(toast.id), SAIDA_MS)
  }

  return (
    <div
      className={`ds-toast ds-toast--${tipo}${saindo ? ' ds-toast--saindo' : ''}`}
      role={tipo === 'error' ? 'alert' : 'status'}
    >
      <span className="ds-toast__icon" aria-hidden="true">
        <Icon icon={ICONES[tipo]} width="20" height="20" />
      </span>
      <div className="ds-toast__message">{toast.message}</div>
      <button type="button" className="ds-toast__close" onClick={fechar} aria-label="Fechar aviso">
        <Icon icon="mdi:close" width="18" height="18" />
      </button>
    </div>
  )
})
