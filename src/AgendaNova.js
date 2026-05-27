import useWindowSize from './hooks/useWindowSize'
import AgendaNovaContainer from './AgendaNovaContainer'

// ==========================================
// Página da Agenda Nova (/app/agenda-nova)
// Shell experimental — espelha GradeHorarios mas monta o container
// novo (AgendaNovaContainer), pra evoluir sem mexer no menu Horários.
// ==========================================

export default function AgendaNova() {
  const { isMobile } = useWindowSize()

  return (
    <div style={{
      flex: 1, padding: isMobile ? '16px' : '25px 30px',
      backgroundColor: '#ffffff', minHeight: '100vh'
    }}>
      <div style={{ marginBottom: isMobile ? '16px' : '20px' }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? '16px' : '18px', fontWeight: '600', color: '#344848' }}>
          Agenda Nova
        </h2>
        <p style={{ margin: '5px 0 0 0', fontSize: isMobile ? '13px' : '14px', color: '#666' }}>
          Versão em construção — a Agenda atual continua disponível em "Horários".
        </p>
      </div>

      <AgendaNovaContainer />
    </div>
  )
}
