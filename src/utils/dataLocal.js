// Data de hoje em YYYY-MM-DD no horário LOCAL.
// Não usar toISOString() pra isso: ele converte pra UTC e, depois das 21h
// no Brasil, devolve a data de amanhã.
export const hojeISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
