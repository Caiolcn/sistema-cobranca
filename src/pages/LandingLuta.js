import LandingNicho from './LandingNicho'

export default function LandingLuta() {
  return (
    <LandingNicho
      nicho="academia-de-luta"
      titulo="Sistema para Academia de Luta"
      subtitulo="Gerencie alunos, cobranças e WhatsApp em um só lugar"
      beneficios={[
        'Cobrança automática de mensalidades',
        'Lembretes pelo WhatsApp da academia',
        'Gestão de turmas, níveis e horários',
        'PIX, cartão ou boleto',
        'Agenda integrada com aulas',
        'Relatórios de inadimplência'
      ]}
      cta="Começar Trial Gratuito"
      imagem="🥋"
    />
  )
}
