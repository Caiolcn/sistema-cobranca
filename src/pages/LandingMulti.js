import LandingNicho from './LandingNicho'

export default function LandingMulti() {
  return (
    <LandingNicho
      nicho="software-mensalidades"
      titulo="Sistema de Mensalidades com WhatsApp"
      subtitulo="Perfeito para academias, estúdios e escolas que vivem de mensalidade"
      beneficios={[
        'Gerenciar alunos/clientes de forma centralizada',
        'Cobranças automáticas de mensalidades',
        'Lembretes inteligentes via WhatsApp',
        'Dashboard com relatórios em tempo real',
        'PIX, cartão ou boleto integrados',
        'Suporte em português'
      ]}
      cta="Começar Trial Gratuito"
      imagem="📱"
    />
  )
}
