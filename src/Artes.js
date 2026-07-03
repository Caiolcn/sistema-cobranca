import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from './supabaseClient'
import SearchInput from './design-system/components/SearchInput'

// Galeria de artes (templates do Canva). Catálogo compartilhado — tabela public.artes_canva.
// Hierarquia: MENU (nível 1, ex.: "Datas comemorativas", "Avisos") -> CATEGORIA (nível 2, ex.: "Natal")
//             -> artes. Navegação em drill-down por estado (sem rota).
// Clicar num card abre o link /view do Canva em nova aba (a Canva oferece "Usar modelo" -> cópia).
// Cadastro/edição das artes é feito direto no Supabase (SQL) — sem deploy a cada arte nova.

// Paleta de fallback para cards sem thumbnail (gradiente por índice).
const GRADIENTES = [
  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
  'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
]

const CARD_W = 200
const HERO_GRADIENTE = 'linear-gradient(115deg, #17c1d6 0%, #3f6bd6 42%, #7b34ec 100%)'

// Agrupa uma lista de artes por uma chave, preservando ordem de aparição (já vem por `ordem`).
function agrupar(lista, chave) {
  const grupos = []
  const mapa = new Map()
  for (const arte of lista) {
    const k = arte[chave] || 'Outros'
    if (!mapa.has(k)) {
      const g = { titulo: k, itens: [] }
      mapa.set(k, g)
      grupos.push(g)
    }
    mapa.get(k).itens.push(arte)
  }
  return grupos
}

// Badge do Canva (círculo com gradiente + "C"), imitando a logo — sem asset externo.
function CanvaBadge() {
  return (
    <div style={{
      width: '52px', height: '52px', borderRadius: '50%',
      background: 'linear-gradient(135deg, #00c4cc 0%, #7d2ae8 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
    }}>
      <span style={{ color: 'white', fontSize: '30px', fontWeight: '700', lineHeight: 1, fontFamily: 'Georgia, serif' }}>C</span>
    </div>
  )
}

