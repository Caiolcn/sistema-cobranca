// O Supabase devolve no máximo 1000 linhas por consulta, sem avisar. Conta com
// mais que isso (Independente Futebol de Base: 1090 mensalidades em nov/2026)
// perdia linhas em silêncio: mensalidade em aberto que não aparecia na busca do
// Financeiro, cards e KPIs com totais errados.
//
// Uso: buscarTodas(() => supabase.from('x').select('...').eq(...).order('id'))
// `montar` precisa devolver uma consulta NOVA a cada chamada e com ordem total
// (termine com .order('id')), senão as páginas podem repetir ou pular linhas.
// Devolve { data, error }, igual ao supabase-js.

const TAM_PAGINA = 1000

export default async function buscarTodas(montar) {
  const todas = []
  for (let de = 0; ; de += TAM_PAGINA) {
    const { data, error } = await montar().range(de, de + TAM_PAGINA - 1)
    if (error) return { data: null, error }
    todas.push(...(data || []))
    if (!data || data.length < TAM_PAGINA) return { data: todas, error: null }
  }
}
