/* Pontos de quebra oficiais do design system.
   Os mesmos valores estão documentados em tokens.css (variável CSS não
   funciona dentro de @media). O hook useWindowSize usa estes números. */

export const BREAKPOINTS = {
  mobile: 640,   // até 640px = celular
  tablet: 1024,  // 641 a 1024px = tablet
}

// Para usar em @media dentro de CSS-in-JS ou matchMedia
export const MEDIA = {
  mobile: `(max-width: ${BREAKPOINTS.mobile}px)`,
  tablet: `(min-width: ${BREAKPOINTS.mobile + 1}px) and (max-width: ${BREAKPOINTS.tablet}px)`,
  desktop: `(min-width: ${BREAKPOINTS.tablet + 1}px)`,
}
