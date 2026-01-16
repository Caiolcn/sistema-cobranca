import { useState, cloneElement, isValidElement, Children } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'

/**
 * Componente wrapper para features bloqueadas por plano
 * Mostra o título visível e o conteúdo borrado, com cadeado discreto no canto
 *
 * IMPORTANTE: Este componente clona o filho e adiciona position: relative
 * para não quebrar layouts de grid/flex
 *
 * @param {boolean} locked - Se a feature está bloqueada
 * @param {string} requiredPlan - Nome do plano necessário (ex: "Pro", "Premium")
 * @param {React.ReactNode} children - Conteúdo a ser renderizado (deve ser um único elemento)
 * @param {string} featureName - Nome da feature (para exibir no tooltip)
 */
export default function FeatureLocked({
  locked,
  requiredPlan = 'Pro',
  children,
  featureName = 'Esta funcionalidade'
}) {
  const navigate = useNavigate()
  const [showTooltip, setShowTooltip] = useState(false)

  if (!locked) {
    return children
  }

  // Função para aplicar blur apenas nos elementos de valor/conteúdo, mantendo títulos visíveis
  const processChildren = (child) => {
    if (!isValidElement(child)) return child

    const className = child.props.className || ''

    // Elementos que devem ser borrados (valores, gráficos, dados)
    const shouldBlur =
      className.includes('card-value') ||
      className.includes('card-body') ||
      className.includes('card-subtitle') ||
      className.includes('card-footer') ||
      className.includes('home-grafico') ||
      className.includes('aging-body') ||
      className.includes('aging-container')

    if (shouldBlur) {
      return cloneElement(child, {
        style: {
          ...child.props.style,
          filter: 'blur(8px)',
          userSelect: 'none',
          pointerEvents: 'none'
        }
      })
    }

    // Processar filhos recursivamente
    if (child.props.children) {
      return cloneElement(child, {
        children: Children.map(child.props.children, processChildren)
      })
    }

    return child
  }

  // Pegar o primeiro (e único) filho
  const child = Children.only(children)

  // Processar o filho aplicando blur nos elementos corretos
  const processedChild = processChildren(child)

  // Clonar o filho adicionando position relative e os elementos extras
  const enhancedChild = cloneElement(processedChild, {
    style: {
      ...processedChild.props.style,
      position: 'relative',
      cursor: 'pointer'
    },
    onClick: (e) => {
      e.stopPropagation()
      setShowTooltip(true)
    },
    children: (
      <>
        {processedChild.props.children}

        {/* Cadeado discreto no canto */}
        <div style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          borderRadius: '50%',
          width: '28px',
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10
        }}>
          <Icon icon="mdi:lock" width="14" height="14" style={{ color: 'rgba(255, 152, 0, 0.85)' }} />
        </div>
      </>
    )
  })

  // Modal renderizado via Portal para garantir que fique no centro da tela
  const upgradeModal = showTooltip && createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={(e) => {
          e.stopPropagation()
          setShowTooltip(false)
        }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 10000,
          animation: 'fadeIn 0.2s ease-out'
        }}
      />

      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          zIndex: 10001,
          minWidth: '280px',
          maxWidth: '90vw',
          textAlign: 'center',
          animation: 'slideUp 0.3s ease-out'
        }}
      >
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: '#fff3e0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px auto'
        }}>
          <Icon icon="mdi:lock" width="24" height="24" style={{ color: '#ff9800' }} />
        </div>

        <h4 style={{
          margin: '0 0 8px 0',
          fontSize: '18px',
          fontWeight: '600',
          color: '#1a1a1a'
        }}>
          Recurso Bloqueado
        </h4>

        <p style={{
          margin: '0 0 20px 0',
          fontSize: '14px',
          color: '#666',
          lineHeight: '1.5'
        }}>
          <strong>{featureName}</strong> está disponível no plano <strong>{requiredPlan}</strong> ou superior.
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={() => setShowTooltip(false)}
            style={{
              padding: '10px 20px',
              backgroundColor: 'white',
              color: '#666',
              border: '1px solid #e0e0e0',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
              fontWeight: '500',
              minWidth: '100px',
              transition: 'all 0.2s'
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
            Fechar
          </button>
          <button
            onClick={() => {
              setShowTooltip(false)
              navigate('/app/configuracao?aba=upgrade')
            }}
            style={{
              padding: '10px 20px',
              backgroundColor: '#ff9800',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              minWidth: '100px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f57c00'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#ff9800'
            }}
          >
            <Icon icon="mdi:rocket-launch" width="16" height="16" />
            Fazer Upgrade
          </button>
        </div>
      </div>

      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideUp {
            from { transform: translate(-50%, -50%) translateY(20px); opacity: 0; }
            to { transform: translate(-50%, -50%) translateY(0); opacity: 1; }
          }
        `}
      </style>
    </>,
    document.body
  )

  return (
    <>
      {enhancedChild}
      {upgradeModal}
    </>
  )
}
