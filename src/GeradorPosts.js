import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { supabase, FUNCTIONS_URL } from './supabaseClient'
import { showToast } from './Toast'
import useWindowSize from './hooks/useWindowSize'
import { useUserPlan } from './hooks/useUserPlan'
import { useUser } from './contexts/UserContext'
import html2canvas from 'html2canvas'

const TIPOS = [
  { key: 'motivacional', label: '🔥 Motivacional', exemplo: 'Frase de impacto pra inspirar' },
  { key: 'dica', label: '💡 Dica', exemplo: '3 dicas para melhorar no treino' },
  { key: 'promocao', label: '🏷️ Promoção', exemplo: 'Matrícula grátis essa semana' },
  { key: 'aula', label: '🏋️ Aula', exemplo: 'Nova turma de pilates às 19h' },
  { key: 'depoimento', label: '⭐ Depoimento', exemplo: 'Aluno que transformou o corpo' }
]

const TONS = [
  { key: 'informal', label: '😎 Informal' },
  { key: 'profissional', label: '👔 Profissional' },
  { key: 'divertido', label: '🤪 Divertido' }
]

const TEMPLATES = [
  { key: 'personal', label: 'Split', desc: 'Painel lateral + foto ao lado' },
  { key: 'lista', label: 'Lista', desc: 'Foto + itens com checkmarks' },
  { key: 'destaque', label: 'Destaque', desc: 'Foto escura + cards' },
  { key: 'classico', label: 'Clássico', desc: 'Overlay escuro + texto branco' },
  { key: 'bold', label: 'Bold', desc: 'Fundo borrado + texto gigante' },
  { key: 'moderno', label: 'Moderno', desc: 'Gradient colorido + texto' },
  { key: 'clean', label: 'Clean', desc: 'Barra inferior sólida' }
]

// Fontes disponíveis pra escolher
const FONTES = [
  { key: 'Montserrat', label: 'Montserrat' },
  { key: 'Inter', label: 'Inter' },
  { key: 'Playfair Display', label: 'Playfair Display' },
  { key: 'Poppins', label: 'Poppins' },
  { key: 'Oswald', label: 'Oswald' },
  { key: 'Bebas Neue', label: 'Bebas Neue' },
  { key: 'Raleway', label: 'Raleway' },
  { key: 'Lato', label: 'Lato' },
  { key: 'Georgia', label: 'Georgia' },
  { key: 'Arial', label: 'Arial' }
]

