import LandingNicho from './LandingNicho'

export default function LandingMulti() {
  return (
    <LandingNicho
      nicho="multi"
      titulo="Sistema de Mensalidades com WhatsApp"
      subtitulo="Perfeito para academias, estúdios e escolas"
      beneficios={[
        'Gerenciar alunos/clientes',
        'Cobranças automáticas',
        'Lembretes via WhatsApp',
        'Relatórios e análises'
      ]}
      cta="Começar Trial"
      imagem="📱"
    />
  )
}
