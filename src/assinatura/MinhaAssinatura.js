import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from '@iconify/react'
import Badge from '../design-system/components/Badge'
import Button from '../design-system/components/Button'
import Table from '../design-system/components/Table'
import PlanoCard from '../design-system/components/PlanoCard'
import ConfirmModal from '../ConfirmModal'
import ModalPlanos from './ModalPlanos'
import { showSuccess, showError } from '../Toast'
import useWindowSize from '../hooks/useWindowSize'
import { useUser } from '../contexts/UserContext'
import { supabase } from '../supabaseClient'
import { mercadoPagoService } from '../services/mercadoPagoService'
import CheckoutPlano from './CheckoutPlano'
import {
  PLANOS, planoPorId, precoDoPlano, nomeDoPlano, nivelDoPlano,
  normalizarPlano, formatarBRL
} from '../planosMensalli'
import './MinhaAssinatura.css'

/* ============================================================
   Minha Assinatura — a assinatura do cliente no Mensalli

   Duas portas, um componente só:
     /app/assinatura                   (comoPagina) rota dentro do Dashboard,
                                       com o menu lateral. É o destino do link
                                       que vai no WhatsApp dos lembretes de
                                       vencimento — o antigo /app/upgrade
                                       redireciona pra cá.
     /app/configuracao?aba=assinatura  embutido na aba da Configuração

   Conta vencida chega até aqui: o bloqueio do Dashboard tem um passe-livre
   pra esta rota. Sem ele seria trancar a porta e cobrar a chave.

   ESTRUTURA (um card, blocos dentro dele)
   A tela era uma pilha de cards soltos, todos com o mesmo peso visual. Agora
   é UM card com painéis internos em cinza, no mesmo desenho de fatura que a
   pessoa já conhece de outros SaaS:

     cabeçalho    nome do plano + badge, preço grande, linha de apoio
     ficha        linhas "rótulo → valor" com divisória (o miolo informativo)
     uso do plano painel cinza com as barras de consumo
     alerta       painel colorido, SÓ quando há algo a resolver
     ações        painel cinza com os botões
     histórico    painel cinza com a tabela

   O peso é dado pela tipografia (preço 34px, valores 600, rótulos cinza), não
   por borda colorida ou fundo verde.

   Deep links aceitos:
     ?plano=pro   abre o checkout já nesse plano (formato antigo, segue vivo)
     ?renovar=1   abre o checkout no plano atual da conta
   ============================================================ */

const WHATSAPP_SUPORTE = 'https://wa.me/5562981618862?text=' +
  encodeURIComponent('Olá! Preciso de ajuda com o meu plano no Mensalli')

const MAX_PAGAMENTOS = 6

// O que conta como pagamento no histórico. Pix expirado (`cancelled`) e
// recusado não são pagamento — são tentativa, e é a maioria absoluta das
// linhas (49 de ~95 em produção). Listar tudo fazia o card "Último pagamento"
// dizer "nenhum" com seis linhas logo abaixo, o que só destrói a confiança.
const STATUS_QUE_SAO_PAGAMENTO = ['approved', 'pending', 'in_process']

