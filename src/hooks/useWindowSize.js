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

  const isMobile = windowSize.width <= 480
  const isTablet = windowSize.width > 480 && windowSize.width <= 768
  const isLaptop = windowSize.width > 768 && windowSize.width <= 1024
  const isDesktop = windowSize.width > 1024

  return { ...windowSize, isMobile, isTablet, isLaptop, isDesktop }
}
