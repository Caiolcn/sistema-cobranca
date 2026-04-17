// Edge Function: Alerta de Despesas
// Chamada pelo pg_cron todo dia às 9h BRT.
// Lê vw_alerta_despesas, interpola o template 'despesa_vencendo' e envia
// via Evolution API pro telefone do dono. Dedup por logs_mensagens.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

interface AlertaRow {
  despesa_id: string
  user_id: string
  descricao: string
  valor: number | string
  data_vencimento: string
  dias_restantes: number
  momento_alerta: string
  categoria_nome: string | null
  nome_empresa: string | null
  telefone_admin: string
  evolution_instance_name: string | null
  evolution_api_key: string | null
  evolution_api_url: string | null
}

function formatarValor(valor: number | string): string {
  const n = typeof valor === 'string' ? parseFloat(valor) : valor
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0)
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function diasRestantesTexto(dias: number): string {
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'amanhã'
  return `em ${dias} dias`
}

function interpolar(template: string, alerta: AlertaRow): string {
  return template
    .replaceAll('{{descricao}}', alerta.descricao || '')
    .replaceAll('{{valor}}', formatarValor(alerta.valor))
    .replaceAll('{{dataVencimento}}', formatarData(alerta.data_vencimento))
    .replaceAll('{{diasRestantesTexto}}', diasRestantesTexto(alerta.dias_restantes))
    .replaceAll('{{diasRestantes}}', String(alerta.dias_restantes))
    .replaceAll('{{categoria}}', alerta.categoria_nome || 'Outros')
    .replaceAll('{{nomeEmpresa}}', alerta.nome_empresa || '')
}

function normalizarTelefone(telefone: string): string {
  const apenas = telefone.replace(/\D/g, '')
  return apenas.startsWith('55') ? apenas : `55${apenas}`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Aceita apenas JWT com role=service_role (pg_cron ou operador com service role key)
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()

  let isServiceRole = false
  try {
    const payloadPart = token.split('.')[1]
    if (payloadPart) {
      const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
      const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
      const payload = JSON.parse(atob(padded))
      isServiceRole = payload?.role === 'service_role'
    }
  } catch (_e) {
    // token inválido — cai no 401 abaixo
  }

  if (!isServiceRole) {
    console.error('Auth failed. Token length:', token.length, 'has_dot:', token.includes('.'))
    return new Response(JSON.stringify({ error: 'Unauthorized — service role required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: alertas, error } = await supabase
    .from('vw_alerta_despesas')
    .select('*')

  if (error) {
    console.error('Erro ao ler vw_alerta_despesas:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (!alertas || alertas.length === 0) {
    return new Response(JSON.stringify({ sent: 0, skipped: 0, errors: 0 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const hojeISO = new Date().toISOString().slice(0, 10)
  const templateCache = new Map<string, string>()

  let sent = 0
  let skipped = 0
  let errors = 0
  const errorList: unknown[] = []

  for (const alerta of alertas as AlertaRow[]) {
    try {
      // Dedup — mesmo despesa_id + tipo 'despesa_vencendo' já enviado hoje?
      const { data: existente } = await supabase
        .from('logs_mensagens')
        .select('id')
        .eq('despesa_id', alerta.despesa_id)
        .eq('tipo', 'despesa_vencendo')
        .eq('status', 'enviado')
        .gte('enviado_em', `${hojeISO}T00:00:00`)
        .maybeSingle()

      if (existente) {
        skipped++
        continue
      }

      if (!alerta.evolution_api_key || !alerta.evolution_api_url || !alerta.evolution_instance_name) {
        errors++
        errorList.push({ despesa_id: alerta.despesa_id, motivo: 'Evolution API não configurada' })
        continue
      }

      // Template: customizado primeiro, padrão como fallback
      let template = templateCache.get(alerta.user_id)
      if (!template) {
        const { data: templates } = await supabase
          .from('templates')
          .select('mensagem, is_padrao')
          .eq('user_id', alerta.user_id)
          .eq('tipo', 'despesa_vencendo')
          .eq('ativo', true)

        const customizado = templates?.find(t => t.is_padrao !== true)
        const padrao = templates?.find(t => t.is_padrao === true)
        template = customizado?.mensagem || padrao?.mensagem

        if (!template) {
          errors++
          errorList.push({ despesa_id: alerta.despesa_id, motivo: 'template não encontrado' })
          continue
        }
        templateCache.set(alerta.user_id, template)
      }

      const mensagem = interpolar(template, alerta)
      const numero = normalizarTelefone(alerta.telefone_admin)

      const resp = await fetch(
        `${alerta.evolution_api_url}/message/sendText/${alerta.evolution_instance_name}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': alerta.evolution_api_key
          },
          body: JSON.stringify({ number: numero, text: mensagem })
        }
      )

      const respBody = await resp.json().catch(() => null)

      await supabase.from('logs_mensagens').insert({
        user_id: alerta.user_id,
        despesa_id: alerta.despesa_id,
        tipo: 'despesa_vencendo',
        telefone: numero,
        mensagem,
        valor_parcela: typeof alerta.valor === 'string' ? parseFloat(alerta.valor) : alerta.valor,
        data_vencimento: alerta.data_vencimento,
        status: resp.ok ? 'enviado' : 'falha',
        erro: resp.ok ? null : JSON.stringify(respBody),
        response_api: respBody
      })

      if (resp.ok) {
        sent++
      } else {
        errors++
        errorList.push({ despesa_id: alerta.despesa_id, status: resp.status, body: respBody })
      }
    } catch (err) {
      errors++
      errorList.push({ despesa_id: alerta.despesa_id, err: String(err) })
    }
  }

  return new Response(
    JSON.stringify({ sent, skipped, errors, errorList: errorList.slice(0, 10) }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