function ArteCard({ arte, indice, onAbrir }) {
  return (
    <div
      onClick={() => onAbrir(arte.canva_url)}
      style={{
        borderRadius: '12px', overflow: 'hidden', cursor: 'pointer',
        border: '1px solid #e5e7eb', backgroundColor: 'white', transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.12)'
        e.currentTarget.style.borderColor = '#d1d5db'
        const ov = e.currentTarget.querySelector('[data-overlay]'); if (ov) ov.style.opacity = '1'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.borderColor = '#e5e7eb'
        const ov = e.currentTarget.querySelector('[data-overlay]'); if (ov) ov.style.opacity = '0'
      }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 5', backgroundColor: '#f3f4f6' }}>
        {arte.thumbnail_url ? (
          <img src={arte.thumbnail_url} alt={arte.titulo} loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{
            width: '100%', height: '100%', background: GRADIENTES[indice % GRADIENTES.length],
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', textAlign: 'center',
          }}>
            <span style={{ color: 'white', fontSize: '15px', fontWeight: '700', textShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>
              {arte.titulo}
            </span>
          </div>
        )}
        <div data-overlay style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '10px',
          background: 'linear-gradient(180deg, rgba(124,42,232,0.72) 0%, rgba(124,42,232,0.88) 100%)',
          opacity: 0, transition: 'opacity 0.2s',
        }}>
          <CanvaBadge />
          <div style={{ textAlign: 'center', color: 'white', lineHeight: 1.15, padding: '0 10px' }}>
            <div style={{ fontSize: '14px', fontWeight: '600' }}>Editar no</div>
            <div style={{ fontSize: '22px', fontWeight: '700', fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>Canva</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Fileira genérica (título + "Ver tudo" + strip horizontal). Usada nos níveis 1 (menus) e 2 (categorias).
function FileiraRow({ grupo, onAbrirCanva, onVerTudo }) {
  const scrollRef = useRef(null)
  const rolar = () => {
    if (scrollRef.current) scrollRef.current.scrollBy({ left: (CARD_W + 16) * 3, behavior: 'smooth' })
  }
  return (
    <div style={{ marginBottom: '36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div onClick={() => onVerTudo(grupo.titulo)}
          style={{ fontSize: '18px', fontWeight: '700', color: '#111', cursor: 'pointer' }}>
          {grupo.titulo}
        </div>
        <button onClick={() => onVerTudo(grupo.titulo)}
          style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: '13px', fontWeight: '600', cursor: 'pointer', padding: '4px 8px' }}>
          Ver tudo
        </button>
      </div>
      <div style={{ position: 'relative' }}>
        <div ref={scrollRef} className="artes-strip"
          style={{ display: 'flex', gap: '16px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '4px' }}>
          {grupo.itens.map((arte, i) => (
            <div key={arte.id} style={{ flex: `0 0 ${CARD_W}px`, width: `${CARD_W}px` }}>
              <ArteCard arte={arte} indice={i} onAbrir={onAbrirCanva} />
            </div>
          ))}
        </div>
        {grupo.itens.length > 4 && (
          <div aria-hidden="true" style={{
            position: 'absolute', top: 0, bottom: 0, right: 0, width: '110px',
            background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, #ffffff 72%)',
            pointerEvents: 'none',
          }} />
        )}
        {grupo.itens.length > 4 && (
          <button onClick={rolar} aria-label="Ver mais" style={{
            position: 'absolute', right: '-6px', top: '50%', transform: 'translateY(-50%)',
            width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'white',
            border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#374151',
          }}>
            <Icon icon="fluent:chevron-right-20-filled" width="20" height="20" />
          </button>
        )}
      </div>
    </div>
  )
}

// Hero. 'principal' = centralizado; 'detalhe' = nome à esquerda + busca à direita.
function Hero({ variant, titulo, busca, setBusca }) {
  if (variant === 'detalhe') {
    return (
      <div style={{ background: HERO_GRADIENTE, borderRadius: '20px', padding: '36px 28px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, color: 'white', fontSize: '26px', fontWeight: '700' }}>{titulo}</h1>
          <div style={{ flex: '1 1 320px', maxWidth: '520px' }}>
            <SearchInput value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar conteúdo" size="lg" />
          </div>
        </div>
      </div>
    )
  }
  return (
    <div style={{ background: HERO_GRADIENTE, borderRadius: '20px', padding: '48px 24px', marginBottom: '32px', textAlign: 'center' }}>
      <h1 style={{ margin: 0, color: 'white', fontSize: '28px', fontWeight: '700' }}>O que você vai criar hoje?</h1>
      <div style={{ maxWidth: '720px', margin: '24px auto 0' }}>
        <SearchInput value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar conteúdo" size="lg" />
      </div>
      <div style={{ marginTop: '16px', color: 'rgba(255,255,255,0.9)', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
        Impulsionado pelo
        <span style={{ fontStyle: 'italic', fontWeight: '700', fontFamily: 'Georgia, serif', fontSize: '18px' }}>Canva</span>
      </div>
    </div>
  )
}

function VoltarBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none',
      border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer',
      color: '#374151', fontSize: '13px', fontWeight: '600', marginBottom: '24px',
    }}>
      <Icon icon="fluent:chevron-left-20-filled" width="18" height="18" />
      Voltar
    </button>
  )
}

function Vazio({ texto, sub }) {
  return (
    <div style={{ padding: '60px 20px', textAlign: 'center', color: '#6b7280' }}>
      <Icon icon="fluent:image-multiple-20-regular" width="48" height="48" style={{ color: '#d1d5db' }} />
      <div style={{ marginTop: '12px', fontSize: '15px', fontWeight: '600', color: '#374151' }}>{texto}</div>
      {sub && <div style={{ marginTop: '4px', fontSize: '13px' }}>{sub}</div>}
    </div>
  )
}

export default function Artes() {
  const [artes, setArtes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [menuSel, setMenuSel] = useState(null) // nível 1 escolhido
  const [catSel, setCatSel] = useState(null)   // nível 2 escolhido

  useEffect(() => {
    let ativo = true
    ;(async () => {
      const { data, error } = await supabase
        .from('artes_canva')
        .select('id, menu, categoria, titulo, thumbnail_url, canva_url, ordem')
        .eq('ativo', true)
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: true })
      if (!ativo) return
      if (error) { console.error('Erro ao carregar artes:', error); setArtes([]) }
      else setArtes(data || [])
      setCarregando(false)
    })()
    return () => { ativo = false }
  }, [])

  const abrirCanva = (url) => { if (url) window.open(url, '_blank', 'noopener,noreferrer') }

  const abrirMenu = (nome) => { setBusca(''); setMenuSel(nome); setCatSel(null) }
  const abrirCategoria = (nome) => { setBusca(''); setCatSel(nome) }
  const voltarNivel1 = () => { setBusca(''); setMenuSel(null); setCatSel(null) }
  const voltarNivel2 = () => { setBusca(''); setCatSel(null) }

  const termo = busca.trim().toLowerCase()
  const style = { width: '100%', boxSizing: 'border-box' }
  const scrollbarCss = `.artes-strip::-webkit-scrollbar{display:none}`

  if (carregando) {
    return (
      <div style={style}>
        <Hero variant="principal" busca={busca} setBusca={setBusca} />
        <div style={{ padding: '60px 0', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Carregando artes...</div>
      </div>
    )
  }

  // ---- BUSCA GLOBAL (sobrepõe a navegação) ----
  if (termo) {
    const achadas = artes.filter((a) =>
      a.titulo.toLowerCase().includes(termo) ||
      (a.categoria || '').toLowerCase().includes(termo) ||
      (a.menu || '').toLowerCase().includes(termo)
    )
    const grupos = agrupar(achadas, 'categoria')
    return (
      <div style={style}>
        <style>{scrollbarCss}</style>
        <Hero variant="principal" busca={busca} setBusca={setBusca} />
        {grupos.length === 0 ? (
          <Vazio texto="Nenhuma arte encontrada" sub="Tente outro termo de busca." />
        ) : (
          <>
            <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
              Resultados para "<strong>{busca.trim()}</strong>"
            </div>
            {grupos.map((g) => (
              <FileiraRow key={g.titulo} grupo={g} onAbrirCanva={abrirCanva}
                onVerTudo={(cat) => { const primeira = achadas.find((a) => a.categoria === cat); setMenuSel(primeira?.menu || null); setBusca(''); setCatSel(cat) }} />
            ))}
          </>
        )}
      </div>
    )
  }

  // ---- NÍVEL 3: categoria aberta (grade de artes) ----
  if (catSel) {
    const itens = artes.filter((a) => a.categoria === catSel && (!menuSel || (a.menu || 'Outros') === menuSel))
    return (
      <div style={style}>
        <style>{scrollbarCss}</style>
        <Hero variant="detalhe" titulo={catSel} busca={busca} setBusca={setBusca} />
        <VoltarBtn onClick={voltarNivel2} />
        {itens.length === 0 ? (
          <Vazio texto="Nenhuma arte aqui ainda" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_W}px, 1fr))`, gap: '16px' }}>
            {itens.map((arte, i) => <ArteCard key={arte.id} arte={arte} indice={i} onAbrir={abrirCanva} />)}
          </div>
        )}
      </div>
    )
  }

  // ---- NÍVEL 2: menu aberto (categorias em fileiras) ----
  if (menuSel) {
    const doMenu = artes.filter((a) => (a.menu || 'Outros') === menuSel)
    const categorias = agrupar(doMenu, 'categoria')
    return (
      <div style={style}>
        <style>{scrollbarCss}</style>
        <Hero variant="detalhe" titulo={menuSel} busca={busca} setBusca={setBusca} />
        <VoltarBtn onClick={voltarNivel1} />
        {categorias.length === 0 ? (
          <Vazio texto="Nenhuma arte aqui ainda" />
        ) : (
          categorias.map((g) => (
            <FileiraRow key={g.titulo} grupo={g} onAbrirCanva={abrirCanva} onVerTudo={abrirCategoria} />
          ))
        )}
      </div>
    )
  }

  // ---- NÍVEL 1: menus (categorias-mãe) em fileiras ----
  const menus = agrupar(artes, 'menu')
  return (
    <div style={style}>
      <style>{scrollbarCss}</style>
      <Hero variant="principal" busca={busca} setBusca={setBusca} />
      {menus.length === 0 ? (
        <Vazio texto="Nenhuma arte cadastrada ainda" sub="As categorias aparecem aqui assim que as artes forem cadastradas." />
      ) : (
        menus.map((g) => (
          <FileiraRow key={g.titulo} grupo={g} onAbrirCanva={abrirCanva} onVerTudo={abrirMenu} />
        ))
      )}
    </div>
  )
}
