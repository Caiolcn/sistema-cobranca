import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { carregarFontesBio } from '../../data/bioTemas'
import { lojaApi, resolverAparenciaLoja, normalizarSecoes, PASSOS_PADRAO, fmtBRL, sufixoPreco, fmtDataHora, TIPO_ICONE, TIPO_CTA, TIPO_LABEL, CICLO_NOME, telefoneWa } from './lojaTema'

// Loja pública da academia (/loja/:slug). Cara de site de vendas, não de link
// na bio: capa larga, menu por categoria, planos em cards de preço, produtos em
// grade e seções automáticas (sobre, horários, depoimentos, como chegar) que só
// aparecem quando a academia já preencheu o dado no site ou na bio.
// `LojaView` é só visual e também alimenta o preview do editor.

const WA_VERDE = '#25D366'
const ALTURA_MENU = 52

// Rolagem animada até a seção, descontando o menu fixo. Feita à mão porque o
// scrollIntoView suave não é confiável dentro da prévia do editor (container
// com rolagem própria) e não sabe descontar o cabeçalho fixo.
function rolarAte(el) {
  if (!el) return
  let pai = el.parentElement
  while (pai && pai !== document.body) {
    const { overflowY } = getComputedStyle(pai)
    if ((overflowY === 'auto' || overflowY === 'scroll') && pai.scrollHeight > pai.clientHeight) break
    pai = pai.parentElement
  }
  const janela = !pai || pai === document.body
  const atual = janela ? window.scrollY : pai.scrollTop
  const topoEl = janela ? el.getBoundingClientRect().top + window.scrollY : el.getBoundingClientRect().top - pai.getBoundingClientRect().top + pai.scrollTop
  const destino = Math.max(0, topoEl - ALTURA_MENU - 8)
  const distancia = destino - atual
  const duracao = Math.min(700, Math.max(300, Math.abs(distancia) * 0.6))
  const inicio = performance.now()
  const easing = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
  const passo = (agora) => {
    const t = Math.min(1, (agora - inicio) / duracao)
    const y = atual + distancia * easing(t)
    if (janela) window.scrollTo(0, y); else pai.scrollTop = y
    if (t < 1) requestAnimationFrame(passo)
  }
  requestAnimationFrame(passo)
}
const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// CSS responsivo da loja (inline styles não fazem media query). Prefixo lj- para não vazar.
function EstilosLoja({ tema, fonte }) {
  const css = `
    .lj-root{container-type:inline-size;min-height:100vh;background:${tema.claro ? tema.fundo[0] : `linear-gradient(180deg, ${tema.fundo[0]} 0%, ${tema.fundo[1]} 100%)`};color:${tema.texto};font-family:${fonte.stack};-webkit-font-smoothing:antialiased}
    .lj-root *{box-sizing:border-box}
    .lj-wrap{max-width:1000px;margin:0 auto;padding:0 16px}

    /* ---- capa + cartão (estilo iFood) ---- */
    .lj-capa{position:relative;height:150px;background:${tema.sutil};overflow:hidden}
    .lj-capa-bg{position:absolute;inset:0;background-size:cover;background-position:center}
    .lj-capa-ov{position:absolute;inset:0;background:linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.25) 100%)}
    .lj-capa-sem{position:absolute;inset:0;background:linear-gradient(135deg, ${tema.destaque} 0%, ${tema.destaqueSuave} 100%);opacity:.9}
    .lj-topo-acoes{position:absolute;top:12px;right:12px;display:flex;gap:8px}
    .lj-topo-acoes a{width:38px;height:38px;border-radius:50%;background:rgba(0,0,0,0.45);color:#fff;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)}
    .lj-cartao-wrap{position:relative;margin-top:-54px}
    .lj-cartao{position:relative;background:${tema.card};color:${tema.cardTexto};border:1.5px solid ${tema.cardBorda};border-radius:22px;padding:52px 18px 16px;box-shadow:${tema.sombra};text-align:center}
    .lj-logo{position:absolute;top:-44px;left:50%;transform:translateX(-50%);width:88px;height:88px;border-radius:50%;object-fit:cover;background:#fff;border:4px solid ${tema.card};box-shadow:0 8px 24px rgba(0,0,0,0.18)}
    .lj-logo-fallback{display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:800;color:${tema.destaque};background:${tema.destaqueSuave}}
    .lj-h1{margin:0;font-size:22px;line-height:1.15;font-weight:800;letter-spacing:${fonte.id === 'bebas' ? '0.04em' : '-0.02em'}}
    .lj-sub{margin:4px 0 0;font-size:13px;color:${tema.textoSuave}}
    .lj-frase{margin:10px auto 0;max-width:520px;font-size:14px;line-height:1.5;color:${tema.textoSuave}}
    .lj-info{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px 14px;margin-top:12px;padding-top:12px;border-top:1px solid ${tema.cardBorda};font-size:13px;color:${tema.textoSuave}}
    .lj-info b{color:${tema.texto};font-weight:800}
    .lj-info .lj-estrela{color:#f5a623}
    .lj-ctas{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:14px}
    .lj-ctas .lj-btn{flex:1 1 0;min-width:150px;max-width:260px}
    .lj-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 16px;border-radius:12px;font-weight:700;font-size:14px;text-decoration:none;cursor:pointer;border:1.5px solid transparent;font-family:inherit;transition:transform .15s ease}
    .lj-btn:active{transform:scale(.98)}
    .lj-btn-p{background:${tema.destaque};color:${tema.destaqueTexto};box-shadow:0 10px 24px -10px ${tema.destaque}}
    .lj-btn-s{background:${tema.card};color:${tema.cardTexto};border-color:${tema.cardBorda}}
    .lj-btn-wa{background:${WA_VERDE};color:#fff}

    /* ---- abas de categoria ---- */
    .lj-menu{position:sticky;top:0;z-index:20;background:${tema.header};backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid ${tema.cardBorda};margin-top:16px}
    .lj-menu-in{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;padding:0}
    .lj-menu-in::-webkit-scrollbar{display:none}
    .lj-chip{flex:0 0 auto;padding:12px 12px 10px;font-size:13.5px;font-weight:600;text-decoration:none;color:${tema.textoSuave};border-bottom:2.5px solid transparent;white-space:nowrap}
    .lj-chip.lj-on{color:${tema.texto};border-bottom-color:${tema.destaque}}

    /* ---- seções ---- */
    .lj-sec{padding:24px 0 4px;scroll-margin-top:52px}
    .lj-sec-h{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 0 12px}
    .lj-sec-h h2{margin:0;font-size:19px;font-weight:800;letter-spacing:-0.01em}
    .lj-sec-h span{font-size:12.5px;color:${tema.textoSuave}}
    .lj-grid{display:grid;gap:12px;grid-template-columns:1fr}
    .lj-grid-planos{grid-template-columns:1fr}
    .lj-grid-prod{grid-template-columns:repeat(2,1fr);gap:12px}
    .lj-grid-dest{grid-template-columns:repeat(2,1fr);gap:10px}
    .lj-card.lj-dest{padding:14px 14px 16px;gap:6px;overflow:visible}
    .lj-dest-topo{display:flex;align-items:center;justify-content:space-between;gap:6px;color:${tema.destaque};margin-bottom:2px}
    .lj-dest-nome{font-weight:700;font-size:14px;line-height:1.25;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .lj-dest-preco{font-weight:800;font-size:18px;letter-spacing:-0.01em;line-height:1.1;margin-top:auto}
    .lj-dest-preco small{font-size:11.5px;font-weight:600;color:${tema.textoSuave};margin-left:2px}
    .lj-dest-meta{font-size:12px;color:${tema.textoSuave}}

    /* ---- cards ---- */
    .lj-card{position:relative;display:flex;flex-direction:column;text-align:left;background:${tema.card};color:${tema.cardTexto};border:1.5px solid ${tema.cardBorda};border-radius:18px;overflow:hidden;cursor:pointer;font-family:inherit;padding:0;box-shadow:${tema.sombra};transition:transform .15s ease,border-color .15s ease;min-width:0}
    .lj-card:hover{transform:translateY(-2px);border-color:${tema.destaque}}
    .lj-card.lj-dis{cursor:default;opacity:.6;transform:none}
    .lj-card:focus-visible{outline:2px solid ${tema.destaque};outline-offset:2px}
    .lj-card-body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px;flex:1;min-width:0}
    .lj-card-nome{font-weight:700;font-size:14.5px;line-height:1.25;overflow-wrap:anywhere}
    .lj-card-desc{font-size:12.5px;color:${tema.textoSuave};line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .lj-preco{font-weight:800;font-size:17px;letter-spacing:-0.01em}
    .lj-preco small{font-size:12px;font-weight:600;color:${tema.textoSuave};margin-left:2px}
    .lj-card-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 8px;margin-top:auto;padding-top:6px;min-width:0}
    .lj-link{font-size:12.5px;font-weight:700;color:${tema.destaque};display:inline-flex;align-items:center;gap:2px;white-space:nowrap}
    .lj-tag{font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;background:${tema.destaqueSuave};color:${tema.claro ? tema.destaque : tema.texto}}
    .lj-tag.lj-off{background:${tema.sutil};color:${tema.textoSuave}}

    /* produto: card com foto grande, nome, preço, contexto e botão Comprar */
    .lj-card.lj-prod{gap:0}
    .lj-prod-img{width:100%;aspect-ratio:1;object-fit:cover;background:${tema.sutil};display:flex;align-items:center;justify-content:center;color:${tema.textoSuave};position:relative;overflow:hidden}
    .lj-prod-img .lj-selo{position:absolute;top:8px;left:8px;background:rgba(17,24,39,0.85);color:#fff;font-size:10.5px;font-weight:700;padding:4px 8px;border-radius:999px}
    .lj-prod-img .lj-selo-off{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.65);color:#111827;font-weight:800;font-size:12px}
    .lj-prod-body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:3px;flex:1}
    .lj-prod-nome{font-size:13.5px;font-weight:700;line-height:1.3;color:${tema.texto};display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
    .lj-prod-preco{font-weight:800;font-size:16px;line-height:1.15;color:${tema.texto}}
    .lj-prod-preco small{font-size:11px;font-weight:600;color:${tema.textoSuave}}
    .lj-prod-meta{font-size:11.5px;color:${tema.textoSuave}}
    .lj-prod-btn{margin-top:8px;align-self:flex-start;padding:7px 12px;border-radius:9px;background:${tema.destaque};color:${tema.destaqueTexto};font-size:12.5px;font-weight:700;line-height:1}

    /* plano / pacote: um por linha */
    .lj-plano{padding:18px 16px;gap:10px}
    .lj-plano-main{display:flex;flex-direction:column;gap:8px;flex:1;min-width:0}
    .lj-plano-side{display:flex;flex-direction:column;gap:8px;align-items:flex-start}
    .lj-plano .lj-ciclo{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${tema.textoSuave}}
    .lj-plano .lj-preco{font-size:28px;line-height:1}
    .lj-plano .lj-preco small{font-size:13px}
    .lj-plano ul{margin:2px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;font-size:13.5px;color:${tema.textoSuave}}
    .lj-plano li{display:flex;gap:8px;align-items:flex-start}
    .lj-plano .lj-btn{width:100%;margin-top:4px}

    /* evento */
    .lj-evento{flex-direction:row;align-items:stretch}
    .lj-evento .lj-data{flex:0 0 74px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${tema.destaqueSuave};color:${tema.claro ? tema.destaque : tema.texto};padding:12px 6px}
    .lj-evento .lj-data b{font-size:26px;line-height:1}
    .lj-evento .lj-data span{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}

    /* seções de conteúdo */
    .lj-two{display:grid;gap:14px;grid-template-columns:1fr}
    .lj-contato-btns{display:grid;grid-template-columns:1fr;gap:8px;margin-top:12px}
    .lj-contato-btns .lj-btn{width:100%;justify-content:flex-start;padding:12px 14px}
    .lj-box{background:${tema.card};border:1.5px solid ${tema.cardBorda};border-radius:18px;padding:18px;box-shadow:${tema.sombra}}
    .lj-box h3{margin:0 0 10px;font-size:15px;font-weight:800;display:flex;align-items:center;gap:8px}
    .lj-box p{margin:0;font-size:14px;line-height:1.6;color:${tema.textoSuave};white-space:pre-line}
    .lj-hor-dias{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 0 12px;padding-bottom:2px}
    .lj-hor-dias::-webkit-scrollbar{display:none}
    .lj-hor-aba{flex:0 0 auto;padding:7px 13px;border-radius:999px;font-size:13px;font-weight:700;cursor:pointer;background:${tema.sutil};color:${tema.textoSuave};user-select:none}
    .lj-hor-aba.lj-on{background:${tema.destaque};color:${tema.destaqueTexto}}
    .lj-hor-aba:focus-visible{outline:2px solid ${tema.destaque};outline-offset:2px}
    .lj-hor-lista{display:flex;flex-direction:column}
    .lj-hor-linha{display:flex;gap:14px;align-items:baseline;padding:9px 0;border-top:1px solid ${tema.cardBorda};font-size:14px}
    .lj-hor-linha:first-child{border-top:none}
    .lj-hor-linha b{flex:0 0 46px;font-weight:800;color:${tema.destaque};font-variant-numeric:tabular-nums}
    .lj-hor-linha span{color:${tema.texto};line-height:1.45}
    .lj-hor-mais{display:flex;align-items:center;justify-content:center;gap:4px;margin-top:8px;padding:9px;border-radius:10px;font-size:13px;font-weight:700;color:${tema.destaque};cursor:pointer;background:${tema.destaqueSuave}}
    .lj-passos{display:grid;gap:10px;grid-template-columns:1fr}
    .lj-passo{display:flex;gap:12px;align-items:center;padding:14px 16px;border-radius:16px;background:${tema.card};border:1.5px solid ${tema.cardBorda};box-shadow:${tema.sombra};font-size:14.5px;font-weight:600;line-height:1.35}
    .lj-passo-n{flex:0 0 auto;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${tema.destaque};color:${tema.destaqueTexto};font-weight:800;font-size:15px}
    .lj-faixa{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch;border-radius:20px}
    .lj-faixa::-webkit-scrollbar{display:none}
    .lj-slide{flex:0 0 100%;width:100%;aspect-ratio:4/5;object-fit:cover;scroll-snap-align:center;border-radius:20px;background:${tema.sutil}}
    .lj-root button.lj-seta,.lj-root button.lj-seta:hover{background:rgba(255,255,255,0.92);color:#18181b}
    .lj-seta{position:absolute;top:50%;transform:translateY(-50%);width:36px;height:36px;border-radius:50%;border:none;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.9);color:#18181b;box-shadow:0 2px 8px rgba(0,0,0,0.3)}
    .lj-grid-dep{grid-template-columns:1fr}
    .lj-dep-card{display:flex;flex-direction:column;gap:6px}
    .lj-dep-card p{font-size:14.5px;line-height:1.55;color:${tema.texto}}
    .lj-dep-card b{font-size:12.5px;color:${tema.textoSuave};font-weight:700}
    .lj-faq{display:flex;flex-direction:column;gap:8px}
    .lj-faq-item{background:${tema.card};border:1.5px solid ${tema.cardBorda};border-radius:14px;overflow:hidden;box-shadow:${tema.sombra}}
    .lj-faq-item.lj-aberto{border-color:${tema.destaque}}
    .lj-faq-q{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;font-weight:700;font-size:14.5px;cursor:pointer}
    .lj-faq-q:focus-visible{outline:2px solid ${tema.destaque};outline-offset:-2px}
    .lj-faq-a{padding:0 16px 14px;font-size:14px;line-height:1.6;color:${tema.textoSuave};white-space:pre-line}
    .lj-cta-final{text-align:center;padding:30px 20px;border-radius:22px;background:${tema.destaque};color:${tema.destaqueTexto};box-shadow:0 18px 40px -18px ${tema.destaque}}
    .lj-cta-final h2{margin:0 0 6px;font-size:24px;font-weight:800;letter-spacing:-0.01em}
    .lj-cta-final p{margin:0 0 16px;font-size:15px;opacity:.9;line-height:1.5}
    .lj-btn-inv{background:${tema.destaqueTexto};color:${tema.destaque}}
    .lj-btn-ghost{background:transparent;color:${tema.destaqueTexto};border-color:${tema.destaqueTexto}66}
    .lj-wa{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;background:${WA_VERDE};color:#fff;text-decoration:none;font-weight:700;font-size:14.5px;margin-top:18px}
    .lj-foot{text-align:center;padding:34px 0 40px;font-size:12px;color:${tema.textoSuave}}
    .lj-foot a{color:${tema.texto};font-weight:700;text-decoration:none}
    .lj-aviso{display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:14px;background:${tema.avisoBg};border:1px solid ${tema.avisoBorda};color:${tema.avisoTexto};font-size:13px;margin:16px 0 0}
    .lj-vazio{text-align:center;padding:44px 10px;color:${tema.textoSuave}}

    @container (min-width:640px){
      .lj-capa{height:220px}
      .lj-cartao{padding:56px 28px 20px}
      .lj-h1{font-size:28px}
      .lj-grid-prod{grid-template-columns:repeat(3,1fr);gap:14px}
      .lj-grid-dest{grid-template-columns:repeat(3,1fr);gap:12px}
      .lj-prod-preco{font-size:16px}
      .lj-prod-nome{font-size:14px}
      .lj-plano{flex-direction:row;align-items:center;gap:22px;padding:22px 24px}
      .lj-plano-side{align-items:flex-end;text-align:right;flex:0 0 220px}
      .lj-sec{padding:32px 0 6px}
      .lj-sec-h h2{font-size:22px}
      .lj-passos{grid-template-columns:repeat(3,1fr)}
      .lj-passo{flex-direction:column;align-items:flex-start;gap:10px;padding:18px}
      .lj-slide{flex:0 0 calc((100% - 20px) / 3);width:calc((100% - 20px) / 3);scroll-snap-align:start}
      .lj-grid-dep{grid-template-columns:repeat(2,1fr)}
      .lj-cta-final{padding:44px 32px}
      .lj-cta-final h2{font-size:30px}
    }
    @container (min-width:900px){
      .lj-capa{height:280px}
      .lj-cartao-wrap{margin-top:-64px}
      .lj-grid-prod{grid-template-columns:repeat(4,1fr)}
      .lj-two{grid-template-columns:1fr 1fr}
    }
  `
  return <style>{css}</style>
}

