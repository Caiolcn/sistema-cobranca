import { Icon } from '@iconify/react'

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Cancelar',
  type = 'danger', // 'danger', 'warning', 'info'
  showCheckbox = false,
  checkboxLabel = '',
  checkboxChecked = false,
  onCheckboxChange = () => {}
}) {
  if (!isOpen) return null

  const getTypeConfig = () => {
    switch (type) {
      case 'danger':
        return {
          icon: 'mdi:alert-circle-outline',
          iconColor: '#f44336',
          iconBg: '#ffebee',
          confirmBg: '#f44336',
          confirmHover: '#d32f2f'
        }
      case 'warning':
        return {
          icon: 'mdi:alert-outline',
          iconColor: '#ff9800',
          iconBg: '#fff3e0',
          confirmBg: '#ff9800',
          confirmHover: '#f57c00'
        }
      case 'info':
        return {
          icon: 'mdi:information-outline',
          iconColor: '#2196F3',
          iconBg: '#e3f2fd',
          confirmBg: '#2196F3',
          confirmHover: '#1976D2'
        }
      case 'success':
        return {
          icon: 'mdi:check-circle-outline',
          iconColor: '#4CAF50',
          iconBg: '#e8f5e9',
          confirmBg: '#4CAF50',
          confirmHover: '#388E3C'
        }
      default:
        return {
          icon: 'mdi:alert-circle-outline',
          iconColor: '#f44336',
          iconBg: '#ffebee',
          confirmBg: '#f44336',
          confirmHover: '#d32f2f'
        }
    }
  }

  const config = getTypeConfig()

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.2s ease-out'
        }}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '440px',
            width: '90%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            animation: 'slideUp 0.3s ease-out'
          }}
        >
          {/* Header com ícone */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '16px',
            marginBottom: '20px'
          }}>
            {/* Ícone */}
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: config.iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Icon icon={config.icon} width="28" height="28" style={{ color: config.iconColor }} />
            </div>

            {/* Título e mensagem */}
            <div style={{ flex: 1, paddingTop: '4px' }}>
              <h3 style={{
                margin: '0 0 8px 0',
                fontSize: '18px',
                fontWeight: '600',
                color: '#1a1a1a'
              }}>
                {title}
              </h3>
              <p style={{
                margin: 0,
                fontSize: '14px',
                lineHeight: '1.5',
                color: '#666',
                whiteSpace: 'pre-line'
              }}>
                {message}
              </p>

              {/* Checkbox opcional */}
              {showCheckbox && (
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginTop: '16px',
                  padding: '12px',
                  backgroundColor: '#fff8e1',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  border: '1px solid #ffe082'
                }}>
                  <input
                    type="checkbox"
                    checked={checkboxChecked}
                    onChange={(e) => onCheckboxChange(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#ff9800' }}
                  />
                  <span style={{ fontSize: '14px', color: '#666' }}>{checkboxLabel}</span>
                </label>
              )}
            </div>
          </div>

          {/* Botões */}
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
            marginTop: '24px'
          }}>
            {/* Cancelar - só mostra se tiver texto */}
            {cancelText && (
              <button
                onClick={onClose}
                style={{
                  padding: '10px 20px',
                  borderRadius: '6px',
                  border: '1px solid #e0e0e0',
                  backgroundColor: 'white',
                  color: '#666',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  minWidth: '100px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5'
                  e.currentTarget.style.borderColor = '#ccc'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white'
                  e.currentTarget.style.borderColor = '#e0e0e0'
                }}
              >
                {cancelText}
              </button>
            )}

            {/* Confirmar */}
            <button
              onClick={handleConfirm}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: config.confirmBg,
                color: 'white',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s',
                minWidth: '100px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = config.confirmHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = config.confirmBg
              }}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>

      <style>
        {`
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes slideUp {
            from {
              transform: translateY(20px);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
        `}
      </style>
    </>
  )
}
