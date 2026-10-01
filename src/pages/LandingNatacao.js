import LandingNicho from './LandingNicho'

export default function LandingNatacao() {
  return (
    <LandingNicho
      nicho="natacao"
      titulo="Sistema para Escola de Natação"
      subtitulo="Organize turmas, cobranças e comunicados com pais"
      beneficios={[
        'Cobrança automática de mensalidades',
        'Comunicados para responsáveis pelo WhatsApp',
        'Agenda de aulas por turma',
        'Integrado com pagamentos'
      ]}
      cta="Testar Agora"
      imagem="🏊"
    />
  )
}