// Carrega Google Fonts dinamicamente
const fontsLoaded = new Set()
function loadFont(fontName) {
  if (fontsLoaded.has(fontName) || ['Georgia', 'Arial'].includes(fontName)) return
  fontsLoaded.add(fontName)
  const link = document.createElement('link')
  link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@300;400;600;700;800;900&display=swap`
  link.rel = 'stylesheet'
  document.head.appendChild(link)
}

// Pre-carregar as fontes principais
FONTES.forEach(f => loadFont(f.key))

// Helper: gera o background style com posição e zoom da foto
function bgStyle(foto, fotoPos, fotoZoom) {
  return {
    backgroundImage: `url(${foto})`,
    backgroundSize: `${fotoZoom || 120}%`,
    backgroundPosition: `calc(50% + ${fotoPos?.x || 0}px) calc(50% + ${fotoPos?.y || 0}px)`,
    backgroundRepeat: 'no-repeat'
  }
}

// ============================================================
// TEMPLATES HTML/CSS — cada um é um componente React
// ============================================================

function TemplatePersonal({ foto, titulo, extra, cor, logoUrl, fotoPos, fotoZoom }) {
  const destaque = extra.destaque || ''
  const tituloHtml = destaque && titulo.includes(destaque)
    ? titulo.replace(destaque, `<span style="color:${cor};font-style:italic">${destaque}</span>`)
    : titulo

  return (
    <div style={{ width: '1080px', height: '1080px', display: 'flex', fontFamily: 'Inter, Arial, sans-serif', overflow: 'hidden' }}>
      {/* Painel esquerdo branco */}
      <div style={{
        width: '440px', backgroundColor: 'white', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: '0', position: 'relative', flexShrink: 0
      }}>
        {/* Acento colorido topo */}
        <div style={{ height: '6px', backgroundColor: cor, width: '100%' }} />

        {/* Conteúdo */}
        <div style={{ padding: '50px 40px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h1 style={{ fontSize: '44px', fontWeight: '800', color: '#1a1a1a', lineHeight: '1.15', margin: '0 0 30px' }}
            dangerouslySetInnerHTML={{ __html: tituloHtml }} />

          {extra.descricao_cta && (
            <div style={{
              backgroundColor: `${cor}12`, borderLeft: `4px solid ${cor}`,
              borderRadius: '0 10px 10px 0', padding: '16px 20px', marginBottom: '20px'
            }}>
              <p style={{ fontSize: '15px', color: '#555', margin: '0 0 10px', lineHeight: '1.5' }}>
                {extra.descricao_cta}
              </p>
              {extra.cta && (
                <span style={{ fontSize: '18px', fontWeight: '700', color: cor }}>
                  {extra.cta} ❤️
                </span>
              )}
            </div>
          )}
        </div>

        {/* Rodapé com logo */}
        <div style={{
          padding: '20px 40px', backgroundColor: '#f5f5f5',
          display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          {logoUrl && <img src={logoUrl} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} crossOrigin="anonymous" />}
        </div>
      </div>

      {/* Foto direita */}
      <div style={{ flex: 1, ...bgStyle(foto, fotoPos, fotoZoom) }} />
    </div>
  )
}

function TemplateLista({ foto, titulo, extra, cor, logoUrl, fotoPos, fotoZoom, editando, setEditando, textoCustom, setTextoCustom, fonteCustom }) {
  const items = extra.items || []

  // Separar título em 2 partes: primeira light, segunda bold (estilo Playfair)
  const tituloWords = titulo.split(' ')
  const metade = Math.ceil(tituloWords.length / 2)
  const tituloLinha1 = tituloWords.slice(0, metade).join(' ')
  const tituloLinha2 = tituloWords.slice(metade).join(' ')

  // Tags automáticas baseadas nos items (primeira palavra de cada)
  const tags = items.slice(0, 3).map(item => item.split(' ')[0])

  return (
    <div style={{
      width: '1080px', height: '1080px', fontFamily: 'Montserrat, Inter, Arial, sans-serif',
      position: 'relative', overflow: 'hidden', backgroundColor: '#1a1a1a'
    }}>
      {/* Foto de fundo (posição e zoom ajustáveis) */}
      <div style={{ position: 'absolute', inset: 0, ...bgStyle(foto, fotoPos, fotoZoom) }} />
      {/* Gradient lateral por cima */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to right, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.7) 100%)'
      }} />

      {/* Painel overlay à direita */}
      <div style={{
        position: 'absolute', top: '50%', right: 0, transform: 'translateY(-50%)',
        width: '58%', background: 'rgba(20, 20, 20, 0.88)',
        borderRadius: '40px 0 0 40px', padding: '65px 56px 56px 65px',
        backdropFilter: 'blur(6px)', zIndex: 1
      }}>
        {/* Bloco do título */}
        <div style={{ marginBottom: '48px' }}>
          <EditableText campo="tituloLinha1" editando={editando} setEditando={setEditando} textoCustom={textoCustom} setTextoCustom={setTextoCustom} fonteCustom={fonteCustom}
            style={{ fontFamily: 'Montserrat, Inter, sans-serif', fontSize: '36px', fontWeight: '300', color: '#fff', letterSpacing: '0.05em' }}>
            {textoCustom.tituloLinha1 ?? tituloLinha1}
          </EditableText>
          <EditableText campo="tituloLinha2" editando={editando} setEditando={setEditando} textoCustom={textoCustom} setTextoCustom={setTextoCustom} fonteCustom={fonteCustom}
            style={{ fontFamily: 'Georgia, Playfair Display, serif', fontSize: '88px', fontWeight: '700', color: cor, lineHeight: '1' }}>
            {textoCustom.tituloLinha2 ?? tituloLinha2}
          </EditableText>
          {extra.subtitulo && (
            <EditableText campo="subtitulo" editando={editando} setEditando={setEditando} textoCustom={textoCustom} setTextoCustom={setTextoCustom} fonteCustom={fonteCustom}
              style={{ fontSize: '28px', fontWeight: '400', color: '#ddd', marginTop: '10px' }}>
              {textoCustom.subtitulo ?? extra.subtitulo}
            </EditableText>
          )}
        </div>

        {/* Divisor */}
        <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.12)', margin: '0 0 38px' }} />

        {/* Motivos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {items.map((item, i) => {
            const campo = `item-${i}`
            const textoItem = textoCustom[campo] ?? item
            return (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '18px', padding: '20px 28px',
              }}>
                <EditableText campo={campo} editando={editando} setEditando={setEditando} textoCustom={textoCustom} setTextoCustom={setTextoCustom} fonteCustom={fonteCustom}
                  style={{ fontSize: '26px', color: '#ccc', letterSpacing: '0.02em', fontWeight: '400' }}>
                  {textoItem}
                </EditableText>
              </div>
            )
          })}
        </div>

        {/* Handle / logo */}
        <div style={{
          marginTop: '40px', display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center'
        }}>
          {logoUrl && <img src={logoUrl} alt="" style={{ width: '70px', height: '70px', borderRadius: '50%', objectFit: 'cover' }} crossOrigin="anonymous" />}
        </div>
      </div>
    </div>
  )
}

function TemplateDestaque({ foto, titulo, extra, cor, logoUrl, fotoPos, fotoZoom }) {
  const items = extra.items || []

  return (
    <div style={{
      width: '1080px', height: '1080px', fontFamily: 'Inter, Arial, sans-serif',
      ...bgStyle(foto, fotoPos, fotoZoom),
      position: 'relative', overflow: 'hidden'
    }}>
      {/* Overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.85) 100%)'
      }} />

      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', boxSizing: 'border-box', textAlign: 'center' }}>
        {logoUrl && <img src={logoUrl} alt="" style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', marginBottom: '24px', border: '3px solid rgba(255,255,255,0.3)' }} crossOrigin="anonymous" />}

        <h1 style={{ fontSize: '56px', fontWeight: '900', color: 'white', margin: '0 0 10px', lineHeight: '1.1' }}>
          {titulo}
        </h1>

        {extra.subtitulo && (
          <p style={{ fontSize: '24px', color: cor, fontWeight: '600', margin: '0 0 50px' }}>
            {extra.subtitulo}
          </p>
        )}

        {/* Cards em row */}
        {items.length >= 3 ? (
          <div style={{ display: 'flex', gap: '16px', width: '100%' }}>
            {items.slice(0, 3).map((item, i) => {
              const isCenter = i === 1
              return (
                <div key={i} style={{
                  flex: 1, padding: '30px 20px', borderRadius: '16px', textAlign: 'center',
                  backgroundColor: isCenter ? cor : 'rgba(0,0,0,0.5)',
                  border: isCenter ? 'none' : '1px solid rgba(255,255,255,0.12)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  minHeight: '180px'
                }}>
                  <p style={{ color: 'white', fontSize: '20px', fontWeight: isCenter ? '700' : '500', margin: 0, lineHeight: '1.4' }}>
                    {item}
                  </p>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
            {items.map((item, i) => (
              <div key={i} style={{
                padding: '18px 24px', backgroundColor: 'rgba(0,0,0,0.5)',
                borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)'
              }}>
                <span style={{ color: 'white', fontSize: '20px' }}>{item}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateClassico({ foto, titulo, cor, logoUrl, fotoPos, fotoZoom }) {
  return (
    <div style={{
      width: '1080px', height: '1080px', fontFamily: 'Inter, Arial, sans-serif',
      ...bgStyle(foto, fotoPos, fotoZoom),
      position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 20%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.9) 100%)' }} />

      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '60px', boxSizing: 'border-box', textAlign: 'center' }}>
        {/* Linha decorativa */}
        <div style={{ width: '80px', height: '4px', backgroundColor: cor, margin: '0 auto 24px', borderRadius: '2px' }} />

        <h1 style={{ fontSize: '54px', fontWeight: '800', color: 'white', margin: '0 0 24px', lineHeight: '1.15', textShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          {titulo}
        </h1>

        {/* Linha decorativa */}
        <div style={{ width: '80px', height: '4px', backgroundColor: cor, margin: '0 auto 30px', borderRadius: '2px' }} />

        {/* Logo */}
        {logoUrl && <img src={logoUrl} alt="" style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto', border: '2px solid rgba(255,255,255,0.5)' }} crossOrigin="anonymous" />}
      </div>
    </div>
  )
}

function TemplateBold({ foto, titulo, cor, fotoPos, fotoZoom }) {
  return (
    <div style={{
      width: '1080px', height: '1080px', fontFamily: 'Inter, Arial, sans-serif',
      ...bgStyle(foto, fotoPos, fotoZoom),
      position: 'relative', overflow: 'hidden', filter: 'blur(0px)'
    }}>
      {/* Foto borrada de fundo */}
      <div style={{
        position: 'absolute', inset: '-50px',
        ...bgStyle(foto, fotoPos, fotoZoom),
        filter: 'blur(20px) brightness(0.35)'
      }} />

      {/* Moldura decorativa */}
      <div style={{
        position: 'absolute', inset: '40px',
        border: '2px solid rgba(255,255,255,0.2)', borderRadius: '4px',
        zIndex: 1
      }}>
        {/* Cantos coloridos */}
        <div style={{ position: 'absolute', top: '-2px', left: '-2px', width: '40px', height: '4px', backgroundColor: cor }} />
        <div style={{ position: 'absolute', top: '-2px', left: '-2px', width: '4px', height: '40px', backgroundColor: cor }} />
        <div style={{ position: 'absolute', top: '-2px', right: '-2px', width: '40px', height: '4px', backgroundColor: cor }} />
        <div style={{ position: 'absolute', top: '-2px', right: '-2px', width: '4px', height: '40px', backgroundColor: cor }} />
        <div style={{ position: 'absolute', bottom: '-2px', left: '-2px', width: '40px', height: '4px', backgroundColor: cor }} />
        <div style={{ position: 'absolute', bottom: '-2px', left: '-2px', width: '4px', height: '40px', backgroundColor: cor }} />
        <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '40px', height: '4px', backgroundColor: cor }} />
        <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '4px', height: '40px', backgroundColor: cor }} />
      </div>

      {/* Texto central */}
      <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '100px', boxSizing: 'border-box', textAlign: 'center' }}>
        <h1 style={{ fontSize: '68px', fontWeight: '900', color: 'white', margin: 0, lineHeight: '1.15', textShadow: '0 6px 30px rgba(0,0,0,0.8)', letterSpacing: '-1px' }}>
          {titulo}
        </h1>
      </div>
    </div>
  )
}

function TemplateModerno({ foto, titulo, cor, logoUrl, fotoPos, fotoZoom }) {
  return (
    <div style={{
      width: '1080px', height: '1080px', fontFamily: 'Inter, Arial, sans-serif',
      ...bgStyle(foto, fotoPos, fotoZoom),
      position: 'relative', overflow: 'hidden'
    }}>
      {/* Barra lateral colorida */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: '14px', height: '100%', backgroundColor: cor, zIndex: 2 }} />

      {/* Gradient inferior */}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(0,0,0,0) 30%, ${cor}cc 80%, ${cor}ee 100%)` }} />

      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '60px 60px 60px 50px', boxSizing: 'border-box' }}>
        <h1 style={{ fontSize: '52px', fontWeight: '800', color: 'white', margin: '0 0 20px', lineHeight: '1.15', textShadow: '0 2px 12px rgba(0,0,0,0.4)', maxWidth: '700px' }}>
          {titulo}
        </h1>

        {logoUrl && <img src={logoUrl} alt="" style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.5)' }} crossOrigin="anonymous" />}
      </div>

      {/* Acento no canto superior direito */}
      <div style={{ position: 'absolute', top: 0, right: 0, width: '120px', height: '6px', backgroundColor: cor, zIndex: 2 }} />
    </div>
  )
}

