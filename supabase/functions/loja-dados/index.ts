// Edge Function: Loja - Dados públicos
// GET ?slug=            -> vitrine (empresa + itens ativos)
// GET ?slug=&produto=   -> um item (com turmas e vagas quando é plano com exigir_turma)
// GET ?slug=&turmas=1&produto= -> só a lista de turmas com vagas (etapa pós-pagamento)
// Acesso PÚBLICO (sem autenticação). Gate de plano/add-on/loja no servidor.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsHeaders, json, erro, carregarEmpresaPorSlug, gateLoja, empresaPublica, conteudoHerdado,
} from '../_shared/loja.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

// "Maria Souza" -> "Maria S." (mesma regra de landing-dados)
function mascararNome(nome: string | null | undefined): string {
  if (!nome) return 'Aluno(a)'
  const partes = String(nome).trim().split(/\s+/)
  if (partes.length === 1) return partes[0]
  return `${partes[0]} ${partes[partes.length - 1][0]}.`
}

async function listarTurmas(supabase: any, userId: string, modalidadeId: string | null) {
  let q = supabase
    .from('aulas')
    .select('id, dia_semana, horario, descricao, capacidade, modalidade_id, modalidades(nome, cor), colaboradores(nome)')
    .eq('user_id', userId)
    .eq('ativo', true)
    .is('devedor_id', null)
    .order('dia_semana', { ascending: true })
    .order('horario', { ascending: true })
  if (modalidadeId) q = q.eq('modalidade_id', modalidadeId)
  const { data: aulas } = await q

  const ids = (aulas || []).map((a: any) => a.id)
  const ocupadas: Record<string, number> = {}
  if (ids.length) {
    const { data: fixos } = await supabase
      .from('aulas_fixos')
      .select('aula_id, ativo, devedores!inner(lixo)')
      .in('aula_id', ids)
    for (const f of fixos || []) {
      if (f.ativo === false) continue
      if (f.devedores?.lixo === true) continue
      ocupadas[f.aula_id] = (ocupadas[f.aula_id] || 0) + 1
    }
  }

  return (aulas || []).map((a: any) => {
    const vagas = Math.max(0, (a.capacidade || 0) - (ocupadas[a.id] || 0))
    return {
      id: a.id,
      dia_semana: a.dia_semana,
      dia_nome: DIAS[a.dia_semana] || '',
      horario: String(a.horario || '').slice(0, 5),
      descricao: a.descricao,
      modalidade: a.modalidades?.nome || null,
      modalidade_cor: a.modalidades?.cor || null,
      professor: a.colaboradores?.nome || null,
      capacidade: a.capacidade,
      vagas,
      lotada: vagas <= 0,
    }
  })
}

function variacoesPublicas(variacoes: any) {
  if (!Array.isArray(variacoes)) return []
  return variacoes
    .filter((v: any) => v && v.nome)
    .map((v: any) => ({ nome: String(v.nome), esgotado: v.estoque != null && Number(v.estoque) <= 0 }))
}

