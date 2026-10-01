import LandingNicho from './LandingNicho'

export default function LandingPilates() {
  return (
    <LandingNicho
      nicho="academia-pilates"
      titulo="Sistema para Estúdio de Pilates"
      subtitulo="Gerencie alunos, cobranças e WhatsApp em um só lugar"
      beneficios={[
        'Cobrança automática de mensalidades',
        'Lembretes pelo WhatsApp do estúdio',
        'Gestão de turmas e agendamentos',
        'Controle de frequência',
        'PIX, cartão ou boleto',
        'Relatórios de alunos em dia'
      ]}
      cta="Começar Trial Gratuito"
      imagem="🧘‍♀️"
    />
  )
}
