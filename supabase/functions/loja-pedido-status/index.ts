// Edge Function: Loja - Status do pedido (polling público)
// GET ?token=            -> status + dados para a tela de confirmação
// GET ?token=&force=1    -> além disso consulta o Asaas; se já pagou, processa igual ao webhook
// Acesso PÚBLICO (validação pelo token do pedido).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsHeaders, json, erro, carregarEmpresaPorId, asaasCtx, buscarPagamentoAsaas, pedidoPublico, empresaPublica,
} from '../_shared/loja.ts'
import { processarPedidoLoja } from '../_shared/loja-pedido.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const url = new URL(req.url)
    const token = url.searchParams.get('token') || ''
    const force = url.searchParams.get('force') === '1'
    if (token.length < 10) return erro('dados', 'Pedido inválido', 400)

    let { data: pedido } = await supabase.from('loja_pedidos').select('*').eq('token', token).maybeSingle()
    if (!pedido) return erro('nao_encontrado', 'Pedido não encontrado', 404)

    const empresa = await carregarEmpresaPorId(supabase, pedido.user_id)

    // Consulta direta ao Asaas quando o aluno clica "Já paguei"
    if (force && pedido.status === 'aguardando_pagamento' && pedido.asaas_payment_id && empresa?.asaas_api_key) {
      const pay = await buscarPagamentoAsaas(asaasCtx(empresa, SUPABASE_URL), pedido.asaas_payment_id)
      if (pay && ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'].includes(pay.status)) {
        await processarPedidoLoja(supabase, pedido.id, pay, 'consulta')
        const r = await supabase.from('loja_pedidos').select('*').eq('id', pedido.id).maybeSingle()
        pedido = r.data || pedido
      }
    }

    const [{ data: produto }, { data: devedor }] = await Promise.all([
      supabase.from('loja_produtos').select('id, tipo, nome, imagem_url, exigir_turma, qtd_turmas, retirada_presencial, data_evento, local_evento').eq('id', pedido.produto_id).maybeSingle(),
      pedido.devedor_id
        ? supabase.from('devedores').select('portal_token, nome').eq('id', pedido.devedor_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    let turmas: any[] = []
    if (Array.isArray(pedido.aula_ids) && pedido.aula_ids.length) {
      const { data } = await supabase.from('aulas').select('id, dia_semana, horario, descricao, modalidades(nome)').in('id', pedido.aula_ids)
      turmas = (data || []).map((a: any) => ({ id: a.id, dia: DIAS[a.dia_semana], horario: String(a.horario || '').slice(0, 5), descricao: a.descricao, modalidade: a.modalidades?.nome || null }))
    }

    let contrato: { token: string; status: string } | null = null
    if (pedido.contrato_enviado_id) {
      const { data } = await supabase.from('contratos_enviados').select('link_token, status').eq('id', pedido.contrato_enviado_id).maybeSingle()
      if (data) contrato = { token: data.link_token, status: data.status }
    }

    const pub = empresa ? empresaPublica(empresa) : null
    return json({
      pedido: pedidoPublico(pedido, {
        portal_token: ['pago', 'turma_pendente', 'aguardando_retirada', 'concluido', 'retirado'].includes(pedido.status) ? (devedor?.portal_token || null) : null,
        turmas,
        contrato,
        produto: produto ? {
          id: produto.id, tipo: produto.tipo, nome: produto.nome, imagem_url: produto.imagem_url,
          exigir_turma: !!produto.exigir_turma, qtd_turmas: produto.qtd_turmas ?? 1,
          retirada_presencial: !!produto.retirada_presencial, data_evento: produto.data_evento, local_evento: produto.local_evento,
        } : null,
      }),
      empresa: pub ? { nome_empresa: pub.nome_empresa, logo_url: pub.logo_url, telefone: pub.telefone, cor_primaria: pub.cor_primaria, bio: pub.bio, loja: pub.loja, agendamento_slug: pub.agendamento_slug, agendamento_ativo: pub.agendamento_ativo } : null,
      slug: empresa?.agendamento_slug || null,
    })
  } catch (err) {
    console.error('Erro loja-pedido-status:', err)
    return erro('interno', 'Erro interno do servidor', 500)
  }
})
