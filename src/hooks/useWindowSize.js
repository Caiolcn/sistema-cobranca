import { useState, useEffect } from 'react'

export default function useWindowSize() {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800
  })

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Breakpoints otimizados para dispositivos reais
  // Mobile: até 640px (cobre maioria dos smartphones)
  // Tablet: 641px - 1024px (tablets e notebooks pequenos)
  // Desktop: acima de 1024px
  const isMobile = windowSize.width <= 640
  const isTablet = windowSize.width > 640 && windowSize.width <= 1024
  const isLaptop = windowSize.width > 1024 && windowSize.width <= 1280
  const isDesktop = windowSize.width > 1280

  // Helper para telas pequenas (mobile + tablet pequeno)
  const isSmallScreen = windowSize.width <= 768

  return { ...windowSize, isMobile, isTablet, isLaptop, isDesktop, isSmallScreen }
}
