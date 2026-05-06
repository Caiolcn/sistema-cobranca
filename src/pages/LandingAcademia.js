import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { FUNCTIONS_URL, SUPABASE_ANON_KEY as ANON_KEY } from '../supabaseClient'

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const headers = { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }

function formatarValor(v) {
  const n = parseFloat(v)
  if (isNaN(n)) return 'R$ 0,00'
  return `R$ ${n.toFixed(2).replace('.', ',')}`
}

function formatarTelefoneWa(tel) {
  if (!tel) return ''
  let t = String(tel).replace(/\D/g, '')
  if (!t.startsWith('55')) t = '55' + t
  return t
}

function setMeta(name, content, attr = 'name') {
  if (!content) return
  let el = document.querySelector(`meta[${attr}="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export default function LandingAcademia({ previewData = null }) {
  const params = useParams()
  const slug = params?.slug
  const isPreview = !!previewData
  const [loading, setLoading] = useState(!isPreview)
  const [erro, setErro] = useState(null)
  const [fetched, setFetched] = useState(null)
  const [faqAberto, setFaqAberto] = useState(null)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768)

  // Em preview, le direto da prop (sem estado intermediario) pra nao atrasar updates.
  // Fora do preview, usa os dados carregados via edge function.
  const empresa = isPreview ? (previewData?.empresa || null) : fetched?.empresa || null
  const planos = isPreview ? (previewData?.planos || []) : fetched?.planos || []
  const aulas = isPreview ? (previewData?.aulas || []) : fetched?.aulas || []
  const depoimentos = isPreview ? (previewData?.depoimentos || []) : fetched?.depoimentos || []

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (isPreview) return // preview usa dados das props, nao fetcha
    async function carregar() {
      try {
        const res = await fetch(`${FUNCTIONS_URL}/landing-dados?slug=${slug}`, { headers })
        if (!res.ok) {
          const json = await res.json().catch(() => ({}))
          throw new Error(json.error || 'Página não encontrada')
        }
        const json = await res.json()
        setFetched({
          empresa: json.empresa,
          planos: json.planos || [],
          aulas: json.aulas || [],
          depoimentos: json.depoimentos || []
        })
        setLoading(false)
      } catch (err) {
        setErro(err.message)
        setLoading(false)
      }
    }
    carregar()
  }, [slug, isPreview])

  // SEO / Open Graph — NAO executa em modo preview (senao vaza title no painel)
  useEffect(() => {
    if (!empresa || isPreview) return
    const titulo = `${empresa.nome_empresa} — Mensalli`
    const descricao = empresa.descricao || `Conheça a ${empresa.nome_empresa}. Agende sua aula experimental agora.`
    const imagem = empresa.foto_capa_url || empresa.logo_url || ''

    document.title = titulo
    setMeta('description', descricao)
    setMeta('og:title', titulo, 'property')
    setMeta('og:description', descricao, 'property')
    if (imagem) setMeta('og:image', imagem, 'property')
    setMeta('og:type', 'website', 'property')
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', titulo)
    setMeta('twitter:description', descricao)
    if (imagem) setMeta('twitter:image', imagem)
  }, [empresa, isPreview])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' }}>
        <div style={{ textAlign: 'center', color: '#344848' }}>
          <Icon icon="eos-icons:loading" width="48" />
          <p style={{ marginTop: '12px' }}>Carregando...</p>
        </div>
      </div>
    )
  }

  if (erro || !empresa) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5', padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '420px' }}>
          <Icon icon="mdi:compass-off-outline" width="64" style={{ color: '#bbb' }} />
          <h1 style={{ fontSize: '22px', color: '#344848', marginTop: '16px' }}>Página não encontrada</h1>
          <p style={{ fontSize: '14px', color: '#888', marginTop: '8px' }}>
            {erro || 'Esta academia ainda não publicou a página dela.'}
          </p>
        </div>
      </div>
    )
  }

  const cor = empresa.cor_primaria || '#344848'
  const telWa = formatarTelefoneWa(empresa.telefone)
  const msgWa = encodeURIComponent(`Olá! Quero conhecer a ${empresa.nome_empresa}`)
  const linkWaBase = telWa ? `https://wa.me/${telWa}?text=${msgWa}` : null
  // Hero: respeita toggle mostrar_cta_whatsapp
  const linkWaHero = (linkWaBase && empresa.mostrar_cta_whatsapp !== false) ? linkWaBase : null
  // CTA final: secao renderiza pelo mostrar_cta_final; botao dentro pelo cta_final_mostrar_botao
  const mostrarSecaoFinal = empresa.mostrar_cta_final !== false
  const linkWaFinal = (linkWaBase && empresa.cta_final_mostrar_botao !== false) ? linkWaBase : null
  // Footer: sempre mostra se tem telefone (eh contato, nao CTA)
  const linkWaFooter = linkWaBase
  const linkAgendar = (empresa.agendamento_ativo && empresa.agendamento_slug && empresa.mostrar_cta_agendar !== false)
    ? `${window.location.origin}/agendar/${empresa.agendamento_slug}`
    : null

  // Textos customizaveis da secao CTA final com fallbacks
  const ctaFinalTitulo = empresa.cta_final_titulo || 'Bora começar?'
  const ctaFinalSubtitulo = empresa.cta_final_subtitulo || 'Sua primeira aula experimental é por nossa conta.'
  const mapaUrl = empresa.endereco_completo
    ? `https://www.google.com/maps?q=${encodeURIComponent(empresa.endereco_completo)}&output=embed`
    : null

  // Hero custom
  const heroTitulo = empresa.hero_titulo || empresa.nome_empresa
  const heroSubtitulo = empresa.hero_subtitulo
    || [empresa.cidade, empresa.estado].filter(Boolean).join(' — ')
  const ctaTexto = empresa.cta_texto || 'Agendar experimental'

  // Galeria e FAQ
  const galeria = Array.isArray(empresa.galeria) ? empresa.galeria.filter(Boolean) : []
  const faq = Array.isArray(empresa.faq)
    ? empresa.faq.filter(f => f && f.pergunta && f.resposta)
    : []

  // Agrupar aulas por dia
  const aulasPorDia = {}
  for (const a of aulas) {
    if (!aulasPorDia[a.dia_semana]) aulasPorDia[a.dia_semana] = []
    aulasPorDia[a.dia_semana].push(a)
  }

  // Ordem das secoes (com fallback seguro)
  const ordem = Array.isArray(empresa.ordem_secoes) && empresa.ordem_secoes.length > 0
    ? empresa.ordem_secoes
    : ['sobre', 'planos', 'galeria', 'horarios', 'depoimentos', 'faq', 'mapa']

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'Inter, -apple-system, sans-serif', color: '#1a1a1a' }}>
      {/* HERO */}
      <section style={{
        position: 'relative',
        minHeight: isMobile ? '420px' : '520px',
        backgroundColor: cor,
        backgroundImage: empresa.foto_capa_url
          ? `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${empresa.foto_capa_url})`
          : `linear-gradient(135deg, ${cor} 0%, ${shade(cor, -20)} 100%)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? '48px 20px' : '60px 24px',
        textAlign: 'center'
      }}>
        <div style={{ maxWidth: '720px', width: '100%' }}>
          <h1 style={{
            fontSize: isMobile ? '30px' : '44px',
            fontWeight: '800',
            margin: '0 0 12px',
            textShadow: '0 2px 12px rgba(0,0,0,0.3)',
            letterSpacing: '-0.5px'
          }}>
            {heroTitulo}
          </h1>
          {heroSubtitulo && (
            <p style={{ fontSize: isMobile ? '15px' : '17px', opacity: 0.92, margin: '0 0 28px', maxWidth: '560px', marginLeft: 'auto', marginRight: 'auto', lineHeight: '1.5' }}>
              {heroSubtitulo}
            </p>
          )}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {linkWaHero && (
              <a href={linkWaHero} target="_blank" rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: isMobile ? '14px 22px' : '16px 32px',
                  backgroundColor: '#25d366',
                  color: 'white',
                  borderRadius: '999px',
                  textDecoration: 'none',
                  fontWeight: '700',
                  fontSize: isMobile ? '15px' : '16px',
                  boxShadow: '0 6px 20px rgba(37,211,102,0.45)',
                  transition: 'transform 0.15s'
                }}
                onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}>
                <Icon icon="mdi:whatsapp" width="22" />
                {ctaTexto}
              </a>
            )}
            {linkAgendar && (
              <a href={linkAgendar}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: isMobile ? '14px 22px' : '16px 32px',
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  backdropFilter: 'blur(6px)',
                  color: 'white',
                  borderRadius: '999px',
                  textDecoration: 'none',
                  fontWeight: '600',
                  fontSize: isMobile ? '15px' : '16px',
                  border: '1.5px solid rgba(255,255,255,0.7)'
                }}>
                <Icon icon="mdi:calendar-check" width="20" />
                Agendar online
              </a>
            )}
          </div>
        </div>
      </section>

      {/* SECOES DINAMICAS (ordem custom) */}
      {ordem.map(secao => {
        switch (secao) {
          case 'sobre':
            if (!empresa.descricao) return null
            return (
              <section key="sobre" style={{ padding: isMobile ? '48px 20px' : '72px 24px', maxWidth: '780px', margin: '0 auto' }}>
                <SectionTitle cor={cor} icon="mdi:information-outline">Sobre nós</SectionTitle>
                <p style={{
                  fontSize: isMobile ? '16px' : '18px',
                  lineHeight: '1.7',
                  color: '#444',
                  whiteSpace: 'pre-wrap',
                  textAlign: 'center',
                  margin: '24px 0 0'
                }}>
                  {empresa.descricao}
                </p>
              </section>
            )

          case 'planos':
            if (!empresa.mostrar_planos || planos.length === 0) return null
            return (
              <section key="planos" style={{ padding: isMobile ? '48px 20px' : '72px 24px', backgroundColor: 'white' }}>
                <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                  <SectionTitle cor={cor} icon="mdi:package-variant-closed">Nossos planos</SectionTitle>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : `repeat(auto-fit, minmax(260px, 1fr))`,
                    gap: '18px',
                    marginTop: '32px'
                  }}>
                    {planos.map((p, i) => (
                      <div key={i} style={{
                        padding: '28px 24px',
                        borderRadius: '16px',
                        border: `2px solid ${i === 0 ? cor : '#e5e7eb'}`,
                        backgroundColor: '#fff',
                        boxShadow: i === 0 ? `0 10px 30px ${cor}22` : '0 2px 8px rgba(0,0,0,0.04)',
                        textAlign: 'center',
                        position: 'relative'
                      }}>
                        {i === 0 && (
                          <div style={{
                            position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
                            backgroundColor: cor, color: 'white', fontSize: '11px', fontWeight: '700',
                            padding: '5px 14px', borderRadius: '999px', letterSpacing: '0.5px', textTransform: 'uppercase'
                          }}>
                            Mais popular
                          </div>
                        )}
                        <h3 style={{ fontSize: '17px', fontWeight: '700', margin: '0 0 16px', color: '#1a1a1a' }}>{p.nome}</h3>
                        <div style={{ fontSize: '36px', fontWeight: '800', color: cor, margin: '0 0 4px', lineHeight: 1 }}>
                          {formatarValor(p.valor)}
                        </div>
                        <div style={{ fontSize: '13px', color: '#888', marginBottom: '18px' }}>/{p.ciclo || 'mensal'}</div>
                        {p.descricao && <p style={{ fontSize: '13px', color: '#666', lineHeight: '1.5', margin: 0 }}>{p.descricao}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )

          case 'galeria':
            if (!empresa.mostrar_galeria || galeria.length === 0) return null
            return (
              <section key="galeria" style={{ padding: isMobile ? '48px 20px' : '72px 24px' }}>
                <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                  <SectionTitle cor={cor} icon="mdi:image-multiple-outline">Conheça o espaço</SectionTitle>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(${Math.min(galeria.length, 3)}, 1fr)`,
                    gap: '12px',
                    marginTop: '32px'
                  }}>
                    {galeria.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                        <img src={url} alt={`Foto ${i + 1}`}
                          style={{
                            width: '100%',
                            aspectRatio: '4 / 3',
                            objectFit: 'cover',
                            borderRadius: '12px',
                            display: 'block',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            transition: 'transform 0.2s'
                          }}
                          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.02)'}
                          onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                        />
                      </a>
                    ))}
                  </div>
                </div>
              </section>
            )

          case 'horarios':
            if (!empresa.mostrar_horarios || aulas.length === 0) return null
            return (
              <section key="horarios" style={{ padding: isMobile ? '48px 20px' : '72px 24px' }}>
                <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                  <SectionTitle cor={cor} icon="mdi:calendar-clock">Horários das aulas</SectionTitle>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '14px',
                    marginTop: '32px'
                  }}>
                    {Array.from({ length: 7 }, (_, i) => i).filter(d => aulasPorDia[d]?.length > 0).map(dia => (
                      <div key={dia} style={{
                        backgroundColor: 'white', borderRadius: '12px', padding: '18px 20px', border: '1px solid #e5e7eb'
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: cor, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                          {DIAS_SEMANA[dia]}
                        </div>
                        {aulasPorDia[dia].map((a, i) => (
                          <div key={i} style={{
                            fontSize: '14px', color: '#444', padding: '6px 0',
                            borderTop: i > 0 ? '1px dashed #eee' : 'none',
                            display: 'flex', gap: '8px', alignItems: 'center'
                          }}>
                            <span style={{ fontWeight: '600', color: '#1a1a1a', minWidth: '44px' }}>
                              {String(a.horario || '').substring(0, 5)}
                            </span>
                            {a.descricao && <span style={{ color: '#666' }}>{a.descricao}</span>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )

          case 'depoimentos':
            if (!empresa.mostrar_depoimentos || depoimentos.length === 0) return null
            return (
              <section key="depoimentos" style={{ padding: isMobile ? '48px 20px' : '72px 24px', backgroundColor: '#fff' }}>
                <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                  <SectionTitle cor={cor} icon="mdi:star-outline">O que nossos alunos dizem</SectionTitle>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '18px',
                    marginTop: '32px'
                  }}>
                    {depoimentos.map((d, i) => (
                      <div key={i} style={{
                        padding: '24px', borderRadius: '14px', backgroundColor: '#f8f9fa',
                        border: '1px solid #eef0f2', position: 'relative'
                      }}>
                        <Icon icon="mdi:format-quote-open" width="28" style={{ color: cor, opacity: 0.35 }} />
                        <p style={{ fontSize: '15px', lineHeight: '1.6', color: '#333', margin: '6px 0 16px', fontStyle: 'italic' }}>
                          "{d.comentario}"
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: '#1a1a1a' }}>{d.nome}</div>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            {[...Array(5)].map((_, j) => (
                              <Icon key={j} icon="mdi:star" width="16" style={{ color: '#fbbf24' }} />
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )

          case 'faq':
            if (!empresa.mostrar_faq || faq.length === 0) return null
            return (
              <section key="faq" style={{ padding: isMobile ? '48px 20px' : '72px 24px' }}>
                <div style={{ maxWidth: '760px', margin: '0 auto' }}>
                  <SectionTitle cor={cor} icon="mdi:help-circle-outline">Perguntas frequentes</SectionTitle>
                  <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {faq.map((item, i) => {
                      const aberto = faqAberto === i
                      return (
                        <div key={i} style={{
                          backgroundColor: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '12px',
                          overflow: 'hidden',
                          boxShadow: aberto ? `0 4px 16px ${cor}15` : 'none',
                          transition: 'box-shadow 0.2s'
                        }}>
                          <button
                            onClick={() => setFaqAberto(aberto ? null : i)}
                            style={{
                              width: '100%', padding: '18px 20px', background: 'none', border: 'none',
                              cursor: 'pointer', textAlign: 'left',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                              fontSize: '15px', fontWeight: '600', color: '#1a1a1a'
                            }}>
                            <span>{item.pergunta}</span>
                            <Icon icon={aberto ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="22"
                              style={{ color: cor, flexShrink: 0 }} />
                          </button>
                          {aberto && (
                            <div style={{
                              padding: '0 20px 20px', fontSize: '14px', lineHeight: '1.6',
                              color: '#555', whiteSpace: 'pre-wrap'
                            }}>
                              {item.resposta}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </section>
            )

          case 'mapa':
            if (!mapaUrl) return null
            return (
              <section key="mapa" style={{ padding: isMobile ? '48px 20px' : '72px 24px' }}>
                <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                  <SectionTitle cor={cor} icon="mdi:map-marker-outline">Como chegar</SectionTitle>
                  <p style={{ textAlign: 'center', color: '#666', fontSize: '14px', marginTop: '8px', marginBottom: '24px' }}>
                    {empresa.endereco_completo}
                  </p>
                  <div style={{
                    borderRadius: '16px', overflow: 'hidden',
                    boxShadow: '0 6px 24px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb'
                  }}>
                    <iframe
                      title="Mapa"
                      src={mapaUrl}
                      width="100%"
                      height={isMobile ? '280' : '380'}
                      style={{ border: 0, display: 'block' }}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                </div>
              </section>
            )

          default:
            return null
        }
      })}

      {/* CTA FINAL */}
      {mostrarSecaoFinal && (
        <section style={{
          padding: isMobile ? '56px 20px' : '80px 24px',
          backgroundColor: cor,
          color: 'white',
          textAlign: 'center'
        }}>
          <h2 style={{ fontSize: isMobile ? '26px' : '36px', fontWeight: '800', margin: '0 0 12px' }}>
            {ctaFinalTitulo}
          </h2>
          <p style={{
            fontSize: '16px', opacity: 0.9, whiteSpace: 'pre-wrap',
            margin: linkWaFinal ? '0 0 28px' : 0
          }}>
            {ctaFinalSubtitulo}
          </p>
          {linkWaFinal && (
            <a href={linkWaFinal} target="_blank" rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                padding: '16px 36px',
                backgroundColor: 'white',
                color: cor,
                borderRadius: '999px',
                textDecoration: 'none',
                fontWeight: '800',
                fontSize: '17px',
                boxShadow: '0 10px 28px rgba(0,0,0,0.25)'
              }}>
              <Icon icon="mdi:whatsapp" width="24" />
              {ctaTexto}
            </a>
          )}
        </section>
      )}

      {/* FOOTER */}
      <footer style={{
        padding: '36px 20px',
        backgroundColor: '#1a1a1a',
        color: '#aaa',
        textAlign: 'center',
        fontSize: '13px'
      }}>
        <div style={{ display: 'flex', gap: '18px', justifyContent: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
          {linkWaFooter && (
            <a href={linkWaFooter} target="_blank" rel="noreferrer" style={{ color: '#aaa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="mdi:whatsapp" width="18" />
              WhatsApp
            </a>
          )}
          {empresa.instagram_url && (
            <a href={empresa.instagram_url} target="_blank" rel="noreferrer" style={{ color: '#aaa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="mdi:instagram" width="18" />
              Instagram
            </a>
          )}
          {empresa.facebook_url && (
            <a href={empresa.facebook_url} target="_blank" rel="noreferrer" style={{ color: '#aaa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="mdi:facebook" width="18" />
              Facebook
            </a>
          )}
          {empresa.tiktok_url && (
            <a href={empresa.tiktok_url} target="_blank" rel="noreferrer" style={{ color: '#aaa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon icon="simple-icons:tiktok" width="16" />
              TikTok
            </a>
          )}
        </div>
        {empresa.rodape_texto && (
          <div style={{
            marginBottom: '12px', fontSize: '12px', opacity: 0.75, lineHeight: '1.6',
            whiteSpace: 'pre-wrap', maxWidth: '600px', margin: '0 auto 12px'
          }}>
            {empresa.rodape_texto}
          </div>
        )}
        <div style={{ opacity: 0.6 }}>
          © {new Date().getFullYear()} {empresa.nome_empresa}
        </div>
        <div style={{ marginTop: '8px', fontSize: '12px', opacity: 0.5 }}>
          Feito com <a href="https://www.mensalli.com.br" style={{ color: '#ccc', textDecoration: 'none', fontWeight: '600' }}>Mensalli</a>
        </div>
      </footer>
    </div>
  )
}

function SectionTitle({ cor, icon, children }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        backgroundColor: `${cor}15`,
        marginBottom: '12px'
      }}>
        <Icon icon={icon} width="28" style={{ color: cor }} />
      </div>
      <h2 style={{
        fontSize: '26px',
        fontWeight: '800',
        margin: 0,
        color: '#1a1a1a',
        letterSpacing: '-0.3px'
      }}>
        {children}
      </h2>
    </div>
  )
}

// Clareia/escurece cor hex (usado no gradient do hero quando nao tem foto de capa)
function shade(hex, percent) {
  try {
    let h = hex.replace('#', '')
    if (h.length === 3) h = h.split('').map(c => c + c).join('')
    const num = parseInt(h, 16)
    const amt = Math.round(2.55 * percent)
    const R = Math.max(0, Math.min(255, (num >> 16) + amt))
    const G = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt))
    const B = Math.max(0, Math.min(255, (num & 0xff) + amt))
    return `#${((R << 16) | (G << 8) | B).toString(16).padStart(6, '0')}`
  } catch {
    return hex
  }
}