function TemplateClean({ foto, titulo, cor, logoUrl, fotoPos, fotoZoom }) {
  return (
    <div style={{
      width: '1080px', height: '1080px', fontFamily: 'Inter, Arial, sans-serif',
      ...bgStyle(foto, fotoPos, fotoZoom),
      position: 'relative', overflow: 'hidden'
    }}>
      {/* Leve escurecimento na foto */}
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.1)' }} />

      {/* Barra inferior sólida */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '35%', backgroundColor: cor, opacity: 0.95 }} />

      {/* Linha separadora */}
      <div style={{ position: 'absolute', bottom: '35%', left: '60px', right: '60px', height: '2px', backgroundColor: 'rgba(255,255,255,0.3)' }} />

      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '60px', boxSizing: 'border-box' }}>
        <h1 style={{ fontSize: '48px', fontWeight: '800', color: 'white', margin: '0 0 20px', lineHeight: '1.2', maxWidth: '700px' }}>
          {titulo}
        </h1>

        {logoUrl && <img src={logoUrl} alt="" style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.5)' }} crossOrigin="anonymous" />}
      </div>
    </div>
  )
}

// Texto editável — clica pra editar, mostra borda quando hover
function EditableText({ campo, children, style, editando, setEditando, textoCustom, setTextoCustom, fonteCustom }) {
  const isEditing = editando === campo
  const customFont = fonteCustom[campo] || {}
  const overrideStyle = {}
  if (customFont.size) overrideStyle.fontSize = `${customFont.size}px`
  if (customFont.weight) overrideStyle.fontWeight = customFont.weight
  if (customFont.italic) overrideStyle.fontStyle = 'italic'
  if (customFont.family) overrideStyle.fontFamily = `'${customFont.family}', sans-serif`

  if (isEditing) {
    return (
      <input
        autoFocus
        value={textoCustom[campo] ?? (typeof children === 'string' ? children : '')}
        onChange={e => setTextoCustom(prev => ({ ...prev, [campo]: e.target.value }))}
        onKeyDown={e => { if (e.key === 'Enter') setEditando(null); if (e.key === 'Escape') setEditando(null) }}
        style={{
          ...style, ...overrideStyle,
          background: 'rgba(255,255,255,0.15)',
          border: '2px solid rgba(255,255,255,0.5)',
          borderRadius: '6px',
          outline: 'none',
          padding: '4px 8px',
          width: '100%',
          boxSizing: 'border-box',
          display: 'block'
        }}
      />
    )
  }

  return (
    <div
      onClick={e => { e.stopPropagation(); setEditando(campo) }}
      style={{
        ...style, ...overrideStyle,
        cursor: 'text',
        borderRadius: '4px',
        transition: 'outline 0.15s',
        outline: '2px solid transparent'
      }}
      onMouseEnter={e => e.currentTarget.style.outline = '2px dashed rgba(255,255,255,0.4)'}
      onMouseLeave={e => e.currentTarget.style.outline = '2px solid transparent'}
    >
      {textoCustom[campo] ?? children}
    </div>
  )
}

