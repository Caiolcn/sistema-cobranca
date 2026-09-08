import { useState, useEffect, useRef, useCallback } from 'react'
import { Icon } from '@iconify/react'
import Modal from '../design-system/components/Modal'
import Button from '../design-system/components/Button'
import { mercadoPagoService } from '../services/mercadoPagoService'
import { supabase } from '../supabaseClient'
import { trackInitiateCheckout } from '../utils/metaPixel'
import { planoPorId, precoDoPlano, nomeDoPlano, formatarBRL } from '../planosMensalli'

/* ============================================================
   CheckoutPlano — pagar/renovar um plano do Mensalli

   Três passos dentro do mesmo modal: escolher método → Pix (QR + polling)
   → confirmado. O cartão sai do modal (redireciona pro checkout hospedado
   do Mercado Pago) e volta em /app/upgrade/success — essa URL de retorno é
   montada dentro da edge function create-subscription e por isso ficou.

   Era o corpo do antigo UpgradePage, que ocupava a tela inteira e não tinha
   como conviver com um resumo da conta. Virou modal justamente pra que a
   tela de trás continue mostrando plano, valor e vencimento enquanto a
   pessoa paga.

   Props:
     plano       — 'starter' | 'pro' | 'premium'
     motivo      — 'renovacao' | 'upgrade' | 'downgrade' | 'assinatura'
     onClose     — fecha o modal
     onPago      — chamado quando o Pix é confirmado (recarrega a conta)
   ============================================================ */

const INTERVALO_POLLING = 5000
const TIMEOUT_POLLING = 10 * 60 * 1000

const TITULO_POR_MOTIVO = {
  renovacao: 'Renovar assinatura',
  upgrade: 'Mudar de plano',
  downgrade: 'Mudar de plano',
  assinatura: 'Assinar o Mensalli'
}

