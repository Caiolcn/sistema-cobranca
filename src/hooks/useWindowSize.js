import { useState, useEffect, useCallback, useRef } from 'react'
import { BREAKPOINTS } from '../design-system/breakpoints'

/**
 * Hook otimizado para detectar tamanho da janela
 * - Usa debounce de 150ms para evitar reflows excessivos
 * - Leitura inicial apenas uma vez
 * - Cleanup automático
 */
export default function useWindowSize() {
  // Usar função para inicialização lazy (evita leitura no SSR)
  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  }))

  const timeoutRef = useRef(null)

  // Handler com debounce para evitar reflows excessivos
  const handleResize = useCallback(() => {
    // Cancelar timeout anterior se existir
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Debounce de 150ms
    timeoutRef.current = setTimeout(() => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }, 150)
  }, [])

  useEffect(() => {
    window.addEventListener('resize', handleResize, { passive: true })

    return () => {
      window.removeEventListener('resize', handleResize)
      // Limpar timeout pendente
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [handleResize])

  // Breakpoints otimizados para dispositivos reais
  // Mobile: até 640px (cobre maioria dos smartphones)
  // Tablet: 641px - 1024px (tablets e notebooks pequenos)
  // Desktop: acima de 1024px
  const isMobile = windowSize.width <= BREAKPOINTS.mobile
  const isTablet = windowSize.width > BREAKPOINTS.mobile && windowSize.width <= BREAKPOINTS.tablet
  const isLaptop = windowSize.width > BREAKPOINTS.tablet && windowSize.width <= 1280
  const isDesktop = windowSize.width > 1280

  // Helper para telas pequenas (mobile + tablet pequeno)
  const isSmallScreen = windowSize.width <= 768

  return { ...windowSize, isMobile, isTablet, isLaptop, isDesktop, isSmallScreen }
}
