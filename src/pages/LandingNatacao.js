import LandingNicho from './LandingNicho'

export default function LandingNatacao() {
  return (
    <LandingNicho
      nicho="escola-natacao"
      titulo="Sistema para Escola de Natação"
      subtitulo="Organize turmas, cobranças e comunicados com pais"
      beneficios={[
        'Cobrança automática de mensalidades',
        'Comunicados para responsáveis pelo WhatsApp',
        'Agenda de aulas por turma e nível',
        'Controle de faltas e frequência',
        'PIX, cartão ou boleto',
        'Relatórios de inadimplência'
      ]}
      cta="Começar Trial Gratuito"
      imagem="🏊"
    />
  )
}
