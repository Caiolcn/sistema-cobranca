import useWindowSize from './hooks/useWindowSize'
import AgendaCalendario from './AgendaCalendario'

// ==========================================
// Página da Agenda (/app/horarios)
// Shell que monta a AgendaCalendario — o conteúdo, toggle Dia/Semana,
// notificação WhatsApp, créditos baixos e CRUD vivem dentro do container.
// ==========================================

export default function GradeHorarios() {
  const { isMobile } = useWindowSize()

  return (
    <div style={{
      flex: 1, padding: isMobile ? '16px' : '25px 30px',
      backgroundColor: '#ffffff', minHeight: '100vh'
    }}>
      <div style={{ marginBottom: isMobile ? '16px' : '20px' }}>
        <h2 style={{ margin: 0, fontSize: isMobile ? '16px' : '18px', fontWeight: '600', color: '#344848' }}>
          Agenda
        </h2>
        <p style={{ margin: '5px 0 0 0', fontSize: isMobile ? '13px' : '14px', color: '#666' }}>
          Aulas, presenças e agendamentos online em uma só tela.
        </p>
      </div>

      <AgendaCalendario />
    </div>
  )
}
