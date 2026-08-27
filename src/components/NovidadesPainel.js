import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useUser } from '../contexts/UserContext'
import Modal from '../design-system/components/Modal'
import Button from '../design-system/components/Button'
import { carregarNovidades, marcarVistas, registrarClique } from '../services/novidadesService'
import './NovidadesPainel.css'

/* --------------------------------------------------------------------------
   "O que mudou no Mensalli" — barra na Home + modal de detalhe.

   Existe porque tem gestor que usa o produto há meses e só conhece a cobrança
   automática: agenda, portal, formas de pagamento e página de links passam
   despercebidos. O changelog serve pra isso — não pra registro histórico.

   Duas superfícies, de propósito:

     BARRA  — permanente, discreta, uma novidade por vez com setas. É o estado
              padrão, e fica na dashboard mesmo depois de fechar o modal.

     MODAL  — só abre sozinho quando existe novidade marcada como `destaque`
              que a pessoa ainda não viu. Pop-up toda semana vira reflexo de
              fechar; o destaque é pra entrega grande, no máximo uma por mês.

   O selo "novo pra você" só some quando a pessoa realmente abriu o detalhe
   daquele item — não por ter carregado a Home. Marcar como visto na
   renderização esvazia o selo e ele deixa de significar qualquer coisa.

   NÃO mostramos a data ao lado da tag. `publicado_em` guarda quando a feature
   REALMENTE subiu (as antigas vieram do histórico do git) e também é a chave do
   agendamento — então uma atualização anunciada hoje pode carregar jun/2026 e
   parecer velha na hora de estrear. A data continua viva no /admin, que é onde
   ela serve pra alguma coisa.
-------------------------------------------------------------------------- */

// Quantas bolinhas de navegação a barra mostra. Acima disso o changelog vira
// arquivo, não novidade — e a fileira de dots fica ilegível.
const MAX_DOTS = 10

// Sólido em vez de pastel: a 11px em caixa alta, o pastel some ao lado do
// título em negrito. Todos passam de 5:1 de contraste (AA).
const CORES_TAG = {
  'Novidade': { bg: '#047857', cor: '#ffffff' },
  'Melhoria': { bg: '#1d4ed8', cor: '#ffffff' },
  'Correção': { bg: '#b45309', cor: '#ffffff' },
}

