import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { useUser } from '../contexts/UserContext'
import Modal from '../design-system/components/Modal'
import Button from '../design-system/components/Button'
import {
  carregarNovidades,
  marcarVistas,
  registrarClique,
  dispensarNovidades,
} from '../services/novidadesService'
import './NovidadesPainel.css'

/* --------------------------------------------------------------------------
   "O que mudou no Mensalli" — barra na Home + modal de detalhe.

   Existe porque tem gestor que usa o produto há meses e só conhece a cobrança
   automática: agenda, portal, formas de pagamento e página de links passam
   despercebidos. O changelog serve pra isso — não pra registro histórico.

   Duas superfícies, de propósito:

     BARRA  — permanente, discreta, uma novidade por vez com setas. É o estado
              padrão, e fica na dashboard mesmo depois de fechar o modal.

     MODAL  — abre sozinho quando existe novidade publicada DEPOIS da última
              vez que a pessoa fechou o aviso, com as MAX_NOVIDADES mais
              recentes. Fechar grava a marca e desarma: até a próxima
              publicação, não volta. Não tem flag pra ligar à mão — publicar
              já é o gatilho.

   Duas datas, duas perguntas diferentes, e é isso que faz a regra funcionar:

     usuarios.novidades_dispensadas_em  — "quando ela fechou o aviso"
     novidades_lidas                    — "quais novidades ela abriu"

   Fechar o pop-up responde só a primeira. Se respondesse as duas (marcando como
   lida toda novidade do carrossel), o selo "novo pra você" da barra sumiria de
   itens que a pessoa nunca abriu e deixaria de significar qualquer coisa.

   O selo "novo pra você" só some quando a pessoa realmente abriu o detalhe
   daquele item — não por ter carregado a Home. Marcar como visto na
   renderização esvazia o selo e ele deixa de significar qualquer coisa.

   NÃO mostramos a data ao lado da tag. `publicado_em` guarda quando a feature
   REALMENTE subiu (as antigas vieram do histórico do git) e também é a chave do
   agendamento — então uma atualização anunciada hoje pode carregar jun/2026 e
   parecer velha na hora de estrear. A data continua viva no /admin, que é onde
   ela serve pra alguma coisa.
-------------------------------------------------------------------------- */

/* Quantas novidades o painel expõe — uma constante só, porque a barra e o modal
   têm que contar a MESMA história. Eram dois números (10 bolinhas na barra, 4
   slides no modal) e a diferença aparecia na tela: dez bolinhas prometendo dez
   itens, quatro segmentos entregando quatro.

   O teto existe pelo mesmo motivo nos dois lugares. Com 16 novidades ativas, a
   fileira de dots fica ilegível e a barra de progresso do modal vira 16
   tracinhos de 2px, com "Próxima" pedindo 15 cliques pra chegar no fim. E na
   abertura automática é pior: conta nova não viu NADA, então "todas as não
   vistas" era o catálogo inteiro na frente de quem ainda nem conectou o
   WhatsApp. Ninguém passa 16 slides — passa dois e fecha, e aí o pop-up gastou
   a única chance que tinha de anunciar o destaque.

   O que fica de fora não se perde: continua no /admin, e volta pro painel na
   semana em que for publicado. Aqui é changelog recente, não arquivo. */
