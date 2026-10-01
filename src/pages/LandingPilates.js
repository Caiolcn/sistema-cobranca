import LandingNicho from './LandingNicho'

export default function LandingPilates() {
  return (
    <LandingNicho
      nicho="pilates"
      titulo="Sistema para Estúdio de Pilates"
      subtitulo="Gerencie alunos, cobranças e WhatsApp em um só lugar"
      beneficios={[
        'Cobrança automática de mensalidades',
        'Lembretes pelo WhatsApp do estúdio',
        'Controle de frequência e cancelamentos',
        'PIX, cartão ou boleto'
      ]}
      cta="Começar Trial Gratuito"
      imagem="🧘‍♀️"
    />
  )
}
