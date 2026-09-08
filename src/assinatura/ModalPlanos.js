import Modal from '../design-system/components/Modal'
import PlanoCard from '../design-system/components/PlanoCard'
import { PLANOS, nomeDoPlano } from '../planosMensalli'

/* ============================================================
   ModalPlanos — a grade de preços, sob demanda

   A comparação dos três planos morava aberta no meio da Minha Assinatura e
   empurrava o histórico pra fora da tela. Só que quem já é cliente abre essa
   página pra renovar o plano que já tem — comparar preço é a exceção, e
   exceção não ocupa metade da página.

   As features vêm inteiras: este é o momento em que a pessoa quer o detalhe.
   Os cards ficam na altura natural (`align-items: start` em .ma-planos) —
   com 5, 8 e 11 itens, igualar as alturas só abriria vazio embaixo dos
   menores.

   Quem nunca pagou não passa por aqui: pra essa conta escolher um plano é a
   ação principal, e a grade continua aberta na página.
   ============================================================ */

export default function ModalPlanos({ planoAtual, bloqueado, ctaPlanoAtual, onEscolher, onClose }) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Mudar de plano"
      subtitle={`Você está no ${nomeDoPlano(planoAtual)}. Pagando, o plano escolhido vale por 30 dias a partir de agora.`}
      size="xl"
    >
      <Modal.Body>
        <div className="ma-planos">
          {PLANOS.map((plano) => {
            const atual = plano.id === planoAtual
            return (
              <PlanoCard
                key={plano.id}
                nome={plano.nome}
                description={plano.subtitulo}
                preco={plano.preco}
                features={plano.features}
                destaque={plano.destaque}
                // "Plano atual" só trava o card de quem está em dia. Numa conta
                // vencida o plano atual é justamente o que ela precisa pagar —
                // desabilitar o botão dela seria a tela sem saída de novo.
                atual={atual && !bloqueado}
                cta={atual ? ctaPlanoAtual : `Mudar para o ${plano.nome}`}
                ctaVariant={atual ? 'primary' : undefined}
                onCtaClick={() => onEscolher(plano.id)}
              />
            )
          })}
        </div>
      </Modal.Body>
    </Modal>
  )
}
