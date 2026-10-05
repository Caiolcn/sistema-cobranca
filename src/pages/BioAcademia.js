import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { FUNCTIONS_URL, SUPABASE_ANON_KEY as ANON_KEY } from '../supabaseClient'
import { getFonteBio, carregarFontesBio, resolverTema, resolverBio, youtubeId, tipoDaMidia } from '../data/bioTemas'

// Link na bio da academia: logo, frase, botões de link e carrossel de fotos/vídeos.
// BioView é só visual (usado também no preview do editor); a página abaixo busca
// os dados na edge function landing-dados.

const headers = { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
const WA_VERDE = '#25D366'

function urlExterna(url) {
  if (!url) return ''
  const u = String(url).trim()
  if (!u) return ''
  if (/^https?:\/\//i.test(u)) return u
  return 'https://' + u.replace(/^\/+/, '')
}

function telefoneWa(tel) {
  if (!tel) return ''
  let t = String(tel).replace(/\D/g, '')
  if (!t) return ''
  if (!t.startsWith('55')) t = '55' + t
  return t
}

function Botao({ href, icon, children, tema, fonte, destaque, fundo, texto }) {
  const bebas = fonte.id === 'bebas'
  const proprio = !!fundo
  const bg = proprio ? fundo : destaque ? tema.destaque : tema.card
  const cor = proprio ? texto : destaque ? tema.destaqueTexto : tema.cardTexto
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: destaque || proprio ? '16px 14px' : '13px 14px',
        borderRadius: '16px', textDecoration: 'none', fontFamily: fonte.stack, letterSpacing: bebas ? '0.04em' : undefined,
        backgroundColor: bg, color: cor,
        border: `1.5px solid ${destaque || proprio ? 'transparent' : tema.cardBorda}`,
        fontWeight: destaque || proprio ? 700 : 600, fontSize: bebas ? (destaque || proprio ? '18px' : '17px') : (destaque || proprio ? '14.5px' : '14px'),
        boxShadow: destaque || proprio ? '0 10px 26px rgba(0,0,0,0.28)' : '0 1px 2px rgba(0,0,0,0.08)',
        backdropFilter: destaque || proprio ? 'none' : 'blur(10px)',
        WebkitBackdropFilter: destaque || proprio ? 'none' : 'blur(10px)',
        transition: 'transform 0.15s ease'
      }}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)' }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}>
      <Icon icon={icon} width={destaque || proprio ? 22 : 21} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
      <Icon icon="mdi:chevron-right" width="18" style={{ opacity: 0.55, flexShrink: 0 }} />
    </a>
  )
}

function Slide({ midia }) {
  const base = { flex: '0 0 100%', width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', scrollSnapAlign: 'center', borderRadius: '20px', backgroundColor: 'rgba(0,0,0,0.25)', border: 0 }
  const tipo = midia.tipo || tipoDaMidia(midia.url)
  if (tipo === 'youtube') {
    const id = youtubeId(midia.url)
    if (!id) return null
    return (
      <iframe title="Vídeo" src={`https://www.youtube.com/embed/${id}?rel=0&playsinline=1`}
        allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" style={base} />
    )
  }
  if (tipo === 'video') {
    return <video src={midia.url} controls playsInline preload="metadata" style={base} />
  }
  return <img src={midia.url} alt="" loading="lazy" style={base} />
}

function Carrossel({ midias, tema }) {
  const faixa = useRef(null)
  const [atual, setAtual] = useState(0)

  const passo = () => {
    const el = faixa.current
    const largura = el?.firstChild?.getBoundingClientRect().width || 1
    return largura + 10
  }
  const aoRolar = () => {
    const el = faixa.current
    if (el) setAtual(Math.round(el.scrollLeft / passo()))
  }
  const ir = (i) => faixa.current?.scrollTo({ left: i * passo(), behavior: 'smooth' })

  useEffect(() => { setAtual(0); faixa.current?.scrollTo({ left: 0 }) }, [midias.length])

  const seta = (lado) => ({
    position: 'absolute', top: '50%', [lado]: '10px', transform: 'translateY(-50%)',
    width: '34px', height: '34px', borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)', color: '#18181b', boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
  })

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <div ref={faixa} onScroll={aoRolar}
          style={{ display: 'flex', gap: '10px', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', borderRadius: '20px' }}>
          {midias.map((m, i) => <Slide key={m.url + i} midia={m} />)}
        </div>
        {atual > 0 && (
          <button type="button" aria-label="Anterior" onClick={() => ir(atual - 1)} style={seta('left')}>
            <Icon icon="mdi:chevron-left" width="24" />
          </button>
        )}
        {atual < midias.length - 1 && (
          <button type="button" aria-label="Próximo" onClick={() => ir(atual + 1)} style={seta('right')}>
            <Icon icon="mdi:chevron-right" width="24" />
          </button>
        )}
      </div>
      {midias.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '14px' }}>
          {midias.map((_, i) => (
            <button key={i} type="button" aria-label={`Item ${i + 1}`} onClick={() => ir(i)}
              style={{
                width: i === atual ? '22px' : '7px', height: '7px', borderRadius: '999px', border: 'none', padding: 0, cursor: 'pointer',
                backgroundColor: i === atual ? tema.destaque : tema.textoSuave, opacity: i === atual ? 1 : 0.45, transition: 'all 0.2s ease'
              }} />
          ))}
        </div>
      )}
    </div>
  )
}

