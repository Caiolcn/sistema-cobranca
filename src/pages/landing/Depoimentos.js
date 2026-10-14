import { useCallback, useEffect, useRef, useState } from 'react'
import { MdPlayArrow, MdClose, MdArrowForward } from 'react-icons/md'

// Depoimentos em video (9:16). Enquanto os arquivos definitivos nao chegam,
// os slots ficam como placeholder identificado — nada de nome ou fala inventada.
// Para publicar um depoimento, preencha o slot:
//   nome:    nome verdadeiro do cliente (autorizado)
//   nicho:   profissao ou estabelecimento
//   frase:   trecho LITERAL do video (opcional)
//   video:   /depoimentos/arquivo.mp4  (em public/)
//   poster:  /depoimentos/arquivo.jpg  (frame extraido do proprio video)
//   legenda: /depoimentos/arquivo.vtt  (opcional)
export const DEPOIMENTOS = [
  { nome: 'Carol Ribeiro', nicho: 'Studio de Pilates', frase: null,
    video: '/depoimentos/carol-ribeiro.mp4', poster: '/depoimentos/carol-ribeiro.jpg', legenda: null },
  { nome: 'Treinador George', nicho: 'Escolinha Portovilla', frase: null,
    video: '/depoimentos/treinador-george.mp4', poster: '/depoimentos/treinador-george.jpg', legenda: null },
  { nome: 'Treinador Maguilla', nicho: 'CT Personal Fight Trainer', frase: null,
    video: '/depoimentos/treinador-maguilla.mp4', poster: '/depoimentos/treinador-maguilla.jpg', legenda: null }
]

export default function Depoimentos({ onCta }) {
  const [aberto, setAberto] = useState(null)
  const gatilho = useRef(null)

  function abrir(i, e) {
    gatilho.current = e.currentTarget
    setAberto(i)
  }

  const fechar = useCallback(() => {
    setAberto(null)
    // devolve o foco pro card que abriu o modal
    if (gatilho.current) gatilho.current.focus()
  }, [])

  return (
    <section id="depoimentos" className="lp2-sec lp2-dep" aria-labelledby="dep-titulo">
      <div className="lp2-wrap lp2-dep-grid">
        <div>
          <p className="lp2-eyebrow">Clientes reais</p>
          <h2 id="dep-titulo" className="lp2-h2">Quem já usa o Mensalli conta melhor que a gente.</h2>
          <p className="lp2-lead">Profissionais e negócios que vivem de mensalidade mostram como o Mensalli simplificou a rotina.</p>
          <button type="button" className="lp2-link" onClick={onCta}>
            Experimente também <MdArrowForward size={18} />
          </button>
        </div>

        <div className="lp2-vids">
          {DEPOIMENTOS.map((d, i) => {
            const rotulo = d.nome ? `${d.nome}${d.nicho ? `, ${d.nicho}` : ''}` : `Depoimento ${i + 1}`
            return (
              <button key={i} type="button" className={`lp2-vid ${i === 0 ? 'lp2-vid--main' : 'lp2-vid--sec'}`}
                onClick={e => abrir(i, e)} aria-label={`Assistir depoimento: ${rotulo}`}>
                {d.poster && <img src={d.poster} alt="" loading="lazy" decoding="async" />}
                {!d.nome && <span className="lp2-vid-tag">Depoimento {i + 1}</span>}
                <span className="lp2-vid-play"><MdPlayArrow size={i === 0 ? 30 : 26} /></span>
                <span className="lp2-vid-meta">
                  {d.frase && <q>{d.frase}</q>}
                  <strong>{d.nome || 'Nome do cliente'}</strong>
                  <span>{d.nicho || 'Negócio · nicho'}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {aberto !== null && <ModalVideo dep={DEPOIMENTOS[aberto]} indice={aberto} onClose={fechar} />}
    </section>
  )
}

function ModalVideo({ dep, indice, onClose }) {
  const caixa = useRef(null)
  const btnFechar = useRef(null)
  const titulo = dep.nome || `Depoimento ${indice + 1}`

  useEffect(() => {
    const overflowAntes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    btnFechar.current?.focus()

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab') return
      // prende o Tab dentro do modal (botao fechar + controles do video)
      const focaveis = caixa.current?.querySelectorAll('button, video[controls], [tabindex]:not([tabindex="-1"])')
      if (!focaveis || !focaveis.length) return
      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflowAntes
    }
  }, [onClose])

  return (
    <div className="lp2-modal" role="dialog" aria-modal="true" aria-label={`Vídeo: ${titulo}`}
      ref={caixa} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <button ref={btnFechar} type="button" className="lp2-modal-close" onClick={onClose} aria-label="Fechar vídeo">
        <MdClose size={24} />
      </button>
      <div className="lp2-modal-box">
        {dep.video ? (
          // so baixa o video quando o modal abre (clique explicito do visitante)
          // nodownload tira o "Baixar" do menu do player; o onContextMenu tira o
          // "Salvar vídeo como" do clique direito
          <video src={dep.video} poster={dep.poster || undefined} controls controlsList="nodownload" autoPlay playsInline preload="metadata"
            onContextMenu={e => e.preventDefault()}>
            {dep.legenda && <track kind="captions" src={dep.legenda} srcLang="pt-BR" label="Português" default />}
          </video>
        ) : (
          <div className="lp2-modal-empty">
            <strong>{titulo}</strong>
            <span>Vídeo ainda não adicionado.</span>
          </div>
        )}
      </div>
    </div>
  )
}