function produtoPublico(p: any, extras: Record<string, unknown> = {}) {
  const vars = variacoesPublicas(p.variacoes)
  const esgotadoSemVar = p.tipo === 'produto' && !vars.length && p.estoque != null && Number(p.estoque) <= 0
  const esgotadoComVar = p.tipo === 'produto' && vars.length > 0 && vars.every((v) => v.esgotado)
  return {
    id: p.id,
    tipo: p.tipo,
    nome: p.nome,
    descricao: p.descricao,
    valor: Number(p.valor),
    imagem_url: p.imagem_url,
    variacoes: vars,
    esgotado: esgotadoSemVar || esgotadoComVar,
    exigir_turma: !!p.exigir_turma,
    qtd_turmas: p.qtd_turmas ?? 1,
    data_evento: p.data_evento,
    local_evento: p.local_evento,
    validade_dias: p.validade_dias,
    campos_extras: Array.isArray(p.campos_extras) ? p.campos_extras : [],
    retirada_presencial: !!p.retirada_presencial,
    destaque: !!p.destaque,
    plano: p.planos ? {
      ciclo_cobranca: p.planos.ciclo_cobranca || 'mensal',
      tipo: p.planos.tipo || 'recorrente',
      numero_aulas: p.planos.numero_aulas,
    } : null,
    ...extras,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const url = new URL(req.url)
    const slug = url.searchParams.get('slug') || ''
    const produtoId = url.searchParams.get('produto')
    const soTurmas = url.searchParams.get('turmas') === '1'

    if (slug.length < 2) return erro('slug_invalido', 'Link inválido', 400)

    const empresa = await carregarEmpresaPorSlug(supabase, slug)
    // Vitrine abre mesmo sem Asaas (mostra aviso); a compra é que exige.
    const gate = await gateLoja(supabase, empresa, { exigirAsaas: false })
    if (!gate.ok) return erro(gate.code, gate.motivo, gate.code === 'nao_encontrada' ? 404 : 403)

    const pub = empresaPublica(empresa)
    const pagamento_disponivel = !!(empresa.asaas_api_key && empresa.modo_integracao === 'asaas')

    // --- um item ---
    if (produtoId) {
      const { data: p } = await supabase
        .from('loja_produtos')
        .select('*, planos(ciclo_cobranca, tipo, numero_aulas, valor)')
        .eq('id', produtoId)
        .eq('user_id', empresa.id)
        .maybeSingle()
      if (!p || !p.ativo) return erro('produto_inativo', 'Este item não está mais disponível', 404)

      let vagas_restantes: number | null = null
      if (p.tipo === 'evento') {
        const { data } = await supabase.rpc('loja_vagas_evento', { p_produto_id: p.id })
        vagas_restantes = data
      }
      const turmas = (p.tipo === 'plano' && p.exigir_turma) ? await listarTurmas(supabase, empresa.id, p.modalidade_id) : []

      if (soTurmas) return json({ turmas })

      return json({
        empresa: pub,
        pagamento_disponivel,
        produto: produtoPublico(p, { vagas_restantes, lotado: vagas_restantes != null && vagas_restantes <= 0, turmas }),
      })
    }

    // --- vitrine ---
    const { data: produtos } = await supabase
      .from('loja_produtos')
      .select('*, planos(ciclo_cobranca, tipo, numero_aulas, valor)')
      .eq('user_id', empresa.id)
      .eq('ativo', true)
      .order('ordem', { ascending: true })
      .order('created_at', { ascending: true })

    // Vendas por item (para "Destaques" e o selo "Mais pedido"), só pedidos pagos
    const vendasPorProduto: Record<string, number> = {}
    try {
      const { data: pagos } = await supabase
        .from('loja_pedidos')
        .select('produto_id')
        .eq('user_id', empresa.id)
        .in('status', ['pago', 'turma_pendente', 'aguardando_retirada', 'concluido', 'retirado'])
      for (const pe of pagos || []) if (pe.produto_id) vendasPorProduto[pe.produto_id] = (vendasPorProduto[pe.produto_id] || 0) + 1
    } catch (_) { /* sem contagem */ }

    const lista = []
    for (const p of produtos || []) {
      // evento futuro apenas
      if (p.tipo === 'evento' && p.data_evento && new Date(p.data_evento) < new Date()) continue
      let vagas_restantes: number | null = null
      if (p.tipo === 'evento' && p.vagas != null) {
        const { data } = await supabase.rpc('loja_vagas_evento', { p_produto_id: p.id })
        vagas_restantes = data
      }
      lista.push(produtoPublico(p, { vagas_restantes, lotado: vagas_restantes != null && vagas_restantes <= 0, vendas: vendasPorProduto[p.id] || 0 }))
    }

    // Seções da vitrine. Conteúdo herdado do cadastro (galeria, FAQ, depoimentos
    // manuais, chamada final) + horários da grade + depoimentos do NPS (nota >= 9).
    // O que a academia escreveu dentro da loja (loja_config.secoes) tem prioridade.
    const herdado = conteudoHerdado(empresa)
    const cfgSecoes = pub.loja.secoes
    const secoes: Record<string, any> = {
      aulas: [],
      depoimentos: [],
      avaliacao: null as null | { media: number; total: number },
      galeria: herdado.galeria,
      faq: cfgSecoes.faq_itens.length ? cfgSecoes.faq_itens : herdado.faq,
      cta_titulo: cfgSecoes.chamada_titulo || herdado.cta_titulo,
      cta_texto: cfgSecoes.chamada_texto || herdado.cta_texto,
    }
    const manuais = cfgSecoes.depoimentos_manuais.length ? cfgSecoes.depoimentos_manuais : herdado.depoimentos_manuais
    try {
      const [{ data: aulas }, { data: nps }, { data: todasNotas }] = await Promise.all([
        supabase.from('aulas').select('dia_semana, horario, descricao, modalidades(nome)')
          .eq('user_id', empresa.id).eq('ativo', true).is('devedor_id', null)
          .order('dia_semana', { ascending: true }).order('horario', { ascending: true }).limit(60),
        supabase.from('nps_respostas').select('nota, comentario, devedor_id')
          .eq('user_id', empresa.id).gte('nota', 9).not('comentario', 'is', null)
          .order('respondido_em', { ascending: false }).limit(8),
        supabase.from('nps_respostas').select('nota').eq('user_id', empresa.id).not('nota', 'is', null).limit(500),
      ])
      // Nota média (0-10 do NPS convertida para 0-5, uma casa) e total: a "linha de avaliação" do cartão
      const notas = (todasNotas || []).map((n: any) => Number(n.nota)).filter((n: number) => !isNaN(n))
      if (notas.length >= 3) {
        const media = notas.reduce((s: number, n: number) => s + n, 0) / notas.length
        secoes.avaliacao = { media: Math.round((media / 2) * 10) / 10, total: notas.length }
      }
      secoes.aulas = (aulas || []).map((a: any) => ({ dia_semana: a.dia_semana, horario: a.horario, descricao: a.descricao, modalidade: a.modalidades?.nome || null }))
      const validos = (nps || []).filter((n: any) => n.comentario && String(n.comentario).trim().length >= 10)
      const ids = [...new Set(validos.map((n: any) => n.devedor_id).filter(Boolean))]
      const nomes: Record<string, string> = {}
      if (ids.length) {
        const { data: devs } = await supabase.from('devedores').select('id, nome').in('id', ids)
        for (const d of devs || []) nomes[d.id] = d.nome
      }
      const automaticos = validos.slice(0, 6).map((n: any) => ({ nota: n.nota, comentario: String(n.comentario).trim(), nome: mascararNome(nomes[n.devedor_id]) }))
      secoes.depoimentos = [
        ...manuais.map((d: any) => ({ nota: d.nota || null, comentario: d.texto, nome: d.nome || 'Aluno(a)' })),
        ...automaticos,
      ].slice(0, 6)
    } catch (e) {
      console.error('⚠️ Seções da vitrine falharam (segue sem):', e)
      secoes.depoimentos = manuais.map((d: any) => ({ nota: d.nota || null, comentario: d.texto, nome: d.nome || 'Aluno(a)' }))
    }

    return json({ empresa: pub, pagamento_disponivel, produtos: lista, secoes })
  } catch (err) {
    console.error('Erro loja-dados:', err)
    return erro('interno', 'Erro interno do servidor', 500)
  }
})