// empresa: mesmo formato retornado pela edge function landing-dados
// bio: configuração salva (usuarios.bio_config) — pode ser vazia
export function BioView({ empresa, bio, preview = false }) {
  const cfg = resolverBio(empresa, bio)
  const tema = resolverTema(cfg.tema, empresa.cor_primaria)
  const fonte = getFonteBio(cfg.fonte)

  useEffect(() => { carregarFontesBio([cfg.fonte]) }, [cfg.fonte])

  const wa = telefoneWa(empresa.telefone)
  const linkWa = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Olá! Vim pelo Instagram da ${empresa.nome_empresa}`)}` : null
  const linkAgendar = (empresa.agendamento_ativo && empresa.agendamento_slug)
    ? `${window.location.origin}/agendar/${empresa.agendamento_slug}`
    : null
  const linkMapa = empresa.endereco_completo
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(empresa.endereco_completo)}`
    : null

  const fundo = `linear-gradient(180deg, ${tema.fundo[0]} 0%, ${tema.fundo[1]} 100%)`
  const imagemTopo = cfg.capa || null
  const mostrarAgendar = cfg.mostrar.agendar && linkAgendar
  const mostrarWa = cfg.mostrar.whatsapp && linkWa

  const redes = [
    { href: urlExterna(cfg.redes.instagram), icon: 'mdi:instagram', label: 'Instagram' },
    { href: urlExterna(cfg.redes.tiktok), icon: 'ic:baseline-tiktok', label: 'TikTok' },
    { href: urlExterna(cfg.redes.facebook), icon: 'mdi:facebook', label: 'Facebook' },
    { href: urlExterna(cfg.redes.youtube), icon: 'mdi:youtube', label: 'YouTube' },
    { href: urlExterna(cfg.redes.site), icon: 'mdi:web', label: 'Nosso site' }
  ].filter(r => r.href)

  return (
    <div style={{ minHeight: preview ? '100%' : '100vh', background: fundo, backgroundAttachment: preview ? 'scroll' : 'fixed', color: tema.texto, fontFamily: fonte.stack }}>
      <div style={{ maxWidth: '480px', margin: '0 auto', minHeight: preview ? '100%' : '100vh', position: 'relative' }}>

        {/* Topo: capa que se dissolve no fundo do tema */}
        <div style={{ height: '190px', position: 'relative', overflow: 'hidden' }}>
          {imagemTopo && (
            <img src={imagemTopo} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(1px)', transform: 'scale(1.06)' }} />
          )}
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${tema.fundo[0]}66 0%, ${tema.fundo[0]}b3 55%, ${tema.fundo[0]} 100%)` }} />
        </div>

        <div style={{ padding: '0 20px 44px', marginTop: '-70px', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {empresa.logo_url ? (
              <img src={empresa.logo_url} alt={empresa.nome_empresa}
                style={{ width: '108px', height: '108px', borderRadius: '50%', objectFit: 'cover', border: `4px solid ${tema.destaque}`, backgroundColor: '#fff', boxShadow: '0 10px 28px rgba(0,0,0,0.35)' }} />
            ) : (
              <div style={{ width: '108px', height: '108px', borderRadius: '50%', border: `4px solid ${tema.destaque}`, backgroundColor: tema.card, color: tema.texto, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '42px', fontWeight: 800, fontFamily: fonte.stack, boxShadow: '0 10px 28px rgba(0,0,0,0.35)' }}>
                {(empresa.nome_empresa || '?').trim().charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <h1 style={{ margin: '16px 0 0', textAlign: 'center', fontFamily: fonte.stack, fontSize: '26px', fontWeight: 700, letterSpacing: fonte.id === 'bebas' ? '0.04em' : '-0.01em', lineHeight: 1.15, color: tema.texto }}>
            {empresa.nome_empresa}
          </h1>
          {cfg.frase && (
            <p style={{ margin: '10px auto 0', maxWidth: '360px', textAlign: 'center', fontFamily: fonte.stack, fontSize: '15px', lineHeight: 1.55, color: tema.textoSuave }}>
              {cfg.frase}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '11px', marginTop: '28px' }}>
            {mostrarAgendar && <Botao fonte={fonte} href={linkAgendar} icon="mdi:calendar-check" tema={tema} destaque>Agendar aula</Botao>}
            {mostrarWa && (mostrarAgendar
              ? <Botao fonte={fonte} href={linkWa} icon="mdi:whatsapp" tema={tema}>Chamar no WhatsApp</Botao>
              : <Botao fonte={fonte} href={linkWa} icon="mdi:whatsapp" tema={tema} fundo={WA_VERDE} texto="#ffffff">Chamar no WhatsApp</Botao>)}
            {redes.map(r => <Botao fonte={fonte} key={r.label} href={r.href} icon={r.icon} tema={tema}>{r.label}</Botao>)}
            {cfg.links.map((l, i) => <Botao fonte={fonte} key={i} href={urlExterna(l.url)} icon="mdi:link-variant" tema={tema}>{l.titulo}</Botao>)}
            {cfg.mostrar.mapa && linkMapa && <Botao fonte={fonte} href={linkMapa} icon="mdi:map-marker" tema={tema}>Como chegar</Botao>}
          </div>

          {cfg.midias.length > 0 && (
            <div style={{ marginTop: '30px' }}>
              <Carrossel midias={cfg.midias} tema={tema} />
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: '40px', fontSize: '12px', color: tema.textoSuave, opacity: 0.8, fontFamily: fonte.stack }}>
            Feito com{' '}
            <a href="https://www.mensalli.com.br" target="_blank" rel="noopener noreferrer" style={{ color: tema.texto, fontWeight: 700, textDecoration: 'none' }}>
              Mensalli
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BioAcademia() {
  const { slug } = useParams()
  const [query] = useSearchParams()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      try {
        const res = await fetch(`${FUNCTIONS_URL}/landing-dados?slug=${encodeURIComponent(slug)}&modo=bio`, { headers })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error || 'Página não encontrada')
        }
        const json = await res.json()
        if (!cancelado) setDados(json)
      } catch (err) {
        if (!cancelado) setErro(err.message)
      } finally {
        if (!cancelado) setLoading(false)
      }
    }
    carregar()
    return () => { cancelado = true }
  }, [slug])

  useEffect(() => {
    if (dados?.empresa) document.title = dados.empresa.nome_empresa
  }, [dados])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' }}>
        <Icon icon="eos-icons:loading" width="40" style={{ color: '#94a3b8' }} />
      </div>
    )
  }

  if (erro || !dados?.empresa) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f4f5', padding: '24px', textAlign: 'center' }}>
        <div>
          <Icon icon="mdi:link-off" width="56" style={{ color: '#a1a1aa' }} />
          <h1 style={{ fontSize: '20px', color: '#27272a', marginTop: '14px' }}>Link indisponível</h1>
          <p style={{ fontSize: '14px', color: '#71717a', marginTop: '6px' }}>{erro || 'Esta página não existe.'}</p>
        </div>
      </div>
    )
  }

  // ?tema=fogo&fonte=oswald troca só o visual (útil pra mostrar opções ao cliente)
  const bio = { ...(dados.bio || {}) }
  if (query.get('tema')) bio.tema = query.get('tema')
  if (query.get('fonte')) bio.fonte = query.get('fonte')

  return <BioView empresa={dados.empresa} bio={bio} />
}
