// Edge Function: o WhatsApp digitado no cadastro existe?
// ---------------------------------------------------------------------------
// O Signup valida formato (DDD, 9 na frente) em src/utils/validacaoCadastro.js,
// mas formato não prova nada: (62) 98555-6565 passa e não é de ninguém. Aqui a
// pergunta vai pro WhatsApp, pela instância MASTER, via /chat/whatsappNumbers —
// só consulta, nenhuma mensagem sai.
//
// Acesso PUBLICO (roda antes de a conta existir, então não há JWT). Por isso:
// - Limite por IP (LIMITE_POR_IP_1H): sem ele, vira um serviço grátis de "esse
//   número tem WhatsApp?" pendurado no número comercial do Mensalli.
// - Teto geral por hora (LIMITE_GLOBAL_1H): rodízio de IP não passa disso, e
//   consulta em massa é o tipo de coisa que o WhatsApp pune.
// - Resposta só diz existe/não existe; não devolve jid, nome nem foto.
//
// Falha da Evolution ou teto geral estourado => { indisponivel: true } e o
// Signup DEIXA cadastrar. Master caída não pode derrubar o cadastro de cliente
// real; o pior caso é voltar ao comportamento de antes.
//
// Tentativas em signup_whatsapp_checagens (sql-criar-signup-whatsapp-checagens.sql).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Fallback de config.evolution_master_instance (mesmo do signup-boas-vindas).
const INSTANCIA_MENSALLI = 'mensalli_master'

const LIMITE_POR_IP_1H = 10
const LIMITE_GLOBAL_1H = 150

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

function ipDaRequisicao(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || ''
  return (xff.split(',')[0] || req.headers.get('cf-connecting-ip') || 'desconhecido').trim()
}

// Conta BR antiga pode existir no WhatsApp SEM o nono dígito — pergunta pelas
// duas formas, igual ao variantes() do signup-boas-vindas.
function variantes(telefone: string): string[] {
  let n = (telefone || '').replace(/\D/g, '')
  if (!n) return []
  if (!n.startsWith('55')) n = '55' + n

  const lista = [n]
  const ddd = n.substring(2, 4)
  const resto = n.substring(4)
  if (resto.length === 9 && resto.startsWith('9')) lista.push('55' + ddd + resto.substring(1))
  else if (resto.length === 8) lista.push('55' + ddd + '9' + resto)
  return lista
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    const body = await req.json().catch(() => ({}))
    const digitos = String(body?.telefone || '').replace(/\D/g, '')
    if (digitos.length !== 10 && digitos.length !== 11) {
      return json({ error: 'Telefone inválido' }, 400)
    }

    const lista = variantes(digitos)
    const ip = ipDaRequisicao(req)
    const ha1h = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const registrar = (resultado: string) =>
      supabase.from('signup_whatsapp_checagens').insert({ telefone_norm: lista[0], ip, resultado })

    const [{ count: porIp }, { count: global }] = await Promise.all([
      supabase.from('signup_whatsapp_checagens').select('id', { count: 'exact', head: true })
        .eq('ip', ip).gte('created_at', ha1h),
      supabase.from('signup_whatsapp_checagens').select('id', { count: 'exact', head: true })
        .gte('created_at', ha1h),
    ])

    if ((porIp || 0) >= LIMITE_POR_IP_1H) {
      await registrar('limite_ip')
      return json({ error: 'Muitas tentativas. Tente de novo daqui a pouco.' }, 429)
    }
    if ((global || 0) >= LIMITE_GLOBAL_1H) {
      await registrar('limite_global')
      return json({ indisponivel: true })
    }

    const { data: cfgRows } = await supabase
      .from('config').select('chave, valor')
      .in('chave', ['evolution_api_url', 'evolution_api_key', 'evolution_master_instance'])
    const cfg: Record<string, string> = {}
    for (const r of cfgRows || []) cfg[r.chave] = r.valor

    const apiUrl = (cfg.evolution_api_url || '').replace(/\/+$/, '')
    const apiKey = cfg.evolution_api_key
    const instancia = cfg.evolution_master_instance || INSTANCIA_MENSALLI
    if (!apiUrl || !apiKey) {
      await registrar('indisponivel')
      return json({ indisponivel: true })
    }

    let achados: Record<string, unknown>[]
    try {
      const r = await fetch(`${apiUrl}/chat/whatsappNumbers/${instancia}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ numbers: lista.map((n) => n + '@s.whatsapp.net') }),
        signal: AbortSignal.timeout(10000),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
      const dados = await r.json()
      achados = Array.isArray(dados) ? dados : (dados?.response || [])
      if (!Array.isArray(achados) || achados.length === 0) throw new Error('resposta vazia')
    } catch (e) {
      console.error('[signup-verificar-whatsapp] evolution falhou:', e instanceof Error ? e.message : e)
      await registrar('indisponivel')
      return json({ indisponivel: true })
    }

    const existe = achados.some((x) => x?.exists === true)
    await registrar(existe ? 'existe' : 'nao_existe')
    return json({ existe })
  } catch (e) {
    console.error('[signup-verificar-whatsapp] erro:', e)
    return json({ indisponivel: true })
  }
})
