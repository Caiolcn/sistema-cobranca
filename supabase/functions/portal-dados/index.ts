// Edge Function: Portal do Cliente - Dados
// Retorna dados do devedor e mensalidades por portal_token
// Acesso PÚBLICO (sem autenticação) - validação por token

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    // Extrair token da URL
    const url = new URL(req.url)
    const token = url.searchParams.get('token')

    if (!token || token.length < 20) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Buscar devedor pelo portal_token
    const { data: devedor, error: devedorError } = await supabase
      .from('devedores')
      .select('id, nome, telefone, user_id, assinatura_ativa, plano_id')
      .eq('portal_token', token)
      .or('lixo.is.null,lixo.eq.false')
      .single()

    if (devedorError || !devedor) {
      return new Response(
        JSON.stringify({ error: 'Portal não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Buscar dados da empresa
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('nome_empresa, chave_pix, asaas_api_key, modo_integracao, asaas_ambiente, cpf_cnpj, endereco, numero, bairro, cidade, estado, telefone, logo_url')
      .eq('id', devedor.user_id)
      .single()

    // Buscar método de pagamento configurado
    const { data: configMetodo } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', `${devedor.user_id}_metodo_pagamento_whatsapp`)
      .maybeSingle()

    const metodoPagamento = configMetodo?.valor || 'pix_manual'

    // Buscar mensalidades do devedor (pendentes e pagas recentes)
    const { data: mensalidades } = await supabase
      .from('mensalidades')
      .select('id, valor, data_vencimento, status, created_at, forma_pagamento, updated_at')
      .eq('devedor_id', devedor.id)
      .eq('user_id', devedor.user_id)
      .order('data_vencimento', { ascending: false })
      .limit(20)

    // Buscar boletos existentes (para link de pagamento Asaas)
    const { data: boletos } = await supabase
      .from('boletos')
      .select('mensalidade_id, invoice_url, status, asaas_id')
      .eq('devedor_id', devedor.id)
      .not('invoice_url', 'is', null)

    // Mapear boletos por mensalidade_id
    const boletosPorMensalidade: Record<string, { invoice_url: string; status: string }> = {}
    if (boletos) {
      for (const b of boletos) {
        if (b.mensalidade_id) {
          boletosPorMensalidade[b.mensalidade_id] = {
            invoice_url: b.invoice_url,
            status: b.status
          }
        }
      }
    }

    // Montar lista de mensalidades com dados de boleto
    const mensalidadesFormatadas = (mensalidades || []).map(m => ({
      id: m.id,
      valor: m.valor,
      data_vencimento: m.data_vencimento,
      status: m.status,
      forma_pagamento: m.forma_pagamento,
      updated_at: m.updated_at,
      boleto: boletosPorMensalidade[m.id] || null
    }))

    // Buscar nome do plano
    let planoNome = null
    if (devedor.plano_id) {
      const { data: plano } = await supabase
        .from('planos')
        .select('nome, valor')
        .eq('id', devedor.plano_id)
        .single()
      if (plano) planoNome = plano.nome
    }

    // Montar endereço completo
    const enderecoPartes = [
      usuario?.endereco,
      usuario?.numero ? `nº ${usuario.numero}` : null,
      usuario?.bairro,
      usuario?.cidade,
      usuario?.estado
    ].filter(Boolean)
    const enderecoCompleto = enderecoPartes.length > 0 ? enderecoPartes.join(', ') : null

    // Retornar dados públicos (NUNCA expor user_id, api keys)
    return new Response(
      JSON.stringify({
        devedor: {
          nome: devedor.nome,
          assinatura_ativa: devedor.assinatura_ativa,
          plano_nome: planoNome
        },
        empresa: {
          nome: usuario?.nome_empresa || 'Empresa',
          chave_pix: usuario?.chave_pix || null,
          cnpj: usuario?.cpf_cnpj || null,
          endereco: enderecoCompleto,
          telefone: usuario?.telefone || null,
          logo_url: usuario?.logo_url || null
        },
        metodo_pagamento: metodoPagamento,
        asaas_configurado: !!(usuario?.asaas_api_key && usuario?.modo_integracao === 'asaas'),
        mensalidades: mensalidadesFormatadas
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Erro no portal-dados:', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