function formatarData(valor) {
  if (!valor) return null
  const d = new Date(valor)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function plural(n, singular, pluralForma) {
  return `${n} ${n === 1 ? singular : pluralForma}`
}

function numero(n) {
  return (n ?? 0).toLocaleString('pt-BR')
}

const ROTULO_STATUS_PAGAMENTO = {
  approved: { texto: 'Pago', variant: 'success' },
  pending: { texto: 'Aguardando', variant: 'warning' },
  in_process: { texto: 'Em análise', variant: 'warning' }
}

function metodoLegivel(pagamento) {
  const id = pagamento.payment_method_id || pagamento.payment_type_id || ''
  if (id === 'pix' || id === 'bank_transfer') return 'Pix'
  if (id === 'historico') return 'Registro manual'
  if (pagamento.payment_type_id === 'credit_card') return 'Cartão de crédito'
  return id || '—'
}

const ICONE_POR_SITUACAO = {
  info: 'mdi:information-outline',
  warning: 'mdi:clock-alert-outline',
  danger: 'mdi:alert-circle-outline'
}

// Barra de consumo. Verde até 80%, laranja até estourar, vermelha depois —
// o mesmo semáforo do resto do app, e a única cor da tela que não é decoração.
function BarraUso({ rotulo, usado, limite, sufixo }) {
  const carregando = usado == null
  const pct = carregando || !limite ? 0 : Math.min(100, (usado / limite) * 100)
  const tom = pct >= 100 ? 'danger' : (pct >= 80 ? 'warning' : 'ok')

  return (
    <div className="ma-uso__item">
      <div className="ma-uso__linha">
        <span className="ma-uso__rotulo">{rotulo}</span>
        <span className="ma-uso__numero">
          {carregando ? '—' : `${numero(usado)} / ${numero(limite)}`}
          {sufixo && !carregando && <span className="ma-uso__sufixo"> {sufixo}</span>}
        </span>
      </div>
      <div className="ma-uso__trilho">
        <div className={`ma-uso__preenchido ma-uso__preenchido--${tom}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function MinhaAssinatura({ comoPagina = false }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { userData, trialStatus, refreshUserData, loading: carregandoConta } = useUser()
  const { isMobile } = useWindowSize()

  const [assinatura, setAssinatura] = useState(null)
  const [pagamentos, setPagamentos] = useState([])
  const [uso, setUso] = useState({ clientes: null, mensagens: null })
  const [carregandoCobranca, setCarregandoCobranca] = useState(true)
  const [checkout, setCheckout] = useState(null) // { plano, motivo }
  const [verPlanos, setVerPlanos] = useState(false)
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false)
  const [cancelando, setCancelando] = useState(false)

  // A cobrança é SEMPRE da conta logada: o checkout do Mercado Pago sai da
  // sessão. Por isso lemos userData cru, e não o effectiveData do seletor
  // admin — um admin espiando um cliente veria o plano dele e pagaria o
  // próprio, que é o pior dos mundos.
  const userId = userData?.id || null
  const planoAtual = normalizarPlano(userData?.plano) || 'starter'
  const infoPlano = planoPorId(planoAtual)
  const eraPagante = !!trialStatus?.eraPagante
  const bloqueado = !!trialStatus?.bloqueado
  const diasRestantes = trialStatus?.diasRestantes || 0
  const dataLimite = trialStatus?.trialFim || null

  const carregarCobranca = useCallback(async () => {
    setCarregandoCobranca(true)
    const [ass, pags] = await Promise.all([
      mercadoPagoService.verificarAssinaturaAtiva(),
      mercadoPagoService.buscarMeusPagamentos()
    ])
    setAssinatura(ass)
    setPagamentos(pags || [])
    setCarregandoCobranca(false)
  }, [])

  useEffect(() => { carregarCobranca() }, [carregarCobranca])

  // Consumo real do plano. O filtro de aluno é o mesmo do resto do app
  // (`lixo.is.null,lixo.eq.false`) pra que o número aqui bata com a tela de
  // Clientes — dois jeitos de contar aluno é como o "X/Y" começa a mentir.
  // Mensagens conta só `enviado`: falha não consome cota.
  useEffect(() => {
    if (!userId) return
    let cancelado = false

    const carregar = async () => {
      const inicioDoMes = new Date()
      inicioDoMes.setDate(1)
      inicioDoMes.setHours(0, 0, 0, 0)

      const [clientes, mensagens] = await Promise.all([
        supabase.from('devedores').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).or('lixo.is.null,lixo.eq.false'),
        supabase.from('logs_mensagens').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('status', 'enviado')
          .gte('created_at', inicioDoMes.toISOString())
      ])

      if (cancelado) return
      // Falha de rede deixa o campo nulo (vira "—"), nunca zero: zero aqui
      // seria lido como "não usei nada" e é mentira.
      setUso({
        clientes: clientes.error ? null : (clientes.count ?? null),
        mensagens: mensagens.error ? null : (mensagens.count ?? null)
      })
    }

    carregar()
    return () => { cancelado = true }
  }, [userId])

  // Deep link do WhatsApp. Abre o modal IMEDIATAMENTE, sem esperar a conta.
  //
  // Antes isto tinha um `if (carregandoConta) return` e o modal só aparecia
  // depois de sessão + chunk + getUser + select em usuarios — dava pra ver a
  // tela inteira antes de o modal surgir, e a pessoa que veio pra pagar já
  // tinha começado a procurar o botão. Agora o modal sobe na primeira pintura
  // e o plano entra assim que a conta responde (`plano: null` = carregando).
  //
  // Consome o parâmetro na hora pra que fechar o modal não o reabra.
  useEffect(() => {
    if (checkout) return
    const pedido = normalizarPlano(searchParams.get('plano'))
    const querRenovar = searchParams.get('renovar')
    const planoDaUrl = pedido && planoPorId(pedido) ? pedido : null
    if (!planoDaUrl && !querRenovar) return

    setCheckout({ plano: planoDaUrl, motivo: planoDaUrl ? 'upgrade' : 'renovacao' })

    const restante = new URLSearchParams(searchParams)
    restante.delete('plano')
    restante.delete('renovar')
    setSearchParams(restante, { replace: true })
  }, [searchParams, setSearchParams, checkout])

  // Segunda fase do deep link: a conta chegou, preenche o plano que faltava.
  useEffect(() => {
    if (!checkout || checkout.plano || carregandoConta || !userData) return
    setCheckout({ plano: planoAtual, motivo: eraPagante ? 'renovacao' : 'assinatura' })
  }, [checkout, carregandoConta, userData, planoAtual, eraPagante])

  const historico = useMemo(
    () => (pagamentos || []).filter((p) => STATUS_QUE_SAO_PAGAMENTO.includes(p.status)),
    [pagamentos]
  )

  const ultimoPagamento = useMemo(
    () => (pagamentos || []).find((p) => p.status === 'approved') || null,
    [pagamentos]
  )

  // O que a conta paga hoje. A assinatura no cartão manda (é o valor que o
  // Mercado Pago debita de fato); sem ela, vale a tabela do plano.
  const valorMensal = assinatura?.valor != null
    ? Number(assinatura.valor)
    : precoDoPlano(planoAtual)

  // ---------- Estado da assinatura ----------
  const situacao = useMemo(() => {
    if (trialStatus?.cancelado) {
      return {
        variant: 'danger', rotulo: 'Cancelada', alerta: true,
        titulo: eraPagante ? 'Sua assinatura foi cancelada' : 'Seu acesso foi encerrado',
        frase: 'Reative escolhendo um plano — seus dados continuam aqui.'
      }
    }
    if (!eraPagante) {
      if (bloqueado) {
        return {
          variant: 'danger', rotulo: 'Teste encerrado', alerta: true,
          titulo: 'Seu teste grátis acabou',
          frase: 'Escolha um plano pra voltar a disparar as cobranças automáticas.'
        }
      }
      return {
        variant: 'info', rotulo: 'Teste grátis', alerta: true,
        titulo: diasRestantes > 0
          ? `Faltam ${plural(diasRestantes, 'dia', 'dias')} de teste`
          : 'Último dia de teste',
        frase: dataLimite
          ? `O teste vai até ${formatarData(dataLimite)}. Assine antes disso pra não parar.`
          : 'Assine pra continuar com as cobranças automáticas rodando.'
      }
    }
    if (bloqueado) {
      return {
        variant: 'danger', rotulo: 'Vencida', alerta: true,
        titulo: dataLimite ? `Venceu em ${formatarData(dataLimite)}` : 'Sua assinatura venceu',
        frase: 'Enquanto está em aberto, as cobranças automáticas dos seus alunos ficam pausadas.'
      }
    }
    if (diasRestantes <= 3) {
      return {
        variant: 'warning', rotulo: 'Vence em breve', alerta: true,
        titulo: diasRestantes === 0 ? 'Sua assinatura vence hoje' : `Vence em ${plural(diasRestantes, 'dia', 'dias')}`,
        frase: dataLimite
          ? `Renove até ${formatarData(dataLimite)} pra não pausar as cobranças dos seus alunos.`
          : 'Renove pra não pausar as cobranças dos seus alunos.'
      }
    }
    // Tudo em dia não vira faixa nenhuma: o badge no título já diz.
    return { variant: 'success', rotulo: 'Ativa', alerta: false }
  }, [trialStatus, eraPagante, bloqueado, diasRestantes, dataLimite])

  const ctaPrincipal = eraPagante
    ? (bloqueado ? 'Reativar meu plano' : 'Renovar agora')
    : 'Assinar o Mensalli'

  const abrirCheckout = (plano, motivo) => {
    setVerPlanos(false)
    setCheckout({ plano, motivo })
  }

  const pagarPlanoAtual = () =>
    abrirCheckout(planoAtual, eraPagante ? 'renovacao' : 'assinatura')

  const trocarDePlano = (plano) => {
    if (plano === planoAtual) {
      pagarPlanoAtual()
      return
    }
    abrirCheckout(plano, nivelDoPlano(plano) > nivelDoPlano(planoAtual) ? 'upgrade' : 'downgrade')
  }

  const cancelarAssinatura = async () => {
    setCancelando(true)
    try {
      await mercadoPagoService.cancelarAssinatura()
      setAssinatura(null)
      showSuccess('Assinatura cancelada. Você segue com acesso até o fim do período já pago.')
    } catch (e) {
      showError(e.message || 'Não consegui cancelar agora. Chame o suporte no WhatsApp.')
    } finally {
      setCancelando(false)
      setConfirmarCancelamento(false)
    }
  }

  const aoPagar = useCallback(() => {
    refreshUserData()
    carregarCobranca()
  }, [refreshUserData, carregarCobranca])

  // No celular a coluna "Forma" sai: as quatro colunas empurravam o status
  // pra fora da tela, e hoje 100% dos pagamentos são Pix — é a coluna que
  // menos informa.
  const colunasHistorico = useMemo(() => [
    {
      key: 'data',
      label: 'Data',
      render: (p) => formatarData(p.data_aprovacao || p.data_pagamento || p.created_at) || '—'
    },
    ...(isMobile ? [] : [{ key: 'metodo', label: 'Forma', render: (p) => metodoLegivel(p) }]),
    {
      key: 'valor',
      label: 'Valor',
      align: 'right',
      render: (p) => <span className="ma-tabela__valor">{formatarBRL(p.valor)}</span>
    },
    {
      key: 'status',
      label: 'Status',
      align: 'right',
      render: (p) => {
        const r = ROTULO_STATUS_PAGAMENTO[p.status] || { texto: p.status, variant: 'default' }
        return <Badge variant={r.variant} size="sm">{r.texto}</Badge>
      }
    }
  ], [isMobile])

  const conteudo = (
    <div className="ma">
      <div className="ma-card">
        {/* ---------- Cabeçalho ---------- */}
        <header className="ma-topo">
          <div className="ma-topo__nome">
            <h2>Plano {nomeDoPlano(planoAtual)}</h2>
            <Badge variant={situacao.variant} size="sm">{situacao.rotulo}</Badge>
          </div>
          <p className="ma-topo__preco">
            {formatarBRL(valorMensal)}<span>/mês</span>
          </p>
          {infoPlano && (
            <p className="ma-topo__resumo">
              {infoPlano.subtitulo} — até {numero(infoPlano.limiteClientes)} clientes ativos e{' '}
              {numero(infoPlano.limiteMensagens)} mensagens por mês
            </p>
          )}
        </header>

        {/* ---------- Ficha: rótulo → valor ---------- */}
        <dl className="ma-ficha">
          <div className="ma-ficha__linha">
            <dt>
              <Icon icon="mdi:calendar-month-outline" width="18" />
              {bloqueado ? 'Venceu em' : (eraPagante ? 'Próxima cobrança' : 'Teste grátis até')}
            </dt>
            <dd>
              {formatarData(dataLimite) || '—'}
              {!bloqueado && dataLimite && (
                <span className="ma-ficha__nota">faltam {plural(diasRestantes, 'dia', 'dias')}</span>
              )}
            </dd>
          </div>
          <div className="ma-ficha__linha">
            <dt><Icon icon={assinatura ? 'mdi:credit-card-outline' : 'mdi:qrcode'} width="18" />Forma de pagamento</dt>
            <dd>
              {assinatura ? 'Cartão de crédito' : 'Pix'}
              <span className="ma-ficha__nota">
                {assinatura ? 'renova sozinho' : 'você renova a cada mês'}
              </span>
            </dd>
          </div>
          <div className="ma-ficha__linha">
            <dt><Icon icon="mdi:receipt-text-outline" width="18" />Último pagamento</dt>
            <dd>
              {ultimoPagamento ? formatarBRL(ultimoPagamento.valor) : '—'}
              <span className="ma-ficha__nota">
                {ultimoPagamento
                  ? formatarData(ultimoPagamento.data_aprovacao || ultimoPagamento.data_pagamento)
                  : 'nenhum confirmado'}
              </span>
            </dd>
          </div>
          <div className="ma-ficha__linha">
            <dt><Icon icon="mdi:headset" width="18" />Suporte</dt>
            <dd>WhatsApp</dd>
          </div>
        </dl>

        {/* ---------- Uso do plano ---------- */}
        <section className="ma-painel ma-uso">
          <header className="ma-painel__head">
            <h3><Icon icon="mdi:chart-donut" width="16" />Uso do plano</h3>
            {dataLimite && (
              <span className="ma-painel__meta">
                {bloqueado ? 'Venceu em' : (eraPagante ? 'Renova em' : 'Teste até')}{' '}
                {formatarData(dataLimite)}
              </span>
            )}
          </header>
          <BarraUso
            rotulo="Clientes ativos"
            usado={uso.clientes}
            limite={infoPlano?.limiteClientes}
          />
          <BarraUso
            rotulo="Mensagens este mês"
            usado={uso.mensagens}
            limite={infoPlano?.limiteMensagens}
          />
        </section>

        {/* ---------- Alerta (só quando há o que resolver) ---------- */}
        {situacao.alerta && (
          <div className={`ma-alerta ma-alerta--${situacao.variant}`}>
            <Icon icon={ICONE_POR_SITUACAO[situacao.variant]} width="20" />
            <div>
              <strong>{situacao.titulo}</strong>
              <p>{situacao.frase}</p>
            </div>
          </div>
        )}

        {/* ---------- Ações ---------- */}
        <section className="ma-painel">
          <header className="ma-painel__head">
            <h3><Icon icon="mdi:tune-variant" width="16" />Gerenciar assinatura</h3>
          </header>
          <div className="ma-painel__acoes">
            <Button variant="outline" icon="mdi:lightning-bolt-outline" onClick={pagarPlanoAtual}>
              {ctaPrincipal} · {formatarBRL(precoDoPlano(planoAtual))}
            </Button>
            {eraPagante && (
              <Button variant="ghost" onClick={() => setVerPlanos(true)}>
                Mudar de plano
              </Button>
            )}
            {assinatura && (
              <Button variant="ghost" onClick={() => setConfirmarCancelamento(true)}>
                Cancelar renovação automática
              </Button>
            )}
          </div>
          {!assinatura && (
            <p className="ma-painel__nota">
              <Icon icon="mdi:information-outline" width="15" />
              Pagando no cartão, a renovação vira automática.
            </p>
          )}
        </section>

        {/* ---------- Histórico ---------- */}
        {(carregandoCobranca || historico.length > 0) && (
          <section className="ma-painel">
            <header className="ma-painel__head">
              <h3><Icon icon="mdi:receipt-text-outline" width="16" />Histórico de pagamentos</h3>
            </header>
            <Table
              columns={colunasHistorico}
              data={historico.slice(0, MAX_PAGAMENTOS)}
              rowKey="id"
              loading={carregandoCobranca}
              loadingRows={3}
              hoverable={false}
              size="sm"
              emptyIcon="mdi:receipt-text-outline"
              emptyTitle="Nenhum pagamento ainda"
              emptyMessage="Quando você pagar a primeira mensalidade, ela aparece aqui."
            />
          </section>
        )}

        {/* ---------- Rodapé do card ---------- */}
        <footer className="ma-rodape">
          <span>
            <Icon icon="mdi:shield-check-outline" width="16" />
            Pagamento processado pelo Mercado Pago
          </span>
          <span>
            <Icon icon="mdi:check-circle-outline" width="16" />
            Cancele quando quiser, sem multa
          </span>
          <a href={WHATSAPP_SUPORTE} target="_blank" rel="noreferrer" className="ma-rodape__suporte">
            <Icon icon="mdi:whatsapp" width="16" />
            Falar com o suporte
          </a>
        </footer>
      </div>

      {/* ---------- Escolher plano (só quem nunca pagou) ----------
          Pra conta em teste, escolher um plano É a ação principal da tela:
          a grade fica aberta. Cliente que já pagou chega aqui pra cuidar do
          plano que já tem, e pra ele a grade virou o botão "Mudar de plano". */}
      {!eraPagante && (
        <section className="ma-secao">
          <header className="ma-secao__head">
            <h3 className="ds-text-h4">Escolha seu plano</h3>
            <p className="ds-text-body-sm ma-muted">
              Pagando, o plano escolhido vale por 30 dias a partir de agora.
            </p>
          </header>

          <div className="ma-planos">
            {PLANOS.map((plano) => (
              <PlanoCard
                key={plano.id}
                nome={plano.nome}
                description={plano.subtitulo}
                preco={plano.preco}
                features={plano.features}
                destaque={plano.destaque}
                cta={`Assinar o ${plano.nome}`}
                onCtaClick={() => trocarDePlano(plano.id)}
              />
            ))}
          </div>
        </section>
      )}

      {verPlanos && (
        <ModalPlanos
          planoAtual={planoAtual}
          bloqueado={bloqueado}
          ctaPlanoAtual={ctaPrincipal}
          onEscolher={trocarDePlano}
          onClose={() => setVerPlanos(false)}
        />
      )}

      {checkout && (
        <CheckoutPlano
          plano={checkout.plano}
          motivo={checkout.motivo}
          onClose={() => setCheckout(null)}
          onPago={aoPagar}
        />
      )}

      <ConfirmModal
        isOpen={confirmarCancelamento}
        onClose={() => setConfirmarCancelamento(false)}
        onConfirm={cancelarAssinatura}
        title="Cancelar renovação automática"
        message="Você continua com acesso até o fim do período já pago. Depois disso, precisará renovar na mão pelo Pix ou assinar de novo."
        confirmText={cancelando ? 'Cancelando...' : 'Sim, cancelar'}
        cancelText="Voltar"
        type="danger"
      />
    </div>
  )

  // Embutido na Configuração a aba já tem cabeçalho próprio; como rota, a
  // página põe o título. A barra "Voltar para o sistema" saiu junto com a
  // mudança pra dentro do Dashboard — o menu lateral faz esse papel agora.
  if (!comoPagina) return conteudo

  return (
    <main className="ma-pagina">
      <h1 className="ds-text-h1 ma-pagina__titulo">Minha assinatura</h1>
      {conteudo}
    </main>
  )
}