export default function CheckoutPlano({ plano, motivo = 'assinatura', onClose, onPago }) {
  const [loading, setLoading] = useState(false)
  const [metodo, setMetodo] = useState(null)
  const [pixData, setPixData] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const [erro, setErro] = useState(null)
  const pollingRef = useRef(null)

  const info = planoPorId(plano)
  const valor = precoDoPlano(plano)
  // O deep link abre o modal antes de a conta responder: aqui `plano` ainda é
  // null. Melhor a caixa aparecer na hora com um esqueleto do que a pessoa
  // ficar olhando a tela achando que o link não funcionou.
  const resolvendoPlano = !plano

  // Polling do Pix: confere o pagamento ESPECÍFICO, não `plano_pago`.
  // Numa renovação a flag já está true antes de pagar — olhar pra ela daria
  // "confirmado" no primeiro tick, com o QR ainda intocado.
  useEffect(() => {
    if (!pixData || confirmado) return

    pollingRef.current = setInterval(async () => {
      try {
        const { data: pagamento } = await supabase
          .from('pagamentos_mercadopago')
          .select('status')
          .eq('payment_id', String(pixData.payment_id))
          .maybeSingle()

        if (pagamento?.status === 'approved') {
          clearInterval(pollingRef.current)
          setConfirmado(true)
          // Purchase NÃO sai daqui: quem dispara é o trigger do banco quando
          // plano_pago vira true, pra cobrir também cartão, renovação e venda
          // fechada na mão. Disparar aqui contaria em dobro.
          if (onPago) onPago()
        }
      } catch (e) {
        console.error('Erro ao verificar pagamento:', e)
      }
    }, INTERVALO_POLLING)

    const timeout = setTimeout(() => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }, TIMEOUT_POLLING)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      clearTimeout(timeout)
    }
  }, [pixData, confirmado, onPago])

  const pagarComPix = useCallback(async () => {
    setMetodo('pix')
    setErro(null)
    setLoading(true)
    try {
      const data = await mercadoPagoService.criarPagamentoPix(plano)
      setPixData(data)
      trackInitiateCheckout(valor, plano)
    } catch (e) {
      console.error('Erro ao gerar Pix:', e)
      setErro(e.message || 'Não consegui gerar o Pix agora. Tente de novo em instantes.')
      setMetodo(null)
    } finally {
      setLoading(false)
    }
  }, [plano, valor])

  const pagarComCartao = useCallback(async () => {
    setMetodo('cartao')
    setErro(null)
    setLoading(true)
    try {
      const data = await mercadoPagoService.criarAssinatura(plano)
      trackInitiateCheckout(valor, plano)
      if (!data?.init_point) throw new Error('Não foi possível abrir o checkout do cartão.')
      window.location.href = data.init_point
    } catch (e) {
      console.error('Erro ao criar assinatura:', e)
      setErro(e.message || 'Não consegui abrir o checkout do cartão. Tente de novo em instantes.')
      setMetodo(null)
      setLoading(false)
    }
  }, [plano, valor])

  const copiarPix = () => {
    if (!pixData?.pix?.qr_code) return
    navigator.clipboard.writeText(pixData.pix.qr_code)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 3000)
  }

  const voltarParaMetodos = () => {
    setPixData(null)
    setMetodo(null)
    setErro(null)
  }

  // ---------- Passo 3: pago ----------
  if (confirmado) {
    return (
      <Modal isOpen onClose={onClose} hideHeader size="sm">
        <Modal.Body>
          <div className="ma-checkout__sucesso">
            <div className="ma-checkout__selo">
              <Icon icon="mdi:check-circle" width="56" />
            </div>
            <h3>Pagamento confirmado!</h3>
            <p>
              Seu plano <strong>{nomeDoPlano(plano)}</strong> está ativo por mais 30 dias.
              As cobranças automáticas para seus alunos voltam a sair normalmente.
            </p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" fullWidth onClick={onClose}>Ver meu plano</Button>
        </Modal.Footer>
      </Modal>
    )
  }

  // ---------- Passo 2: QR do Pix ----------
  if (pixData) {
    return (
      <Modal isOpen onClose={onClose} title="Pague com Pix" subtitle={`${nomeDoPlano(plano)} · ${formatarBRL(pixData.valor ?? valor)}`} size="sm">
        <Modal.Body>
          <div className="ma-checkout__pix">
            {pixData.pix?.qr_code_base64 && (
              <img
                className="ma-checkout__qr"
                src={`data:image/png;base64,${pixData.pix.qr_code_base64}`}
                alt="QR Code do Pix"
              />
            )}

            <p className="ma-checkout__pix-label">Ou copie o código Pix:</p>
            <div className="ma-checkout__copiacola">{pixData.pix?.qr_code}</div>

            <Button
              variant="primary"
              fullWidth
              icon={copiado ? 'mdi:check' : 'mdi:content-copy'}
              onClick={copiarPix}
            >
              {copiado ? 'Código copiado!' : 'Copiar código Pix'}
            </Button>

            <div className="ma-checkout__aviso">
              <Icon icon="mdi:autorenew" width="18" />
              <span>
                Deixe esta tela aberta: assim que o pagamento cair, o plano é liberado
                automaticamente aqui.
              </span>
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer align="between">
          <Button variant="outline" onClick={voltarParaMetodos}>Trocar forma de pagamento</Button>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </Modal.Footer>
      </Modal>
    )
  }

  // ---------- Passo 1: escolher método ----------
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={TITULO_POR_MOTIVO[motivo] || 'Pagamento'}
      subtitle={resolvendoPlano ? 'Carregando seu plano…' : `Plano ${nomeDoPlano(plano)} · ${formatarBRL(valor)}/mês`}
      size="sm"
    >
      <Modal.Body>
        {erro && (
          <div className="ma-checkout__erro">
            <Icon icon="mdi:alert-circle-outline" width="18" />
            <span>{erro}</span>
          </div>
        )}

        {info && (
          <ul className="ma-checkout__features">
            {info.features.slice(0, 4).map((f) => (
              <li key={f}><Icon icon="mdi:check" width="16" />{f}</li>
            ))}
          </ul>
        )}

        <button
          type="button"
          className="ma-checkout__metodo ma-checkout__metodo--destaque"
          onClick={pagarComCartao}
          disabled={loading || resolvendoPlano}
        >
          <Icon icon="mdi:credit-card-outline" width="28" />
          <span>
            <strong>{loading && metodo === 'cartao' ? 'Abrindo checkout…' : 'Cartão de crédito'}</strong>
            <small>Renova sozinho todo mês. Cancele quando quiser.</small>
          </span>
        </button>

        <button
          type="button"
          className="ma-checkout__metodo"
          onClick={pagarComPix}
          disabled={loading || resolvendoPlano}
        >
          <Icon icon="mdi:qrcode" width="28" />
          <span>
            <strong>{loading && metodo === 'pix' ? 'Gerando Pix…' : 'Pix'}</strong>
            <small>Libera 30 dias. Você renova na mão no mês que vem.</small>
          </span>
        </button>
      </Modal.Body>
    </Modal>
  )
}