// Tokens do tema como CSS vars: item e pedido usam em inline styles sem receber `tema` em todo componente
export function varsTema(tema) {
  return {
    '--lj-destaque': tema.destaque, '--lj-destaque-texto': tema.destaqueTexto, '--lj-erro': tema.erro,
    '--lj-erro-bg': tema.claro ? '#fef2f2' : 'rgba(248,113,113,0.18)', '--lj-sutil': tema.sutil,
    '--lj-card': tema.card, '--lj-borda': tema.cardBorda, '--lj-texto-suave': tema.textoSuave,
  }
}

// Cabeçalho compacto para item/pedido (e qualquer página interna da loja)
export function LojaShell({ empresa, aparencia, preview, children, voltar }) {
  const { tema, fonte } = aparencia
  return (
    <div className="lj-root" style={{ minHeight: preview ? '100%' : '100vh', ...varsTema(tema) }}>
      <EstilosLoja tema={tema} fonte={fonte} />
      <div className="lj-menu">
        <div className="lj-wrap" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px' }}>
          {voltar ? (
            <button type="button" onClick={voltar} aria-label="Voltar"
              style={{ width: '36px', height: '36px', borderRadius: '50%', border: `1px solid ${tema.cardBorda}`, cursor: 'pointer', backgroundColor: tema.card, color: tema.texto, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon icon="mdi:arrow-left" width="20" />
            </button>
          ) : (
            <LogoMini empresa={empresa} tema={tema} />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '15px', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{aparencia.titulo}</div>
            <div style={{ fontSize: '12px', color: tema.textoSuave }}>{empresa.nome_empresa}</div>
          </div>
        </div>
      </div>
      <div className="lj-wrap" style={{ maxWidth: '640px', paddingTop: '18px', paddingBottom: '40px' }}>
        {children}
        <div className="lj-foot">Loja criada com <a href="https://www.mensalli.com.br" target="_blank" rel="noopener noreferrer">Mensalli</a></div>
      </div>
    </div>
  )
}

function LogoMini({ empresa, tema }) {
  return empresa.logo_url
    ? <img src={empresa.logo_url} alt="" style={{ width: '36px', height: '36px', borderRadius: '10px', objectFit: 'cover', backgroundColor: '#fff', border: `1px solid ${tema.cardBorda}`, flexShrink: 0 }} />
    : <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: tema.destaqueSuave, color: tema.destaque, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>{(empresa.nome_empresa || '?').trim().charAt(0).toUpperCase()}</div>
}

// Card clicável como <div>: o estilo global de <button> do app (App.css) pinta hover azul.
function Clicavel({ className, onClick, disabled, children, style }) {
  const ativar = (e) => { if (disabled) return; if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(e) } }
  return (
    <div role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled || undefined}
      className={`${className}${disabled ? ' lj-dis' : ''}`} style={style}
      onClick={ativar} onKeyDown={ativar}>
      {children}
    </div>
  )
}

function CardProduto({ produto, onClick, selo }) {
  const indisponivel = produto.esgotado || produto.lotado
  const meta = produto.tipo === 'evento'
    ? fmtDataHora(produto.data_evento)
    : produto.tipo === 'pacote' && produto.plano?.numero_aulas ? `${produto.plano.numero_aulas} aulas`
    : produto.tipo === 'plano' ? (CICLO_NOME[produto.plano?.ciclo_cobranca] || 'Mensal')
    : produto.retirada_presencial ? 'Retirada no local'
    : (produto.variacoes?.length ? `${produto.variacoes.length} opções` : '')
  return (
    <Clicavel className="lj-card lj-prod" onClick={onClick} disabled={indisponivel}>
      <div className="lj-prod-img">
        {produto.imagem_url
          ? <img src={produto.imagem_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Icon icon={TIPO_ICONE[produto.tipo] || 'mdi:tag-outline'} width="38" style={{ opacity: 0.45 }} />}
        {selo && !indisponivel && <span className="lj-selo">{selo}</span>}
        {indisponivel && <span className="lj-selo-off">{produto.esgotado ? 'Esgotado' : 'Lotado'}</span>}
      </div>
      <div className="lj-prod-body">
        <div className="lj-prod-nome">{produto.nome}</div>
        <div className="lj-prod-preco">{fmtBRL(produto.valor)}{produto.tipo === 'plano' && <small>{sufixoPreco(produto)}</small>}</div>
        {meta && <div className="lj-prod-meta">{meta}</div>}
        {!indisponivel && <span className="lj-prod-btn">{TIPO_CTA[produto.tipo] || 'Comprar'}</span>}
      </div>
    </Clicavel>
  )
}

// Destaque: card compacto sem foto (nome, preço, contexto e selo). Dois por linha no
// celular, três em tela larga. A foto fica para a seção de produtos.
function CardDestaque({ produto, onClick, selo }) {
  const indisponivel = produto.esgotado || produto.lotado
  const meta = produto.tipo === 'evento'
    ? fmtDataHora(produto.data_evento)
    : produto.tipo === 'pacote' && produto.plano?.numero_aulas ? `${produto.plano.numero_aulas} aulas`
    : produto.tipo === 'plano' ? (CICLO_NOME[produto.plano?.ciclo_cobranca] || 'Mensal')
    : TIPO_LABEL[produto.tipo]
  return (
    <Clicavel className="lj-card lj-dest" onClick={onClick} disabled={indisponivel}>
      <div className="lj-dest-topo">
        <Icon icon={TIPO_ICONE[produto.tipo] || 'mdi:tag-outline'} width="18" />
        {selo && !indisponivel && <span className="lj-tag">{selo}</span>}
        {indisponivel && <span className="lj-tag lj-off">{produto.esgotado ? 'Esgotado' : 'Lotado'}</span>}
      </div>
      <div className="lj-dest-nome">{produto.nome}</div>
      <div className="lj-dest-preco">{fmtBRL(produto.valor)}{produto.tipo === 'plano' && <small>{sufixoPreco(produto)}</small>}</div>
      {meta && <div className="lj-dest-meta">{meta}</div>}
    </Clicavel>
  )
}

// Plano e pacote: um por linha. No celular empilha; em tela larga vira linha
// (nome e detalhes à esquerda, preço e botão à direita).
function CardPlano({ produto, onClick }) {
  const ciclo = produto.plano?.ciclo_cobranca || 'mensal'
  const linhas = (produto.descricao || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5)
  return (
    <Clicavel className="lj-card lj-plano" onClick={onClick}>
      <div className="lj-plano-main">
        <span className="lj-ciclo">{CICLO_NOME[ciclo] || 'Mensal'}</span>
        <div className="lj-card-nome" style={{ fontSize: '18px' }}>{produto.nome}</div>
        {linhas.length > 0 && (
          <ul>
            {linhas.map((l, i) => <li key={i}><Icon icon="mdi:check-circle" width="16" style={{ flexShrink: 0, marginTop: '2px', opacity: 0.8 }} /><span>{l.replace(/^[-•*]\s*/, '')}</span></li>)}
          </ul>
        )}
        {produto.exigir_turma && <span className="lj-tag" style={{ alignSelf: 'flex-start' }}>Você escolhe o horário</span>}
      </div>
      <div className="lj-plano-side">
        <div className="lj-preco">{fmtBRL(produto.valor)}<small>{sufixoPreco(produto)}</small></div>
        <span className="lj-btn lj-btn-p">{TIPO_CTA.plano}</span>
      </div>
    </Clicavel>
  )
}

function CardPacote({ produto, onClick }) {
  const aulas = produto.plano?.numero_aulas
  return (
    <Clicavel className="lj-card lj-plano" onClick={onClick}>
      <div className="lj-plano-main">
        <span className="lj-ciclo">Pacote{aulas ? ` · ${aulas} aulas` : ''}</span>
        <div className="lj-card-nome" style={{ fontSize: '18px' }}>{produto.nome}</div>
        {produto.descricao && <div className="lj-card-desc" style={{ WebkitLineClamp: 3 }}>{produto.descricao}</div>}
        {produto.validade_dias && <span className="lj-tag" style={{ alignSelf: 'flex-start' }}>Validade {produto.validade_dias} dias</span>}
      </div>
      <div className="lj-plano-side">
        <div className="lj-preco">{fmtBRL(produto.valor)}{aulas ? <small>{` · ${fmtBRL(produto.valor / aulas)}/aula`}</small> : null}</div>
        <span className="lj-btn lj-btn-p">{TIPO_CTA.pacote}</span>
      </div>
    </Clicavel>
  )
}

function CardEvento({ produto, onClick }) {
  const d = produto.data_evento ? new Date(produto.data_evento) : null
  const indisponivel = produto.lotado
  return (
    <Clicavel className="lj-card lj-evento" onClick={onClick} disabled={indisponivel}>
      {d && !isNaN(d.getTime()) && (
        <div className="lj-data">
          <b>{d.getDate()}</b>
          <span>{d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
        </div>
      )}
      <div className="lj-card-body">
        <div className="lj-card-nome">{produto.nome}</div>
        <div className="lj-card-desc">{[fmtDataHora(produto.data_evento), produto.local_evento].filter(Boolean).join(' · ') || produto.descricao}</div>
        <div className="lj-card-foot">
          <span className="lj-preco">{fmtBRL(produto.valor)}</span>
          {indisponivel
            ? <span className="lj-tag lj-off">Lotado</span>
            : <span className="lj-link">{produto.vagas_restantes != null ? `${produto.vagas_restantes} vagas` : TIPO_CTA.evento} <Icon icon="mdi:chevron-right" width="16" /></span>}
        </div>
      </div>
    </Clicavel>
  )
}

const GRUPOS = [
  { tipo: 'plano', id: 'planos', titulo: 'Planos', sub: 'Escolha, pague e já garanta seu horário' },
  { tipo: 'pacote', id: 'pacotes', titulo: 'Pacotes de aulas', menu: 'Pacotes', sub: 'Sem compromisso mensal' },
  { tipo: 'evento', id: 'eventos', titulo: 'Eventos e inscrições', sub: null },
  { tipo: 'produto', id: 'produtos', titulo: 'Produtos', sub: null },
]

// empresa: formato de empresaPublica (edge). produtos: formato de produtoPublico (com `vendas`).
// secoes: { aulas, depoimentos, avaliacao:{media,total}|null, galeria, faq, cta_titulo, cta_texto }
// Quais seções aparecem vem de empresa.loja.secoes (liga/desliga no editor); seção sem dado não aparece.
export function LojaView({ empresa, produtos = [], secoes = {}, preview = false, onAbrirProduto, pagamentoDisponivel = true }) {
  const aparencia = useMemo(() => resolverAparenciaLoja(empresa), [empresa])
  const { tema, fonte, capa, titulo, frase } = aparencia
  useEffect(() => { carregarFontesBio([aparencia.fonteId]) }, [aparencia.fonteId])
  const [chipAtivo, setChipAtivo] = useState(null)
  const [faqAberto, setFaqAberto] = useState(null)

  const cfgSec = normalizarSecoes(empresa.loja?.secoes)
  const wa = telefoneWa(empresa.loja?.suporte_whatsapp || empresa.telefone)
  const linkWa = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Olá! Vim pela loja da ${empresa.nome_empresa}`)}` : null
  const linkAgendar = empresa.agendamento_ativo && empresa.agendamento_slug && empresa.loja?.mostrar_experimental !== false
    ? `/agendar/${empresa.agendamento_slug}` : null
  const linkMapa = empresa.endereco_completo ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(empresa.endereco_completo)}` : null
  const local = [empresa.bairro, empresa.cidade].filter(Boolean).join(' · ')

  const grupos = GRUPOS.map((g) => ({ ...g, itens: produtos.filter((p) => p.tipo === g.tipo) })).filter((g) => g.itens.length)
  const primeiroGrupo = grupos[0]?.id
  const temPlano = grupos.some((g) => g.tipo === 'plano')

  // Destaques (estilo cardápio): primeiro os marcados com estrela no editor, depois os
  // mais vendidos. A seção aparece quando há item marcado ou quando a loja tem mais de
  // 4 itens. "Mais pedido" só aparece quando houve venda de verdade.
  const maisVendido = produtos.reduce((m, p) => ((p.vendas || 0) > (m?.vendas || 0) ? p : m), null)
  // Só o que o gestor marcou com estrela, no máximo 3: destaque que repete a lista inteira
  // não destaca nada e só alonga a página.
  const destaques = produtos.filter((p) => p.destaque).slice(0, 3)
  const seloDe = (p) => (maisVendido && p.id === maisVendido.id && (p.vendas || 0) > 0 ? 'Mais pedido' : null)

  // Seções: ligadas no editor E com conteúdo
  const passos = cfgSec.passos.map((p, i) => p || PASSOS_PADRAO[i])
  const mostraComoFunciona = cfgSec.como_funciona && temPlano
  const galeria = Array.isArray(secoes.galeria) ? secoes.galeria : []
  const mostraResultados = cfgSec.resultados && galeria.length > 0
  const depoimentos = Array.isArray(secoes.depoimentos) ? secoes.depoimentos : []
  const mostraDepoimentos = cfgSec.depoimentos && depoimentos.length > 0
  const aulas = Array.isArray(secoes.aulas) ? secoes.aulas : []
  const mostraHorarios = cfgSec.horarios && aulas.length > 0
  const faq = Array.isArray(secoes.faq) ? secoes.faq : []
  const mostraFaq = cfgSec.faq && faq.length > 0
  const sobre = (empresa.descricao || '').trim()
  const mostraSobre = cfgSec.sobre && (sobre || linkMapa || empresa.instagram_url)
  const mostraChamada = cfgSec.chamada_final && temPlano
  const avaliacao = secoes.avaliacao && secoes.avaliacao.total >= 3 ? secoes.avaliacao : null

  const abrir = (p) => { if (!preview && onAbrirProduto) onAbrirProduto(p) }
  const irPara = (id) => (e) => {
    e.preventDefault()
    setChipAtivo(id)
    // rola até a seção (também dentro da prévia do editor, que é um container com rolagem própria)
    rolarAte(document.getElementById(`lj-${id}`))
  }

  const aulasPorDia = aulas.reduce((acc, a) => {
    const k = a.dia_semana
    ;(acc[k] = acc[k] || []).push(a)
    return acc
  }, {})

  const chips = [
    ...grupos.map((g) => ({ id: g.id, titulo: g.menu || g.titulo })),
    mostraComoFunciona && { id: 'como', titulo: 'Como funciona' },
    mostraResultados && { id: 'resultados', titulo: 'Nosso espaço' },
    mostraDepoimentos && { id: 'depoimentos', titulo: 'Depoimentos' },
    mostraHorarios && { id: 'horarios', titulo: 'Horários' },
    mostraFaq && { id: 'faq', titulo: 'Dúvidas' },
    mostraSobre && { id: 'sobre', titulo: 'Sobre' },
  ].filter(Boolean)

  const Chip = ({ id, children }) => (
    <a className={`lj-chip ${chipAtivo === id ? 'lj-on' : ''}`} href={`#lj-${id}`} onClick={irPara(id)}>{children}</a>
  )

  // Indicador de seção ativa ao rolar: a aba sublinhada acompanha a seção que
  // está logo abaixo do menu, tanto na página real quanto na prévia do editor.
  const rootRef = useRef(null)
  const idsChips = chips.map((c) => c.id).join(',')
  useEffect(() => {
    const root = rootRef.current
    if (!root || !idsChips) return
    let pai = root.parentElement
    while (pai && pai !== document.body) {
      const { overflowY } = getComputedStyle(pai)
      if ((overflowY === 'auto' || overflowY === 'scroll') && pai.scrollHeight > pai.clientHeight) break
      pai = pai.parentElement
    }
    const alvo = pai && pai !== document.body ? pai : window
    const ids = idsChips.split(',')
    let agendado = false
    const medir = () => {
      agendado = false
      const linha = (alvo === window ? 0 : alvo.getBoundingClientRect().top) + ALTURA_MENU + 24
      let ativo = null
      for (const id of ids) {
        const el = document.getElementById(`lj-${id}`)
        if (el && el.getBoundingClientRect().top <= linha) ativo = id
      }
      setChipAtivo((atual) => (atual === ativo ? atual : ativo))
    }
    const onScroll = () => { if (!agendado) { agendado = true; requestAnimationFrame(medir) } }
    alvo.addEventListener('scroll', onScroll, { passive: true })
    medir()
    return () => alvo.removeEventListener('scroll', onScroll)
  }, [idsChips])
  const linkExterno = (e) => { if (preview) e.preventDefault() }

  return (
    <div ref={rootRef} className="lj-root" style={{ minHeight: preview ? '100%' : '100vh', ...varsTema(tema) }}>
      <EstilosLoja tema={tema} fonte={fonte} />

      {/* Capa */}
      <div className="lj-capa">
        {capa ? <div className="lj-capa-bg" style={{ backgroundImage: `url(${capa})` }} /> : <div className="lj-capa-sem" />}
        {capa && <div className="lj-capa-ov" />}
        <div className="lj-topo-acoes">
          {empresa.instagram_url && <a href={empresa.instagram_url} target="_blank" rel="noopener noreferrer" aria-label="Instagram" onClick={linkExterno}><Icon icon="mdi:instagram" width="20" /></a>}
          {linkWa && <a href={linkWa} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" onClick={linkExterno}><Icon icon="mdi:whatsapp" width="20" /></a>}
        </div>
      </div>

      <div className="lj-wrap">
        {/* Cartão da academia */}
        <div className="lj-cartao-wrap">
          <div className="lj-cartao">
            {empresa.logo_url
              ? <img className="lj-logo" src={empresa.logo_url} alt={empresa.nome_empresa} />
              : <div className="lj-logo lj-logo-fallback">{(empresa.nome_empresa || '?').trim().charAt(0).toUpperCase()}</div>}
            <h1 className="lj-h1">{titulo}</h1>
            {(local || (titulo !== empresa.nome_empresa)) && (
              <p className="lj-sub">{[titulo !== empresa.nome_empresa ? empresa.nome_empresa : null, local].filter(Boolean).join(' · ')}</p>
            )}
            {frase && <p className="lj-frase">{frase}</p>}
            {(avaliacao || produtos.length > 0) && (
              <div className="lj-info">
                {avaliacao && <span><Icon icon="mdi:star" width="15" className="lj-estrela" style={{ verticalAlign: '-2px' }} /> <b>{avaliacao.media.toFixed(1).replace('.', ',')}</b> ({avaliacao.total} {avaliacao.total === 1 ? 'avaliação' : 'avaliações'})</span>}
                {produtos.length > 0 && <span><b>{produtos.length}</b> {produtos.length === 1 ? 'opção disponível' : 'opções disponíveis'}</span>}
                {pagamentoDisponivel && <span>{[empresa.formas_pagamento?.pix !== false && 'Pix', empresa.formas_pagamento?.cartao && 'cartão', empresa.formas_pagamento?.boleto && 'boleto'].filter(Boolean).join(' e ')}</span>}
              </div>
            )}
            {(temPlano || linkAgendar) && (
              <div className="lj-ctas">
                {temPlano && <a className="lj-btn lj-btn-p" href="#lj-planos" onClick={irPara('planos')}><Icon icon="mdi:rocket-launch-outline" width="18" /> Quero me matricular</a>}
                {linkAgendar && <a className="lj-btn lj-btn-s" href={linkAgendar} onClick={linkExterno}><Icon icon="mdi:calendar-check" width="18" /> Aula experimental</a>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Abas de categoria */}
      {chips.length > 1 && (
        <nav className="lj-menu">
          <div className="lj-wrap lj-menu-in">
            {chips.map((c) => <Chip key={c.id} id={c.id}>{c.titulo}</Chip>)}
          </div>
        </nav>
      )}

      <main className="lj-wrap">
        {!pagamentoDisponivel && (
          <div className="lj-aviso"><Icon icon="mdi:information-outline" width="20" /><span>As compras online estão temporariamente indisponíveis. Fale com a academia pelo WhatsApp.</span></div>
        )}

        {produtos.length === 0 && (
          <div className="lj-vazio">
            <Icon icon="mdi:storefront-outline" width="46" style={{ opacity: 0.5 }} />
            <p style={{ margin: '10px 0 0', fontSize: '14px' }}>{preview ? 'Adicione itens para vê-los aqui.' : 'Nenhum item disponível no momento.'}</p>
          </div>
        )}

        {/* Destaques */}
        {destaques.length > 0 && (
          <section id="lj-destaques" className="lj-sec">
            <div className="lj-sec-h"><h2>Destaques</h2></div>
            <div className="lj-grid lj-grid-dest">
              {destaques.map((p) => <CardDestaque key={p.id} produto={p} selo={seloDe(p)} onClick={() => abrir(p)} />)}
            </div>
          </section>
        )}

        {/* Itens à venda */}
        {grupos.map((g) => (
          <section key={g.id} id={`lj-${g.id}`} className="lj-sec">
            <div className="lj-sec-h"><h2>{g.titulo}</h2><span>{g.itens.length} {g.itens.length === 1 ? 'opção' : 'opções'}</span></div>
            {g.tipo === 'plano' && <div className="lj-grid lj-grid-planos">{g.itens.map((p) => <CardPlano key={p.id} produto={p} onClick={() => abrir(p)} />)}</div>}
            {g.tipo === 'pacote' && <div className="lj-grid lj-grid-planos">{g.itens.map((p) => <CardPacote key={p.id} produto={p} onClick={() => abrir(p)} />)}</div>}
            {g.tipo === 'evento' && <div className="lj-grid">{g.itens.map((p) => <CardEvento key={p.id} produto={p} onClick={() => abrir(p)} />)}</div>}
            {g.tipo === 'produto' && <div className="lj-grid lj-grid-prod">{g.itens.map((p) => <CardProduto key={p.id} produto={p} selo={seloDe(p)} onClick={() => abrir(p)} />)}</div>}
          </section>
        ))}

        {/* Como funciona (só quando vende plano) */}
        {mostraComoFunciona && (
          <section id="lj-como" className="lj-sec">
            <div className="lj-sec-h"><h2>Como funciona</h2><span>Leva uns 2 minutos</span></div>
            <div className="lj-passos">
              {passos.map((p, i) => (
                <div key={i} className="lj-passo"><span className="lj-passo-n">{i + 1}</span><span>{p}</span></div>
              ))}
            </div>
          </section>
        )}

        {/* Resultados (galeria) */}
        {mostraResultados && (
          <section id="lj-resultados" className="lj-sec">
            <div className="lj-sec-h"><h2>Nosso espaço</h2><span>Conheça a estrutura</span></div>
            <CarrosselFotos fotos={galeria.slice(0, 8)} tema={tema} />
          </section>
        )}

        {/* Depoimentos */}
        {mostraDepoimentos && (
          <section id="lj-depoimentos" className="lj-sec">
            <div className="lj-sec-h"><h2>Quem já treina aqui</h2>{avaliacao && <span>nota média {avaliacao.media.toFixed(1).replace('.', ',')}</span>}</div>
            <div className="lj-grid lj-grid-dep">
              {depoimentos.slice(0, 6).map((d, i) => (
                <div key={i} className="lj-box lj-dep-card">
                  <Icon icon="mdi:format-quote-open" width="22" style={{ opacity: 0.35 }} />
                  <p>{d.comentario}</p>
                  <b>{d.nome}{d.nota ? <span> · nota {d.nota}</span> : null}</b>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Horários */}
        {mostraHorarios && (
          <section id="lj-horarios" className="lj-sec">
            <div className="lj-sec-h"><h2>Horários</h2><span>Grade da semana</span></div>
            <GradeHorarios aulasPorDia={aulasPorDia} />
          </section>
        )}

        {/* Dúvidas */}
        {mostraFaq && (
          <section id="lj-faq" className="lj-sec">
            <div className="lj-sec-h"><h2>Dúvidas frequentes</h2></div>
            <div className="lj-faq">
              {faq.map((f, i) => {
                const aberto = faqAberto === i
                return (
                  <div key={i} className={`lj-faq-item ${aberto ? 'lj-aberto' : ''}`}>
                    <Clicavel className="lj-faq-q" onClick={() => setFaqAberto(aberto ? null : i)}>
                      <span>{f.pergunta}</span>
                      <Icon icon="mdi:chevron-down" width="20" style={{ transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                    </Clicavel>
                    {aberto && <div className="lj-faq-a">{f.resposta}</div>}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Sobre e contato */}
        {mostraSobre && (
          <section id="lj-sobre" className="lj-sec">
            <div className="lj-two">
              {sobre && (
                <div className="lj-box">
                  <h3><Icon icon="mdi:information-outline" width="18" /> Sobre a {empresa.nome_empresa}</h3>
                  <p>{sobre}</p>
                </div>
              )}
              {(linkMapa || linkWa || empresa.instagram_url) && (
                <div className="lj-box">
                  <h3><Icon icon="mdi:map-marker-outline" width="18" /> Contato e localização</h3>
                  {empresa.endereco_completo && <p>{empresa.endereco_completo}</p>}
                  <div className="lj-contato-btns">
                    {linkMapa && <a className="lj-btn lj-btn-s" href={linkMapa} target="_blank" rel="noopener noreferrer" onClick={linkExterno}><Icon icon="mdi:directions" width="18" /> Como chegar</a>}
                    {empresa.instagram_url && <a className="lj-btn lj-btn-s" href={empresa.instagram_url} target="_blank" rel="noopener noreferrer" onClick={linkExterno}><Icon icon="mdi:instagram" width="18" /> Instagram</a>}
                    {linkWa && <a className="lj-btn lj-btn-s" href={linkWa} target="_blank" rel="noopener noreferrer" onClick={linkExterno}><Icon icon="mdi:whatsapp" width="18" /> WhatsApp</a>}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Chamada final (só quando vende plano) */}
        {mostraChamada && (
          <section className="lj-sec">
            <div className="lj-cta-final">
              <h2>{secoes.cta_titulo || 'Pronto para começar?'}</h2>
              <p>{secoes.cta_texto || 'Escolha seu plano, pague em 2 minutos e garanta sua vaga.'}</p>
              <div className="lj-ctas">
                <a className="lj-btn lj-btn-inv" href="#lj-planos" onClick={irPara('planos')}><Icon icon="mdi:rocket-launch-outline" width="18" /> Quero me matricular</a>
                {linkWa && <a className="lj-btn lj-btn-ghost" href={linkWa} target="_blank" rel="noopener noreferrer" onClick={linkExterno}><Icon icon="mdi:whatsapp" width="18" /> Tirar uma dúvida</a>}
              </div>
            </div>
          </section>
        )}

        {!mostraChamada && linkWa && (
          <a className="lj-wa" href={linkWa} target="_blank" rel="noopener noreferrer" onClick={linkExterno}>
            <Icon icon="mdi:whatsapp" width="22" />
            <span style={{ flex: 1 }}>Dúvidas? Fale com a gente no WhatsApp</span>
            <Icon icon="mdi:chevron-right" width="18" style={{ opacity: 0.7 }} />
          </a>
        )}

        <div className="lj-foot">Loja criada com <a href="https://www.mensalli.com.br" target="_blank" rel="noopener noreferrer">Mensalli</a></div>
      </main>
    </div>
  )
}

// Carrossel de fotos (Resultados), no estilo do carrossel da bio: slides em retrato,
// rolagem por toque com encaixe, setas e bolinhas. No celular um slide por vez; em
// container largo, três (ver .lj-slide no CSS).
function CarrosselFotos({ fotos, tema }) {
  const faixa = useRef(null)
  const [atual, setAtual] = useState(0)

  const passo = () => {
    const el = faixa.current
    const largura = el?.firstChild?.getBoundingClientRect().width || 1
    return largura + 10
  }
  // quantos slides cabem na faixa (1 no celular, 3 em container largo)
  const porVista = () => { const el = faixa.current; return el ? Math.max(1, Math.round(el.clientWidth / passo())) : 1 }
  const [ultimo, setUltimo] = useState(fotos.length - 1)
  const aoRolar = () => { const el = faixa.current; if (el) { setAtual(Math.round(el.scrollLeft / passo())); setUltimo(Math.max(0, fotos.length - porVista())) } }
  const ir = (i) => faixa.current?.scrollTo({ left: i * passo(), behavior: 'smooth' })

  useEffect(() => {
    setAtual(0); faixa.current?.scrollTo({ left: 0 })
    setUltimo(Math.max(0, fotos.length - porVista()))
    const onResize = () => setUltimo(Math.max(0, fotos.length - porVista()))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotos.length])
  return (
    <div>
      <div style={{ position: 'relative' }}>
        <div ref={faixa} onScroll={aoRolar} className="lj-faixa">
          {fotos.map((url, i) => <img key={url + i} className="lj-slide" src={url} alt="" loading="lazy" />)}
        </div>
        {atual > 0 && (
          <button type="button" aria-label="Anterior" onClick={() => ir(atual - 1)} className="lj-seta" style={{ left: '10px' }}>
            <Icon icon="mdi:chevron-left" width="24" />
          </button>
        )}
        {atual < ultimo && (
          <button type="button" aria-label="Próximo" onClick={() => ir(atual + 1)} className="lj-seta" style={{ right: '10px' }}>
            <Icon icon="mdi:chevron-right" width="24" />
          </button>
        )}
      </div>
      {fotos.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '12px' }}>
          {fotos.map((_, i) => (
            <button key={i} type="button" aria-label={`Foto ${i + 1}`} onClick={() => ir(i)}
              style={{ width: i === atual ? '22px' : '7px', height: '7px', borderRadius: '999px', border: 'none', padding: 0, cursor: 'pointer',
                backgroundColor: i === atual ? tema.destaque : tema.textoSuave, opacity: i === atual ? 1 : 0.4, transition: 'all 0.2s ease' }} />
          ))}
        </div>
      )}
    </div>
  )
}

// Grade da semana: abas por dia (um dia por vez) e uma linha por horário, com as
// turmas do mesmo horário agrupadas. Começa no dia de hoje quando ele tem aula.
function GradeHorarios({ aulasPorDia }) {
  const dias = Object.keys(aulasPorDia).map(Number).sort((a, b) => a - b)
  const hoje = new Date().getDay()
  const [dia, setDia] = useState(dias.includes(hoje) ? hoje : dias[0])
  const [verTudo, setVerTudo] = useState(false)
  const LIMITE = 8

  // agrupa por horário e tira repetições de nome
  const linhas = Object.values((aulasPorDia[dia] || []).reduce((acc, a) => {
    const hora = String(a.horario || '').slice(0, 5)
    const nome = (a.modalidade || a.descricao || 'Aula').trim()
    const l = acc[hora] || (acc[hora] = { hora, nomes: [] })
    if (!l.nomes.includes(nome)) l.nomes.push(nome)
    return acc
  }, {})).sort((a, b) => a.hora.localeCompare(b.hora))
  const visiveis = verTudo ? linhas : linhas.slice(0, LIMITE)

  return (
    <div className="lj-box" style={{ padding: '14px 16px 16px' }}>
      <div className="lj-hor-dias">
        {dias.map((d) => (
          <Clicavel key={d} className={`lj-hor-aba ${d === dia ? 'lj-on' : ''}`} onClick={() => { setDia(d); setVerTudo(false) }}>
            {DIAS_CURTO[d]}
          </Clicavel>
        ))}
      </div>
      <div className="lj-hor-lista">
        {visiveis.map((l) => (
          <div key={l.hora} className="lj-hor-linha">
            <b>{l.hora}</b>
            <span>{l.nomes.join(' · ')}</span>
          </div>
        ))}
      </div>
      {linhas.length > LIMITE && (
        <Clicavel className="lj-hor-mais" onClick={() => setVerTudo((v) => !v)}>
          {verTudo ? 'Ver menos' : `Ver todos os ${linhas.length} horários`}
          <Icon icon={verTudo ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="18" />
        </Clicavel>
      )}
    </div>
  )
}

export function TelaCarregando() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f6f7f9' }}>
      <Icon icon="eos-icons:loading" width="40" style={{ color: '#94a3b8' }} />
    </div>
  )
}

export function TelaIndisponivel({ titulo = 'Loja indisponível', mensagem, telefone }) {
  const wa = telefoneWa(telefone)
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f4f5', padding: '24px', textAlign: 'center' }}>
      <div style={{ maxWidth: '360px' }}>
        <Icon icon="mdi:storefront-remove-outline" width="56" style={{ color: '#a1a1aa' }} />
        <h1 style={{ fontSize: '20px', color: '#27272a', marginTop: '14px' }}>{titulo}</h1>
        <p style={{ fontSize: '14px', color: '#71717a', marginTop: '6px' }}>{mensagem || 'Esta página não existe ou está fora do ar.'}</p>
        {wa && (
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '18px', padding: '11px 16px', borderRadius: '12px', backgroundColor: WA_VERDE, color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '14px' }}>
            <Icon icon="mdi:whatsapp" width="20" /> Falar no WhatsApp
          </a>
        )}
      </div>
    </div>
  )
}

export default function LojaVitrine() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [query] = useSearchParams()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelado = false
    setLoading(true)
    lojaApi.vitrine(slug)
      .then((json) => { if (!cancelado) setDados(json) })
      .catch((e) => { if (!cancelado) setErro(e) })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [slug])

  useEffect(() => {
    if (dados?.empresa) document.title = `${dados.empresa.loja?.titulo || 'Loja'} · ${dados.empresa.nome_empresa}`
  }, [dados])

  if (loading) return <TelaCarregando />
  if (erro || !dados?.empresa) return <TelaIndisponivel mensagem={erro?.message} />

  const origem = query.get('o') || 'direto'
  return (
    <LojaView
      empresa={dados.empresa}
      produtos={dados.produtos || []}
      secoes={dados.secoes || {}}
      pagamentoDisponivel={dados.pagamento_disponivel !== false}
      onAbrirProduto={(p) => navigate(`/loja/${slug}/p/${p.id}${origem !== 'direto' ? `?o=${origem}` : ''}`)}
    />
  )
}
