// Fontes disponíveis para o site (landing). Cada fonte tem o nome de exibição,
// a pilha CSS (stack) e o parâmetro do Google Fonts para carregamento sob demanda.

export const SITE_FONTS = [
  { id: 'inter',      label: 'Inter',            stack: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", google: 'Inter:wght@400;500;600;700;800;900' },
  { id: 'poppins',    label: 'Poppins',          stack: "'Poppins', sans-serif",                                   google: 'Poppins:wght@400;500;600;700;800' },
  { id: 'montserrat', label: 'Montserrat',       stack: "'Montserrat', sans-serif",                                google: 'Montserrat:wght@400;500;600;700;800' },
  { id: 'roboto',     label: 'Roboto',           stack: "'Roboto', sans-serif",                                    google: 'Roboto:wght@400;500;700;900' },
  { id: 'nunito',     label: 'Nunito',           stack: "'Nunito', sans-serif",                                    google: 'Nunito:wght@400;600;700;800;900' },
  { id: 'playfair',   label: 'Playfair Display', stack: "'Playfair Display', serif",                               google: 'Playfair+Display:wght@400;500;600;700;800' }
]

export const DEFAULT_FONT_ID = 'inter'

export const getSiteFont = (id) =>
  SITE_FONTS.find(f => f.id === id) || SITE_FONTS[0]
