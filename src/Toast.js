import React, { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'

// Sistema global de toast
let toastQueue = []
let toastListeners = []

export const showToast = (message, type = 'success') => {
  const id = Date.now()
  const toast = { id, message, type }
  toastQueue.push(toast)
  toastListeners.forEach(listener => listener([...toastQueue]))

  // Auto-remover após 4 segundos
  setTimeout(() => {
    hideToast(id)
  }, 4000)
}

export const hideToast = (id) => {
  toastQueue = toastQueue.filter(t => t.id !== id)
  toastListeners.forEach(listener => listener([...toastQueue]))
}

export const subscribeToToasts = (callback) => {
  toastListeners.push(callback)
  return () => {
    const index = toastListeners.indexOf(callback)
    if (index > -1) toastListeners.splice(index, 1)
  }
}

export default function Toast() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const unsubscribe = subscribeToToasts((newToasts) => {
      setToasts(newToasts)
    })
    return unsubscribe
  }, [])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      maxWidth: '400px'
    }}>
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

const ToastItem = React.memo(function ToastItem({ toast }) {
  const [isExiting, setIsExiting] = useState(false)

  const handleClose = () => {
    setIsExiting(true)
    setTimeout(() => {
      hideToast(toast.id)
    }, 300)
  }

  const getIconAndColor = () => {
    switch (toast.type) {
      case 'success':
        return {
          icon: 'mdi:check-circle',
          color: '#4CAF50',
          bgColor: '#E8F5E9'
        }
      case 'error':
        return {
          icon: 'mdi:alert-circle',
          color: '#f44336',
          bgColor: '#FFEBEE'
        }
      case 'warning':
        return {
          icon: 'mdi:alert',
          color: '#ff9800',
          bgColor: '#FFF3E0'
        }
      case 'info':
        return {
          icon: 'mdi:information',
          color: '#2196F3',
          bgColor: '#E3F2FD'
        }
      default:
        return {
          icon: 'mdi:check-circle',
          color: '#4CAF50',
          bgColor: '#E8F5E9'
        }
    }
  }

  const { icon, color, bgColor } = getIconAndColor()

  return (
    <div
      style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '14px 16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        minWidth: '300px',
        borderLeft: `4px solid ${color}`,
        animation: isExiting ? 'slideOut 0.3s ease-out' : 'slideIn 0.3s ease-out',
        transform: isExiting ? 'translateX(100%)' : 'translateX(0)',
        opacity: isExiting ? 0 : 1,
        transition: 'all 0.3s ease-out'
      }}
    >
      {/* Ícone */}
      <div style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        backgroundColor: bgColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}>
        <Icon icon={icon} width="20" height="20" style={{ color }} />
      </div>

      {/* Mensagem */}
      <div style={{
        flex: 1,
        fontSize: '14px',
        color: '#333',
        fontWeight: '500'
      }}>
        {toast.message}
      </div>

      {/* Botão fechar */}
      <div
        onClick={handleClose}
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background-color 0.2s',
          flexShrink: 0
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        <Icon icon="mdi:close" width="18" height="18" style={{ color: '#999' }} />
      </div>

      <style>
        {`
          @keyframes slideIn {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }

          @keyframes slideOut {
            from {
              transform: translateX(0);
              opacity: 1;
            }
            to {
              transform: translateX(100%);
              opacity: 0;
            }
          }
        `}
      </style>
    </div>
  )
})