function Chevron({ direcao }) {
  // SVG inline em vez de Iconify: aqui o ícone é a única affordance do botão —
  // se a API do Iconify demorar, a seta some e a barra fica sem navegação.
  const d = direcao === 'esquerda' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

// `icone` entra DENTRO da pill. Como selo separado ao lado dela ele ficava solto
// na linha: 26px de caixa ao lado de uma pill de 20px, dois centros ópticos
// diferentes, e nenhuma relação hierárquica clara entre os dois.
function TagNovidade({ tag, icone }) {
  const c = CORES_TAG[tag] || CORES_TAG['Novidade']
  return (
    <span className="nov-tag" style={{ background: c.bg, color: c.cor }}>
      {icone && <Icon icon={icone} width="12" height="12" />}
      {tag}
    </span>
  )
}

export default function NovidadesPainel() {
  const navigate = useNavigate()
  const { realUserId, trialStatus } = useUser()
  const planoPago = !!trialStatus?.planoPago

  const [novidades, setNovidades] = useState([])
  const [carregado, setCarregado] = useState(false)
  const [indice, setIndice] = useState(0)

  // Lista que o modal está exibindo no momento (abertura automática mostra só
  // as não vistas; abertura manual mostra o histórico inteiro).
  const [modalLista, setModalLista] = useState(null)
  const [slide, setSlide] = useState(0)
  // Só o que a pessoa passou o olho vira "visto" — fechar no primeiro slide não
  // pode queimar as outras oito novidades.
  const [slidesVistos, setSlidesVistos] = useState(() => new Set())

  useEffect(() => {
    if (!realUserId) return
    let cancelado = false

    carregarNovidades(realUserId, { planoPago }).then((lista) => {
      if (cancelado) return
      setNovidades(lista)
      setCarregado(true)

      const naoVistas = lista.filter((n) => !n.visto)
      if (naoVistas.some((n) => n.destaque)) {
        setModalLista(naoVistas)
        setSlide(0)
        setSlidesVistos(new Set([0]))
      }
    })

    return () => { cancelado = true }
  }, [realUserId, planoPago])

  // Sem contador numérico ao lado de "Atualizações": ele repetia um sinal que a
  // barra já dá em dois lugares — o selo "novo pra você" no item e as bolinhas
  // roxas das não vistas. Três indicadores pra mesma informação.

  const fecharModal = useCallback(() => {
    const lista = modalLista || []
    const ids = [...slidesVistos].map((i) => lista[i]?.id).filter(Boolean)

    if (ids.length) {
      marcarVistas(realUserId, ids)
      // Estado local sem refetch: a barra atualiza o selo na hora.
      setNovidades((atual) => atual.map((n) => (ids.includes(n.id) ? { ...n, visto: true } : n)))
    }

    setModalLista(null)
    setSlidesVistos(new Set())
  }, [modalLista, slidesVistos, realUserId])

  const abrirDetalhe = useCallback((novidadeIndice) => {
    setModalLista(novidades)
    setSlide(novidadeIndice)
    setSlidesVistos(new Set([novidadeIndice]))
  }, [novidades])

  const irParaSlide = useCallback((novo) => {
    setSlide(novo)
    setSlidesVistos((atual) => new Set(atual).add(novo))
  }, [])

  const seguirCta = useCallback((novidade) => {
    if (!novidade?.cta_rota) return
    registrarClique(realUserId, novidade.id)
    setNovidades((atual) =>
      atual.map((n) => (n.id === novidade.id ? { ...n, visto: true, clicado: true } : n))
    )
    setModalLista(null)
    navigate(novidade.cta_rota)
  }, [realUserId, navigate])

  // Reserva a altura da barra enquanto o dado não chegou. Com o prefetch do
  // Dashboard isto quase nunca aparece — é a rede de segurança pro caso de a
  // Home carregar antes da busca terminar, pra barra não entrar empurrando o
  // card-herói pra baixo depois que a pessoa já está lendo a tela.
  if (!carregado) return <div className="nov-barra nov-barra-esqueleto" aria-hidden="true" />
  if (novidades.length === 0) return null

  const atual = novidades[indice] || novidades[0]
  const dots = novidades.slice(0, MAX_DOTS)
  const noModal = modalLista?.[slide]

  return (
    <>
      {/* ---------- barra permanente ---------- */}
      <div className="nov-barra">
        <div className="nov-barra-marca">
          <Icon icon="mdi:star-four-points-outline" width="18" />
          <span>Atualizações</span>
        </div>

        <button type="button" className="nov-barra-conteudo" onClick={() => abrirDetalhe(indice)}>
          <span className="nov-barra-linha">
            <TagNovidade tag={atual.tag} />
            {!atual.visto && <span className="nov-barra-novo">novo pra você</span>}
            <span className="nov-barra-titulo">{atual.titulo}</span>
          </span>
          <span className="nov-barra-resumo">{atual.resumo}</span>
        </button>

        <div className="nov-barra-acoes">
          {atual.cta_rota && (
            <Button variant="outline" size="sm" onClick={() => seguirCta(atual)}>
              {atual.cta_label || 'Ver'}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => abrirDetalhe(indice)}>
            Ver detalhes
          </Button>
        </div>

        <div className="nov-barra-nav">
          <button
            type="button"
            className="nov-nav-seta"
            aria-label="Atualização anterior"
            disabled={indice === 0}
            onClick={() => setIndice((i) => Math.max(0, i - 1))}
          >
            <Chevron direcao="esquerda" />
          </button>

          <div className="nov-dots">
            {dots.map((n, i) => (
              <button
                key={n.id}
                type="button"
                aria-label={`Atualização ${i + 1}: ${n.titulo}`}
                className={`nov-dot ${i === indice ? 'ativo' : ''} ${!n.visto ? 'novo' : ''}`}
                onClick={() => setIndice(i)}
              />
            ))}
          </div>

          <button
            type="button"
            className="nov-nav-seta"
            aria-label="Próxima atualização"
            disabled={indice >= novidades.length - 1}
            onClick={() => setIndice((i) => Math.min(novidades.length - 1, i + 1))}
          >
            <Chevron direcao="direita" />
          </button>
        </div>
      </div>

      {/* ---------- modal de detalhe ---------- */}
      <Modal
        isOpen={!!noModal}
        onClose={fecharModal}
        hideHeader
        size="md"
        centered
        className="nov-modal"
        aria-label="Atualizações do Mensalli"
      >
        {noModal && (
          <>
            {/* Cabeçalho enxuto: uma etiqueta e os segmentos de progresso. O
                título grande "O que mudou no Mensalli" saiu daqui — competia com
                o título da própria novidade e empurrava o conteúdo pra baixo.
                Quem manda no topo agora é o nome da entrega. */}
            <div className="nov-modal-topo">
              <div className="nov-modal-selo">
                <span className="nov-modal-ponto" />
                Atualizações do Mensalli
              </div>

              {/* Único indicador de posição do modal. Os dots do rodapé saíram:
                  segmentos + Voltar/Avançar davam três controles pra mesma coisa. */}
              <div className="nov-modal-progresso">
                {modalLista.map((n, i) => (
                  <button
                    key={n.id}
                    type="button"
                    aria-label={`Ir para: ${n.titulo}`}
                    className={`nov-seg ${i <= slide ? 'cheio' : ''}`}
                    onClick={() => irParaSlide(i)}
                  />
                ))}
              </div>

              <button
                type="button"
                className="nov-modal-fechar"
                onClick={fecharModal}
                aria-label="Fechar atualizações"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="nov-modal-corpo">
              <div className="nov-modal-linha">
                <TagNovidade tag={noModal.tag} icone={noModal.icone} />
                {!noModal.visto && <span className="nov-barra-novo">novo pra você</span>}
              </div>

              <h2 className="nov-modal-titulo">{noModal.titulo}</h2>

              {/* Um texto só. O resumo já apareceu na barra da Home; repetir ele
                  aqui antes do parágrafo era a mesma frase duas vezes na mesma tela. */}
              <p className="nov-modal-descricao">{noModal.descricao || noModal.resumo}</p>

              {/* O print/GIF fecha o corpo: o texto diz o que mudou, a imagem
                  mostra. Só entra quando existe de verdade — moldura vazia com um
                  ícone no meio lia como placeholder e piorava o que devia ajudar.
                  Quem publica vê "sem print" na lista do /admin pra completar. */}
              {noModal.imagem_url && (
                <div className="nov-modal-midia">
                  <img src={noModal.imagem_url} alt={`Prévia: ${noModal.titulo}`} />
                </div>
              )}
            </div>

            <div className="nov-modal-rodape">
              {/* CTA da feature à esquerda, navegação do modal à direita: são duas
                  ações de natureza diferente e estavam disputando o mesmo eixo. */}
              {noModal.cta_rota ? (
                <Button
                  variant="outline"
                  iconRight="mdi:arrow-right"
                  onClick={() => seguirCta(noModal)}
                >
                  {noModal.cta_label || 'Ver na prática'}
                </Button>
              ) : <span />}

              <div className="nov-modal-nav">
                {/* Sempre na tela, desabilitado no primeiro slide. Aparecendo só a
                    partir do segundo, o rodapé mudava de composição a cada avanço. */}
                <Button
                  variant="ghost"
                  className="nov-btn-anterior"
                  icon="mdi:chevron-left"
                  disabled={slide === 0}
                  onClick={() => irParaSlide(slide - 1)}
                >
                  Anterior
                </Button>

                {slide < modalLista.length - 1 ? (
                  <Button variant="secondary" iconRight="mdi:chevron-right"
                    onClick={() => irParaSlide(slide + 1)}>
                    Próxima
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={fecharModal}>
                    Entendi
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </Modal>
    </>
  )
}
