// Visual dos kanbans do admin (Funil de leads e CRM do Outbound), estilo Trello:
// coluna cinza com sombra leve que cresce com os cards, card branco com sombra
// em vez de contorno. A cor da etapa fica só na bolinha do título — e acende a
// coluna inteira quando um card é arrastado por cima.

const SOMBRA = '0 1px 1px rgba(9, 30, 66, 0.25), 0 0 1px rgba(9, 30, 66, 0.31)'

export const estiloColuna = (col, alvoDoArrasto) => ({
  flex: '0 0 260px', width: '260px', boxSizing: 'border-box',
  backgroundColor: alvoDoArrasto ? col.bg : '#f1f2f4',
  borderRadius: '12px',
  padding: '10px 8px 8px',
  boxShadow: alvoDoArrasto ? `0 0 0 2px ${col.cor}` : SOMBRA,
  // Coluna vazia ainda precisa de área pra soltar o card
  minHeight: '120px',
  transition: 'box-shadow .12s, background-color .12s'
})

export const ESTILO_CARD = {
  backgroundColor: '#fff',
  borderRadius: '8px',
  padding: '9px 10px',
  marginBottom: '8px',
  cursor: 'grab',
  boxShadow: SOMBRA
}

export const ESTILO_TITULO_COLUNA = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '2px 6px 0', marginBottom: '2px'
}

export const ESTILO_HINT_COLUNA = {
  fontSize: '11px', color: '#626f86', padding: '0 6px', marginBottom: '10px'
}
