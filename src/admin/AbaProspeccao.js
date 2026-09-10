import { useState, useMemo, useCallback } from 'react'
import { Icon } from '@iconify/react'
import Card from '../design-system/components/Card'
import Input from '../design-system/components/Input'
import Button from '../design-system/components/Button'
import Badge from '../design-system/components/Badge'
import Select from '../design-system/components/Select'
import Switch from '../design-system/components/Switch'
import EmptyState from '../design-system/components/EmptyState'
import { buscarRotas, buscarLugares, marcarVisita, limparVisita } from '../services/prospeccaoRota'

/* ============================================================
   Prospecção por rota — /admin?aba=prospeccao

   O caminho que já se faz todo dia de casa para o trabalho vira roteiro de
   visita: a ferramenta mapeia escolinhas e estúdios dentro do corredor da rota
   e entrega a lista NA ORDEM EM QUE SE PASSA POR ELES.

   Três decisões que explicam a tela:

   1. Ordem de passagem, não relevância. Uma lista ordenada por nota do Google
      obriga a ficar cruzando endereço com mapa. Ordenada pelo trajeto, ela lê
      como roteiro: primeira parada, segunda, terceira.

   2. Nada de telefone. O plano é entrar na porta, e pedir telefone ao Places
      sobe a chamada para uma faixa de preço várias vezes maior. Fora que o
      número do Maps costuma ser fixo comercial, que não vira conversa.

   3. Desenhada para o celular. Isso é usado no carro e na calçada, não sentado
      no computador — daí os cards grandes e os dois botões de ação por item.
   ============================================================ */

// Termos de busca, não categorias do Google. O Places não tem tipo "pilates" e
// escolinha de futebol costuma vir sem tipo nenhum, então busca textual pega
// muito mais coisa do que `includedTypes`.
const TIPOS = [
  { termo: 'pilates', rotulo: 'Pilates', padrao: true },
  { termo: 'escolinha de futebol', rotulo: 'Futebol', padrao: true },
  { termo: 'escola de natação', rotulo: 'Natação', padrao: true },
  { termo: 'escola de dança', rotulo: 'Dança', padrao: true },
  { termo: 'ballet infantil', rotulo: 'Ballet', padrao: true },
  { termo: 'jiu jitsu', rotulo: 'Jiu jitsu', padrao: true },
  { termo: 'muay thai', rotulo: 'Muay thai', padrao: false },
  { termo: 'judô', rotulo: 'Judô', padrao: false },
  { termo: 'karatê', rotulo: 'Karatê', padrao: false },
  { termo: 'escolinha de vôlei', rotulo: 'Vôlei', padrao: false },
  { termo: 'ginástica artística', rotulo: 'Ginástica', padrao: false },
  { termo: 'studio de treinamento funcional', rotulo: 'Funcional', padrao: false },
  { termo: 'crossfit', rotulo: 'CrossFit', padrao: false },
  { termo: 'academia', rotulo: 'Academia', padrao: false },
]

const RAIOS = [
  { value: '500', label: 'Só na beira da via (500 m)' },
  { value: '1000', label: 'Até 1 km da rota' },
  { value: '2000', label: 'Até 2 km da rota' },
  { value: '3500', label: 'Corredor largo (3,5 km)' },
]

// Quantidade de avaliações no Maps é o melhor sinal de porte que se consegue de
// graça. Quase sem avaliação costuma ser pequeno demais para pagar mensalidade;
// centenas costuma ser rede grande que já tem sistema. O miolo é o cliente.
const PORTES = [
  { value: 'todos', label: 'Qualquer tamanho' },
  { value: 'miolo', label: 'Só o miolo (10 a 300 avaliações)' },
  { value: 'novos', label: 'Pouca avaliação (até 10)' },
]