const MAX_NOVIDADES = 4

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

  // Lista que o modal está exibindo no momento — MAX_NOVIDADES nas duas
  // aberturas. Automática: as não vistas, destaque na frente. Manual: as mesmas
  // que a barra mostra, abertas no item que a pessoa clicou.
  const [modalLista, setModalLista] = useState(null)
  const [slide, setSlide] = useState(0)
  // Só o que a pessoa passou o olho vira "visto" — fechar no primeiro slide não
  // pode queimar as outras oito novidades.
  const [slidesVistos, setSlidesVistos] = useState(() => new Set())
  // Esta abertura foi o anúncio automático, ou a pessoa clicou na barra? Só a
  // automática grava a marca de dispensa ao sair. Ver `persistirVistos`.
  const [anuncioAberto, setAnuncioAberto] = useState(false)

  useEffect(() => {
    if (!realUserId) return
    let cancelado = false

    carregarNovidades(realUserId, { planoPago }).then((dados) => {
      if (cancelado) return
      const { lista, dispensadoEm, dispensaDisponivel } = dados
      setNovidades(lista)
      setCarregado(true)

      // Sem a coluna de dispensa (migração pendente) não há onde registrar o
      // fechamento — e um pop-up que não sabe que foi fechado reabre em toda
      // montagem da Home. Fica desligado até a migração rodar; a barra e o selo
      // seguem funcionando.
      if (!dispensaDisponivel) return

      /* O gatilho é a DATA, não uma flag: tudo publicado depois do último
         fechamento é novidade pra esta pessoa. Conta nova tem a marca nula,
         então tudo conta e ela recebe um anúncio só, com as mais recentes.

         Repare que `visto` NÃO entra aqui. Ele responde "abriu o detalhe deste
         item", que é outra pergunta: quem leu uma novidade pela barra durante a
         semana continua recebendo o anúncio da leva, e quem fechou o anúncio sem
         ler nada continua com o selo "novo pra você" nos itens. */
      const marca = dispensadoEm ? new Date(dispensadoEm) : null
      const novas = lista.filter((n) => !marca || new Date(n.publicado_em) > marca)
      if (!novas.length) return

      // `lista` já vem da mais recente pra mais antiga, então o corte descarta
      // as mais velhas. `destaque` deixou de destravar o pop-up e virou só
      // ordenação: marcado no /admin, o item encabeça o carrossel da semana.
      const destaques = novas.filter((n) => n.destaque)
      const resto = novas.filter((n) => !n.destaque)
      setModalLista([...destaques, ...resto].slice(0, MAX_NOVIDADES))
      setSlide(0)
      setSlidesVistos(new Set([0]))
      setAnuncioAberto(true)
    })

    return () => { cancelado = true }
  }, [realUserId, planoPago])

  // Sem contador numérico ao lado de "Atualizações": ele repetia um sinal que a
  // barra já dá em dois lugares — o selo "novo pra você" no item e as bolinhas
  // roxas das não vistas. Três indicadores pra mesma informação.

  /* Fecha o modal por dentro. Roda nas DUAS saídas — o X e o CTA da feature.
     Sair pelo botão da feature descartava o `slidesVistos`: quem avançava até o
     slide 2 e clicava no CTA dele perdia os slides 0 e 1 que já tinha lido.

     Duas gravações independentes, porque respondem perguntas diferentes:

       marcarVistas       — só os slides que a pessoa realmente abriu. É o que
                            apaga o selo "novo pra você" daquele item na barra.
       dispensarNovidades — só na abertura automática. É o que desarma o pop-up
                            até a próxima publicação.

     Fosse uma gravação só, fechar o anúncio marcaria como lidas quatro novidades
     que a pessoa talvez nem tenha passado — e o selo da barra viraria enfeite. */
  const persistirVistos = useCallback(() => {
    const lista = modalLista || []
    const ids = [...slidesVistos].map((i) => lista[i]?.id).filter(Boolean)

    if (ids.length) {
      marcarVistas(realUserId, ids)
      // Estado local sem refetch: a barra atualiza o selo na hora.
      setNovidades((atual) => atual.map((n) => (ids.includes(n.id) ? { ...n, visto: true } : n)))
    }

    if (anuncioAberto) dispensarNovidades(realUserId)

    setSlidesVistos(new Set())
    setAnuncioAberto(false)
  }, [modalLista, slidesVistos, anuncioAberto, realUserId])

  const fecharModal = useCallback(() => {
    persistirVistos()
    setModalLista(null)
  }, [persistirVistos])

  const abrirDetalhe = useCallback((novidadeIndice) => {
    // Exatamente as mesmas novidades que a barra mostra, abertas no item
    // clicado. O modal aqui é a barra expandida, não uma segunda lista: quatro
    // bolinhas lá viram quatro segmentos aqui, e a terceira bolinha abre no
    // terceiro segmento. Uma janela deslizante (`slice(indice, indice + N)`)
    // daria um total diferente a cada item clicado — 4 segmentos no primeiro,
    // 1 no último — e a posição deixaria de bater com a bolinha de origem.
    setModalLista(novidades.slice(0, MAX_NOVIDADES))
    setSlide(novidadeIndice)
    setSlidesVistos(new Set([novidadeIndice]))
    // Abertura manual: a pessoa foi atrás. Não conta como "dispensou o aviso" —
    // o anúncio automático da leva continua devendo aparecer.
    setAnuncioAberto(false)
  }, [novidades])

  const irParaSlide = useCallback((novo) => {
    setSlide(novo)
    setSlidesVistos((atual) => new Set(atual).add(novo))
  }, [])

  const seguirCta = useCallback((novidade) => {
    if (!novidade?.cta_rota) return
    // Também é saída do modal: leva junto o que já foi lido. Chamado da barra da
    // Home o `persistirVistos` é inócuo — sem modal aberto não há slide pendente.
    persistirVistos()
    registrarClique(realUserId, novidade.id)
    setNovidades((atual) =>
      atual.map((n) => (n.id === novidade.id ? { ...n, visto: true, clicado: true } : n))
    )
    setModalLista(null)
    navigate(novidade.cta_rota)
  }, [persistirVistos, realUserId, navigate])

  // Reserva a altura da barra enquanto o dado não chegou. Com o prefetch do
  // Dashboard isto quase nunca aparece — é a rede de segurança pro caso de a
  // Home carregar antes da busca terminar, pra barra não entrar empurrando o
  // card-herói pra baixo depois que a pessoa já está lendo a tela.
  if (!carregado) return <div className="nov-barra nov-barra-esqueleto" aria-hidden="true" />
  if (novidades.length === 0) return null

  // A barra navega só dentro do que ela consegue mostrar. As setas iam até o
  // fim da lista enquanto os dots paravam no teto: com 16 novidades ativas, a
  // partir do primeiro item fora do teto nenhuma bolinha ficava acesa e a barra
  // lia como quebrada.
  const naBarra = novidades.slice(0, MAX_NOVIDADES)
  const atual = naBarra[indice] || naBarra[0]
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
            {naBarra.map((n, i) => (
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
            disabled={indice >= naBarra.length - 1}
            onClick={() => setIndice((i) => Math.min(naBarra.length - 1, i + 1))}
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
              {/* CTA da feature em cima, em linha própria e largura cheia; a
                  navegação do modal embaixo. Continuam sendo duas ações de
                  natureza diferente — só que agora cada uma tem seu eixo.

                  Lado a lado (o layout anterior) só funcionava enquanto o rótulo
                  fosse curto: "Configurar formas de pagamento" ao lado de Anterior
                  + Próxima estoura os ~510px úteis do rodapé, o flex-wrap joga a
                  navegação pra outra linha e o rodapé passa a ter uma composição
                  diferente a cada slide, conforme o tamanho do texto do CTA.

                  Encurtar o rótulo resolveria o transbordo e estragaria o resto:
                  ele é a promessa do clique, e é o clique — não o "viu" — que
                  prova que a novidade foi descoberta. Empilhado, o rodapé é o
                  mesmo pra rótulo de 8 ou de 40 caracteres. */}
              {noModal.cta_rota && (
                <Button
                  variant="outline"
                  fullWidth
                  className="nov-modal-cta"
                  iconRight="mdi:arrow-right"
                  onClick={() => seguirCta(noModal)}
                >
                  {noModal.cta_label || 'Ver na prática'}
                </Button>
              )}

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
