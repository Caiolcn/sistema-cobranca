import LandingNicho from './LandingNicho'

export default function LandingLuta() {
  return (
    <LandingNicho
      nicho="luta"
      titulo="Software para Academia de Luta"
      subtitulo="Gerencie CT, boxe, muay thai, BJJ — tudo integrado"
      beneficios={[
        'Mensalidades automáticas via WhatsApp',
        'Agenda de aulas e treinos',
        'Controle de avançados/iniciantes',
        'Recebimentos automáticos (PIX/cartão)'
      ]}
      cta="Experimentar Grátis"
      imagem="🥋"
    />
  )
}