const STATUS = {
  visitado: { rotulo: 'Visitei', variant: 'success', icone: 'mdi:check-circle-outline' },
  voltar: { rotulo: 'Voltar depois', variant: 'warning', icone: 'mdi:clock-outline' },
  descartar: { rotulo: 'Não serve', variant: 'default', icone: 'mdi:close-circle-outline' },
}

export default function AbaProspeccao() {
  const [origem, setOrigem] = useState('')
  const [destino, setDestino] = useState('')
  const [tipos, setTipos] = useState(() => TIPOS.filter(t => t.padrao).map(t => t.termo))
  const [raio, setRaio] = useState('1000')
  const [porte, setPorte] = useState('miolo')

  const [rotas, setRotas] = useState([])
  const [rotaAtiva, setRotaAtiva] = useState(null)
  const [lugares, setLugares] = useState(null)
  const [falhas, setFalhas] = useState([])

  const [carregandoRota, setCarregandoRota] = useState(false)
  const [carregandoBusca, setCarregandoBusca] = useState(false)
  const [erro, setErro] = useState('')
  const [esconderMarcados, setEsconderMarcados] = useState(true)

  const alternarTipo = (termo) =>
    setTipos(atual => atual.includes(termo) ? atual.filter(t => t !== termo) : [...atual, termo])

  async function tracarRota() {
    if (!origem.trim() || !destino.trim()) {
      setErro('Preencha de onde sai e para onde vai.')
      return
    }
    setErro(''); setCarregandoRota(true)
    setRotas([]); setRotaAtiva(null); setLugares(null)

    const r = await buscarRotas(origem.trim(), destino.trim())
    setCarregandoRota(false)

    if (!r.ok) { setErro(r.erro); return }
    if (!r.rotas?.length) { setErro('O Google não achou trajeto entre esses dois pontos.'); return }

    setRotas(r.rotas)
    setRotaAtiva(r.rotas[0])
  }

  const procurar = useCallback(async (rota) => {
    if (!rota) return
    if (!tipos.length) { setErro('Escolha ao menos um tipo de negócio.'); return }

    setErro(''); setCarregandoBusca(true); setLugares(null)
    const r = await buscarLugares(rota.polyline, tipos, Number(raio))
    setCarregandoBusca(false)

    if (!r.ok) { setErro(r.erro); return }
    setLugares(r.lugares || [])
    setFalhas(r.falhas || [])
  }, [tipos, raio])

  function escolherRota(rota) {
    setRotaAtiva(rota)
    procurar(rota)
  }

  // Marcação otimista: na rua, esperar o round-trip do banco para o card mudar
  // de cor faz parecer que o botão não funcionou.
  async function marcar(lugar, status) {
    const anterior = lugar.status
    const novo = anterior === status ? null : status

    setLugares(atual => atual.map(l => l.place_id === lugar.place_id ? { ...l, status: novo } : l))

    const r = novo
      ? await marcarVisita(lugar.place_id, novo)
      : await limparVisita(lugar.place_id)

    if (!r.ok) {
      setErro(r.erro)
      setLugares(atual => atual.map(l => l.place_id === lugar.place_id ? { ...l, status: anterior } : l))
    }
  }

  const visiveis = useMemo(() => {
    if (!lugares) return []
    return lugares.filter(l => {
      if (esconderMarcados && l.status) return false
      if (porte === 'miolo' && (l.avaliacoes < 10 || l.avaliacoes > 300)) return false
      if (porte === 'novos' && l.avaliacoes > 10) return false
      return true
    })
  }, [lugares, esconderMarcados, porte])

  const marcadosNaBusca = lugares ? lugares.filter(l => l.status).length : 0

  // Link que abre o trajeto JÁ com as paradas dentro do Google Maps. É aqui que
  // o mapa de verdade mora: no celular ele abre o app, com zoom, navegação e
  // trânsito reais. Tentar imitar isso dentro da página só entregaria uma versão
  // pior — a página encontra os lugares, o Maps dirige.
  //
  // O limite de 9 paradas é do próprio formato de link do Google, não escolha
  // minha; acima disso ele ignora o excedente em silêncio.
  const linkRoteiro = useMemo(() => {
    if (!visiveis.length || !origem.trim() || !destino.trim()) return null
    const p = new URLSearchParams({
      api: '1',
      origin: origem.trim(),
      destination: destino.trim(),
      travelmode: 'driving',
    })
    p.set('waypoints', visiveis.slice(0, 9).map(l => `${l.lat},${l.lng}`).join('|'))
    return `https://www.google.com/maps/dir/?${p.toString()}`
  }, [visiveis, origem, destino])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <Card.Header
          title="Prospecção no caminho"
          subtitle="Quem está no trajeto que você já faz todo dia, na ordem em que você passa."
        />
        <Card.Body>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <Input
              label="Saindo de"
              placeholder="Setor Oeste, Goiânia"
              icon="mdi:map-marker-outline"
              value={origem}
              onChange={e => setOrigem(e.target.value)}
            />
            <Input
              label="Indo para"
              placeholder="Nerópolis, GO"
              icon="mdi:flag-checkered"
              value={destino}
              onChange={e => setDestino(e.target.value)}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>O que procurar</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TIPOS.map(t => (
                <Button
                  key={t.termo}
                  size="sm"
                  variant={tipos.includes(t.termo) ? 'primary' : 'outline'}
                  onClick={() => alternarTipo(t.termo)}
                >
                  {t.rotulo}
                </Button>
              ))}
            </div>
            {/* Cada tipo marcado é uma chamada faturada por trajeto. Deixar isso
                visível evita marcar os catorze "só pra ver". */}
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>
              {tipos.length} {tipos.length === 1 ? 'tipo marcado' : 'tipos marcados'}, uma consulta ao Google por tipo.
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12, marginTop: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <Select label="Quanto pode desviar" options={RAIOS} value={raio} onChange={setRaio} />
            <Select label="Porte do negócio" options={PORTES} value={porte} onChange={setPorte} />
          </div>
        </Card.Body>
        <Card.Footer>
          <Button icon="mdi:directions" loading={carregandoRota} onClick={tracarRota}>
            Traçar trajetos
          </Button>
        </Card.Footer>
      </Card>

      {erro && (
        <Card>
          <Card.Body>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--danger-700)' }}>
              <Icon icon="mdi:alert-circle-outline" width={20} />
              <span>{erro}</span>
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Rotas alternativas: é isso que sustenta "um caminho diferente por dia".
          Cada trajeto passa por corredores distintos e portanto por um estoque
          diferente de portas. */}
      {rotas.length > 0 && (
        <Card>
          <Card.Header
            title="Escolha o trajeto de hoje"
            subtitle="Cada caminho passa por uma região diferente. Varie durante a semana para não repetir porta."
          />
          <Card.Body>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rotas.map(r => {
                const ativa = rotaAtiva?.indice === r.indice
                return (
                  <button
                    key={r.indice}
                    onClick={() => escolherRota(r)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                      padding: '12px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      border: `1px solid ${ativa ? 'var(--mensalli-green-500)' : 'var(--color-border-subtle)'}`,
                      // App.css (linha 50) pinta TODO <button> com fundo azul E
                      // `color: white`. Sobrescrever só o background deixa texto
                      // branco no claro, invisível. As duas propriedades juntas,
                      // sempre — foi exatamente esse o bug da primeira versão.
                      background: ativa ? 'var(--mensalli-green-50)' : 'var(--color-bg-surface)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    <Icon icon={ativa ? 'mdi:radiobox-marked' : 'mdi:radiobox-blank'} width={20} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{r.descricao}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {r.distancia_km} km · {r.minutos} min
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

          </Card.Body>
          <Card.Footer>
            <Button
              icon="mdi:store-search-outline"
              loading={carregandoBusca}
              onClick={() => procurar(rotaAtiva)}
              disabled={!rotaAtiva}
            >
              Procurar nesse trajeto
            </Button>
          </Card.Footer>
        </Card>
      )}

      {lugares !== null && (
        <Card>
          <Card.Header
            title={`${visiveis.length} ${visiveis.length === 1 ? 'parada' : 'paradas'} no caminho`}
            subtitle="Na ordem em que você vai passar. Comece pela primeira."
            actions={
              <Switch
                checked={esconderMarcados}
                onChange={e => setEsconderMarcados(e.target.checked)}
                label="Esconder já marcados"
              />
            }
          />
          <Card.Body>
            {falhas.length > 0 && (
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
                Sem resultado para: {falhas.map(f => f.termo).join(', ')}.
              </div>
            )}

            {visiveis.length === 0 ? (
              <EmptyState
                icon="mdi:map-marker-off-outline"
                title={marcadosNaBusca > 0 ? 'Esse trajeto acabou' : 'Nada no corredor dessa rota'}
                description={
                  marcadosNaBusca > 0
                    ? `Você já marcou ${marcadosNaBusca} ${marcadosNaBusca === 1 ? 'lugar' : 'lugares'} aqui. Escolha outro trajeto acima para achar portas novas.`
                    : 'Tente alargar o desvio permitido, soltar o filtro de porte ou marcar mais tipos de negócio.'
                }
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {visiveis.map((l, i) => (
                  <div
                    key={l.place_id}
                    style={{
                      border: '1px solid var(--color-border-subtle)', borderRadius: 12, padding: 14,
                      opacity: l.status ? 0.55 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{
                        flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                        // green-500 sobre green-50 nao passa contraste em texto
                        // pequeno; o 800 passa e mantem a familia de cor.
                        background: 'var(--mensalli-green-50)', color: 'var(--mensalli-green-800)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700,
                      }}>{i + 1}</div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{l.nome}</div>
                        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>{l.endereco}</div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
                          {l.nota != null && (
                            <Badge variant="warning" icon="mdi:star">
                              {l.nota.toFixed(1)} ({l.avaliacoes})
                            </Badge>
                          )}
                          <Badge variant="default">
                            {l.desvio_m < 100 ? 'na via' : `${l.desvio_m} m da rota`}
                          </Badge>
                          {l.categoria && <Badge variant="info">{l.categoria}</Badge>}
                          {l.status && (
                            <Badge variant={STATUS[l.status].variant} icon={STATUS[l.status].icone}>
                              {STATUS[l.status].rotulo}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                      <Button
                        size="sm"
                        variant="outline"
                        icon="mdi:map-marker-outline"
                        as="a"
                        href={l.maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Abrir no Maps
                      </Button>
                      <Button
                        size="sm"
                        variant={l.status === 'visitado' ? 'primary' : 'outline'}
                        icon="mdi:check"
                        onClick={() => marcar(l, 'visitado')}
                      >
                        Visitei
                      </Button>
                      <Button
                        size="sm"
                        variant={l.status === 'voltar' ? 'primary' : 'outline'}
                        icon="mdi:clock-outline"
                        onClick={() => marcar(l, 'voltar')}
                      >
                        Voltar
                      </Button>
                      <Button
                        size="sm"
                        variant={l.status === 'descartar' ? 'primary' : 'outline'}
                        icon="mdi:close"
                        onClick={() => marcar(l, 'descartar')}
                      >
                        Não serve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card.Body>
          {linkRoteiro && (
            <Card.Footer align="start">
              <Button
                icon="mdi:navigation-outline"
                as="a"
                href={linkRoteiro}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir roteiro no Google Maps
              </Button>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', alignSelf: 'center' }}>
                {visiveis.length > 9
                  ? 'Leva as 9 primeiras paradas, que é o limite do Google.'
                  : `Leva ${visiveis.length === 1 ? 'a parada' : `as ${visiveis.length} paradas`} desta lista.`}
              </span>
            </Card.Footer>
          )}
        </Card>
      )}
    </div>
  )
}