// Seletor de template pra render
function TemplateRenderer({ template, foto, titulo, extra, cor, logoUrl, fotoPos, fotoZoom, editando, setEditando, textoCustom, setTextoCustom, fonteCustom }) {
  const editProps = { editando, setEditando, textoCustom, setTextoCustom, fonteCustom }
  const props = { foto, titulo, extra, cor, logoUrl, fotoPos: fotoPos || { x: 0, y: 0 }, fotoZoom: fotoZoom || 120, ...editProps }
  switch (template) {
    case 'personal': return <TemplatePersonal {...props} />
    case 'lista': return <TemplateLista {...props} />
    case 'destaque': return <TemplateDestaque {...props} />
    case 'bold': return <TemplateBold {...props} />
    case 'moderno': return <TemplateModerno {...props} />
    case 'clean': return <TemplateClean {...props} />
    default: return <TemplateClassico {...props} />
  }
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function GeradorPosts() {
  const { isMobile, isSmallScreen } = useWindowSize()
  const { plano, isLocked } = useUserPlan()
  const { userId } = useUser()
  const artRef = useRef(null)

  const [tipo, setTipo] = useState('motivacional')
  const [tom, setTom] = useState('informal')
  const [template, setTemplate] = useState('personal')
  const [prompt, setPrompt] = useState('')
  const [fotoPreview, setFotoPreview] = useState(null)
  const [gerando, setGerando] = useState(false)
  const [baixando, setBaixando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [logoUrl, setLogoUrl] = useState(null)
  const [corMarca, setCorMarca] = useState('#344848')
  const [copiado, setCopiado] = useState(null)
  const [editando, setEditando] = useState(null) // 'titulo' | 'subtitulo' | 'item-0' | 'cta' | null
  const [textoCustom, setTextoCustom] = useState({}) // { titulo: 'override', subtitulo: '...', 'item-0': '...' }
  const [fonteCustom, setFonteCustom] = useState({}) // { titulo: { size: 88, weight: '700', italic: false } }

  // Drag/zoom da foto
  const [fotoPos, setFotoPos] = useState({ x: 0, y: 0 })
  const [fotoZoom, setFotoZoom] = useState(120)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 })

  // Carregar cor da marca + logo
  useEffect(() => {
    if (!userId) return
    supabase.from('usuarios')
      .select('logo_url, landing_cor_primaria')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data?.landing_cor_primaria) setCorMarca(data.landing_cor_primaria)
        if (data?.logo_url) setLogoUrl(data.logo_url)
      })
  }, [userId])

  // Handlers de drag pra reposicionar foto
  const handleDragStart = (e) => {
    e.preventDefault()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    dragStart.current = { x: clientX, y: clientY, posX: fotoPos.x, posY: fotoPos.y }
    setDragging(true)
  }

  const handleDragMove = (e) => {
    if (!dragging) return
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    // Escala: preview é 480px mas template é 1080px (2.25x)
    const scale = 1080 / 480
    const dx = (clientX - dragStart.current.x) * scale
    const dy = (clientY - dragStart.current.y) * scale
    setFotoPos({ x: dragStart.current.posX + dx, y: dragStart.current.posY + dy })
  }

  const handleDragEnd = () => setDragging(false)

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleDragMove)
      window.addEventListener('mouseup', handleDragEnd)
      window.addEventListener('touchmove', handleDragMove)
      window.addEventListener('touchend', handleDragEnd)
      return () => {
        window.removeEventListener('mousemove', handleDragMove)
        window.removeEventListener('mouseup', handleDragEnd)
        window.removeEventListener('touchmove', handleDragMove)
        window.removeEventListener('touchend', handleDragEnd)
      }
    }
  })

  // Reset posição quando troca foto
  const resetFoto = () => { setFotoPos({ x: 0, y: 0 }); setFotoZoom(120) }

  // Upload de foto
  const handleFoto = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { showToast('Selecione uma imagem', 'warning'); return }
    if (file.size > 5 * 1024 * 1024) { showToast('Máximo 5MB', 'warning'); return }
    const url = URL.createObjectURL(file)
    setFotoPreview(url)
    resetFoto()
  }

  // Gerar post via edge function
  const gerarPost = async () => {
    if (!prompt.trim()) { showToast('Digite o que quer comunicar', 'warning'); return }
    if (!fotoPreview) { showToast('Suba uma foto primeiro', 'warning'); return }

    setGerando(true)
    setResultado(null)
    setTextoCustom({})
    setFonteCustom({})
    setEditando(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${FUNCTIONS_URL}/gerar-post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ tipo, tom, template, prompt: prompt.trim() })
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao gerar post')
      setResultado(json)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setGerando(false)
    }
  }

  // Download via html2canvas
  const baixarImagem = async () => {
    if (!artRef.current) return
    setBaixando(true)
    try {
      const canvas = await html2canvas(artRef.current, {
        scale: 1,
        useCORS: true,
        allowTaint: true,
        width: 1080,
        height: 1080,
        backgroundColor: null
      })
      const link = document.createElement('a')
      link.download = `post-${tipo}-${Date.now()}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      showToast('Imagem baixada!', 'success')
    } catch (err) {
      showToast('Erro ao gerar imagem: ' + err.message, 'error')
    } finally {
      setBaixando(false)
    }
  }

  // Copiar texto
  const copiar = (modo) => {
    if (!resultado) return
    const texto = modo === 'legenda' ? resultado.legenda : `${resultado.legenda}\n\n${resultado.hashtags}`
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(modo)
      showToast(modo === 'legenda' ? 'Legenda copiada!' : 'Legenda + hashtags copiadas!', 'success')
      setTimeout(() => setCopiado(null), 2000)
    })
  }

  // Gate de plano
  if (isLocked('pro')) {
    return (
      <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '60px 40px', textAlign: 'center', border: '1px solid #e5e7eb', maxWidth: '500px', margin: '40px auto' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
          <Icon icon="mdi:auto-fix" width="32" style={{ color: '#3b82f6' }} />
        </div>
        <h2 style={{ margin: '0 0 12px', fontSize: '22px', fontWeight: '600', color: '#1a1a1a' }}>Gerador de Post IA</h2>
        <p style={{ margin: '0 0 24px', fontSize: '15px', color: '#666', lineHeight: '1.6' }}>
          Crie artes profissionais pro Instagram em 10 segundos. Disponível a partir do plano <strong>Pro</strong>.
        </p>
        <button onClick={() => window.location.href = '/app/configuracao?aba=upgrade'}
          style={{ padding: '12px 32px', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>
          Fazer Upgrade
        </button>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, padding: isSmallScreen ? '16px' : '25px 30px', backgroundColor: '#ffffff', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: isSmallScreen ? '16px' : '18px', fontWeight: '600', color: '#344848' }}>Gerador de Post IA</h2>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#888' }}>
          Crie artes e legendas pro Instagram com inteligência artificial
          {resultado?.uso && (
            <span style={{
              marginLeft: '10px', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
              backgroundColor: resultado.uso.usado >= resultado.uso.limite ? '#fef2f2' : '#f0fdf4',
              color: resultado.uso.usado >= resultado.uso.limite ? '#dc2626' : '#16a34a'
            }}>
              {resultado.uso.usado}/{resultado.uso.limite} este mês
            </span>
          )}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '24px', flexDirection: isSmallScreen ? 'column' : 'row' }}>
        {/* Coluna esquerda — Configuração */}
        <div style={{ flex: '0 0 360px', minWidth: 0, ...(isSmallScreen ? { flex: '1' } : {}) }}>
          {/* Tipo */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>Estilo do post</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {TIPOS.map(t => (
                <button key={t.key} onClick={() => setTipo(t.key)}
                  style={{
                    padding: '6px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '600',
                    border: tipo === t.key ? '2px solid #344848' : '1px solid #e5e7eb',
                    backgroundColor: tipo === t.key ? '#344848' : 'white',
                    color: tipo === t.key ? 'white' : '#555', cursor: 'pointer'
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Foto */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>Foto</label>
            {fotoPreview ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img src={fotoPreview} alt="Preview" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px' }} />
                <button onClick={() => setFotoPreview(null)}
                  style={{ padding: '6px 10px', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                  Trocar
                </button>
              </div>
            ) : (
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '20px', border: '2px dashed #d1d5db', borderRadius: '10px',
                cursor: 'pointer', color: '#888', fontSize: '13px', fontWeight: '500'
              }}>
                <Icon icon="mdi:image-plus" width="22" /> Enviar foto
                <input type="file" accept="image/*" onChange={handleFoto} style={{ display: 'none' }} />
              </label>
            )}
          </div>

          {/* Prompt */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>O que quer comunicar?</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={2}
              placeholder={TIPOS.find(t => t.key === tipo)?.exemplo || 'Descreva o post...'}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          {/* Template visual */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>Template</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {TEMPLATES.map(t => (
                <button key={t.key} onClick={() => setTemplate(t.key)}
                  style={{
                    padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '600',
                    border: template === t.key ? '2px solid #344848' : '1px solid #e5e7eb',
                    backgroundColor: template === t.key ? '#344848' : 'white',
                    color: template === t.key ? 'white' : '#555', cursor: 'pointer'
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
              {TEMPLATES.find(t => t.key === template)?.desc}
            </div>
          </div>

          {/* Tom */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>Tom da legenda</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {TONS.map(t => (
                <button key={t.key} onClick={() => setTom(t.key)}
                  style={{
                    padding: '6px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: '600',
                    border: tom === t.key ? '2px solid #344848' : '1px solid #e5e7eb',
                    backgroundColor: tom === t.key ? '#344848' : 'white',
                    color: tom === t.key ? 'white' : '#555', cursor: 'pointer'
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Botão Gerar */}
          <button
            onClick={gerarPost}
            disabled={gerando || !prompt.trim() || !fotoPreview}
            style={{
              width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
              backgroundColor: gerando ? '#d1d5db' : '#344848', color: 'white',
              fontSize: '14px', fontWeight: '700', cursor: gerando ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
            }}
          >
            {gerando ? <><Icon icon="eos-icons:loading" width="18" /> Gerando...</> : <><Icon icon="mdi:auto-fix" width="18" /> Gerar Post</>}
          </button>
        </div>

        {/* Coluna direita — Resultado */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {resultado ? (
            <>
              {/* Preview da arte (HTML renderizado) */}
              <div
                onMouseDown={handleDragStart}
                onTouchStart={handleDragStart}
                style={{
                  borderRadius: '12px', overflow: 'hidden', border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.08)', marginBottom: '8px',
                  width: '480px', height: '480px', position: 'relative',
                  cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none'
                }}
              >
                <div style={{ transform: 'scale(0.4444)', transformOrigin: 'top left', width: '1080px', height: '1080px', position: 'absolute', top: 0, left: 0 }}>
                  <div ref={artRef}>
                    <TemplateRenderer
                      template={template}
                      foto={fotoPreview}
                      titulo={resultado.titulo}
                      extra={resultado}
                      cor={corMarca}
                      logoUrl={logoUrl}
                      fotoPos={fotoPos}
                      fotoZoom={fotoZoom}
                      editando={editando}
                      setEditando={setEditando}
                      textoCustom={textoCustom}
                      setTextoCustom={setTextoCustom}
                      fonteCustom={fonteCustom}
                    />
                  </div>
                </div>
              </div>

              {/* Zoom da foto */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', maxWidth: '480px' }}>
                <Icon icon="mdi:magnify-minus" width="18" style={{ color: '#888', flexShrink: 0 }} />
                <input
                  type="range"
                  min="100"
                  max="250"
                  value={fotoZoom}
                  onChange={e => setFotoZoom(Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#344848' }}
                />
                <Icon icon="mdi:magnify-plus" width="18" style={{ color: '#888', flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: '#999', minWidth: '36px' }}>{fotoZoom}%</span>
              </div>

              {/* Controles de fonte (quando editando texto) */}
              {editando && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', maxWidth: '480px',
                  padding: '10px 14px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb', flexWrap: 'wrap'
                }}>
                  {/* Família da fonte */}
                  <select
                    value={fonteCustom[editando]?.family || ''}
                    onChange={e => {
                      const family = e.target.value
                      if (family) loadFont(family)
                      setFonteCustom(prev => ({
                        ...prev,
                        [editando]: { ...prev[editando], family: family || undefined }
                      }))
                    }}
                    style={{
                      padding: '4px 8px', borderRadius: '6px', border: '1px solid #d1d5db',
                      fontSize: '12px', backgroundColor: 'white', cursor: 'pointer',
                      fontFamily: fonteCustom[editando]?.family || 'inherit'
                    }}
                  >
                    <option value="">Padrão</option>
                    {FONTES.map(f => (
                      <option key={f.key} value={f.key} style={{ fontFamily: f.key }}>{f.label}</option>
                    ))}
                  </select>

                  {/* Tamanho */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: '#999' }}>Aa</span>
                    <input
                      type="range"
                      min="16"
                      max="120"
                      value={fonteCustom[editando]?.size || 36}
                      onChange={e => setFonteCustom(prev => ({
                        ...prev,
                        [editando]: { ...prev[editando], size: Number(e.target.value) }
                      }))}
                      style={{ width: '80px', accentColor: '#344848' }}
                    />
                    <span style={{ fontSize: '11px', color: '#999', minWidth: '28px' }}>{fonteCustom[editando]?.size || 36}px</span>
                  </div>

                  {/* Bold */}
                  <button
                    onClick={() => setFonteCustom(prev => ({
                      ...prev,
                      [editando]: { ...prev[editando], weight: prev[editando]?.weight === '700' ? '400' : '700' }
                    }))}
                    style={{
                      width: '30px', height: '30px', borderRadius: '6px', border: '1px solid #d1d5db', cursor: 'pointer',
                      backgroundColor: fonteCustom[editando]?.weight === '700' ? '#344848' : 'white',
                      color: fonteCustom[editando]?.weight === '700' ? 'white' : '#555',
                      fontWeight: '800', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                    B
                  </button>

                  {/* Italic */}
                  <button
                    onClick={() => setFonteCustom(prev => ({
                      ...prev,
                      [editando]: { ...prev[editando], italic: !prev[editando]?.italic }
                    }))}
                    style={{
                      width: '30px', height: '30px', borderRadius: '6px', border: '1px solid #d1d5db', cursor: 'pointer',
                      backgroundColor: fonteCustom[editando]?.italic ? '#344848' : 'white',
                      color: fonteCustom[editando]?.italic ? 'white' : '#555',
                      fontStyle: 'italic', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                    I
                  </button>

                  {/* Label do campo editando */}
                  <span style={{ fontSize: '10px', color: '#bbb', marginLeft: 'auto' }}>
                    editando: {editando}
                  </span>
                </div>
              )}

              {/* Botões da arte */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', maxWidth: '480px' }}>
                <button onClick={baixarImagem} disabled={baixando}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                    backgroundColor: baixando ? '#d1d5db' : '#344848', color: 'white', fontSize: '13px', fontWeight: '600',
                    cursor: baixando ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}>
                  {baixando ? <><Icon icon="eos-icons:loading" width="16" /> Gerando PNG...</> : <><Icon icon="mdi:download" width="18" /> Baixar imagem</>}
                </button>
                <button onClick={gerarPost} disabled={gerando}
                  style={{
                    padding: '10px 14px', borderRadius: '8px', border: '1px solid #d1d5db',
                    backgroundColor: 'white', color: '#555', fontSize: '13px', fontWeight: '600',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                  }}>
                  <Icon icon="mdi:refresh" width="18" /> Outro
                </button>
              </div>

              {/* Legenda */}
              <div style={{ padding: '14px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', marginBottom: '10px', maxWidth: '480px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '6px' }}>📝 Legenda</div>
                <p style={{ margin: '0 0 10px', fontSize: '14px', color: '#1a1a1a', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{resultado.legenda}</p>
                <p style={{ margin: 0, fontSize: '12px', color: '#3b82f6', wordBreak: 'break-all' }}>{resultado.hashtags}</p>
              </div>

              {/* Copiar */}
              <div style={{ display: 'flex', gap: '8px', maxWidth: '480px' }}>
                <button onClick={() => copiar('legenda')}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: copiado === 'legenda' ? '#f0fdf4' : 'white', color: copiado === 'legenda' ? '#16a34a' : '#555', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <Icon icon={copiado === 'legenda' ? 'mdi:check' : 'mdi:content-copy'} width="14" />
                  {copiado === 'legenda' ? 'Copiada!' : 'Copiar legenda'}
                </button>
                <button onClick={() => copiar('tudo')}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: copiado === 'tudo' ? '#f0fdf4' : 'white', color: copiado === 'tudo' ? '#16a34a' : '#555', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <Icon icon={copiado === 'tudo' ? 'mdi:check' : 'mdi:content-copy'} width="14" />
                  {copiado === 'tudo' ? 'Copiado!' : 'Copiar tudo'}
                </button>
              </div>
            </>
          ) : (
            <div style={{
              textAlign: 'center', padding: '60px 20px', backgroundColor: '#f9fafb',
              borderRadius: '12px', border: '1px dashed #d1d5db'
            }}>
              <Icon icon="mdi:image-edit-outline" width="56" style={{ color: '#d1d5db' }} />
              <p style={{ margin: '12px 0 0', fontSize: '15px', color: '#999' }}>Sua arte vai aparecer aqui</p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#bbb' }}>Suba uma foto, descreva o post e clique "Gerar"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
