// Edge Function: Portal do Cliente - Atualizar Ficha
// Permite que o próprio aluno preencha/corrija a ficha dele pelo portal público.
// Acesso PÚBLICO (sem autenticação) - validação por portal_token.
//
// SEGURANÇA: só aceita os campos da whitelist abaixo. Campos de identidade,
// roteamento e cobrança NUNCA são editáveis aqui:
//   - nome / telefone           -> chaves de identidade e roteamento do WhatsApp
//   - responsavel_telefone      -> vira o telefone canônico quando há responsável
//   - assinatura_ativa, plano_id, dia_vencimento, valor, status, portal_token, user_id

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Campos que o aluno PODE editar pela ficha. Tudo fora disso é ignorado.
const CAMPOS_TEXTO = [
  'email',
  'responsavel_nome',
  'cep',
  'endereco',
  'numero',
  'complemento',
  'bairro',
  'cidade',
  'estado',
]

// Normaliza string: trim + null quando vazio. Limita tamanho pra evitar abuso.
function limparTexto(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, max)
  return s.length ? s : null
}

// Valida CPF (11 dígitos + dígitos verificadores).
function isValidCpf(value: string): boolean {
  const cpf = (value || '').replace(/\D/g, '')
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i)
  let d1 = 11 - (soma % 11)
  if (d1 >= 10) d1 = 0
  if (d1 !== parseInt(cpf[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i)
  let d2 = 11 - (soma % 11)
  if (d2 >= 10) d2 = 0
  return d2 === parseInt(cpf[10])
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const body = await req.json()
    const token = body?.token
    const ficha = body?.ficha || {}

    if (!token || typeof token !== 'string' || token.length < 20) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Validar token e buscar devedor (ignora lixeira)
    const { data: devedor, error: devedorError } = await supabase
      .from('devedores')
      .select('id, cpf')
      .eq('portal_token', token)
      .or('lixo.is.null,lixo.eq.false')
      .single()

    if (devedorError || !devedor) {
      return new Response(
        JSON.stringify({ error: 'Portal não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Montar update apenas com a whitelist
    const update: Record<string, unknown> = {}

    for (const campo of CAMPOS_TEXTO) {
      if (campo in ficha) {
        update[campo] = limparTexto(ficha[campo])
      }
    }

    // CPF: aluno pode preencher/corrigir o próprio CPF. Valida os dígitos.
    // CPF vazio é ignorado (não apaga um CPF já cadastrado por engano).
    if ('cpf' in ficha) {
      const cpfInformado = String(ficha.cpf || '').replace(/\D/g, '')
      if (cpfInformado) {
        if (!isValidCpf(cpfInformado)) {
          return new Response(
            JSON.stringify({ code: 'cpf_invalid', error: 'CPF inválido. Confira os números.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        update.cpf = cpfInformado
      }
    }

    // data_nascimento: aceita YYYY-MM-DD ou limpa pra null
    if ('data_nascimento' in ficha) {
      const d = String(ficha.data_nascimento || '').trim()
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        update.data_nascimento = d
      } else if (!d) {
        update.data_nascimento = null
      }
      // formato inválido: ignora silenciosamente (front já valida)
    }

    if (Object.keys(update).length === 0) {
      return new Response(
        JSON.stringify({ success: true, atualizado: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    update.updated_at = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('devedores')
      .update(update)
      .eq('id', devedor.id)

    if (updateError) {
      console.error('❌ Erro ao atualizar ficha:', updateError)
      return new Response(
        JSON.stringify({ error: 'Erro ao salvar os dados' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ Ficha atualizada pelo aluno via portal:', devedor.id)

    return new Response(
      JSON.stringify({ success: true, atualizado: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Erro no portal-atualizar-ficha:', error)
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
