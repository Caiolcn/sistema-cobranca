// Edge Function: enviar mensagem para um lead pela instancia master
// ---------------------------------------------------------------
// Usada pelo inbox em /app/admin/leads. Acesso AUTENTICADO + admin.
//
// Por que uma edge function e nao o whatsappService do browser:
//   - escreve a mensagem e atualiza o lead com service_role, num lugar so
//   - fica imune ao proxy de modo espelho de src/supabaseClient.js
//   - deixa o envio auditavel (e testavel) fora da UI
//
// O ECO DO WEBHOOK e o ponto delicado. Quando enviamos, a Evolution devolve o
// mesmo messages.upsert com fromMe=true e o whatsapp-bot tenta gravar de novo.
// A defesa e o wa_message_id (UNIQUE) + upsert ignoreDuplicates dos dois lados.
// Por isso: so gravamos a linha se a Evolution devolver key.id. Sem id, nao
// gravamos nada e deixamos o eco criar a linha (a UI mostra balao otimista).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Fallback de config.evolution_master_instance. Se a master for renomeada,
// troca la — ja houve incidente de 3 dias por esse nome ficar fixo no codigo.
const INSTANCIA_MENSALLI = 'mensalli_master'

// Cadencia de silencio do playbook (docs/playbook-leads-campanha.html).
// Os numeros sao INTERVALOS entre toques, nao dias absolutos:
//   A: dias +1 +4 +8      -> 1, 3, 4
//   B: dias +2 +5 +9      -> 2, 3, 4
//   C: dias +1 +3 +7 +15  -> 1, 2, 4, 8
//   D: dias +3 +6 +10     -> 3, 3, 4
const GAPS: Record<string, number[]> = {
  A: [1, 3, 4],
  B: [2, 3, 4],
  C: [1, 2, 4, 8],
  D: [3, 3, 4],
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function proximoToque(fila: string | null, toqueNum: number): string | null {
  if (!fila || !GAPS[fila]) return null
  const gap = GAPS[fila][toqueNum]
  if (gap === undefined) return null // fila esgotada: o ultimo toque foi a despedida
  const d = new Date()
  d.setDate(d.getDate() + gap)
  return d.toISOString().slice(0, 10)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Nao autenticado' }, 401)

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return json({ error: 'Token invalido' }, 401)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Admin de verdade: a conversa de lead e do numero comercial, ninguem mais entra.
    const { data: quem } = await supabase
      .from('usuarios')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    if (quem?.role !== 'admin') return json({ error: 'Apenas admin' }, 403)

    const body = await req.json().catch(() => ({}))
    const leadId: string = body.lead_id
    const texto: string = (body.texto || '').trim()
    if (!leadId) return json({ error: 'lead_id obrigatorio' }, 400)
    if (!texto) return json({ error: 'texto vazio' }, 400)

    const { data: lead, error: erroLead } = await supabase
      .from('mensalli_leads')
      .select('id, telefone, remote_jid, status, fila, toque_num, ignorado')
      .eq('id', leadId)
      .maybeSingle()
    if (erroLead || !lead) return json({ error: 'Lead nao encontrado' }, 404)
    if (lead.ignorado) return json({ error: 'Lead marcado como "nao e lead"' }, 400)

    // Contas migradas pro LID nao expoem telefone: nesses casos o destino e o
    // proprio JID, que a Evolution aceita no campo `number`.
    const destino = lead.telefone || lead.remote_jid
    if (!destino) return json({ error: 'Lead sem telefone e sem JID' }, 400)

    const { data: configRows } = await supabase
      .from('config')
      .select('chave, valor')
      .in('chave', ['evolution_api_url', 'evolution_api_key', 'evolution_master_instance'])
    const cfg: Record<string, string> = {}
    for (const r of configRows || []) cfg[r.chave] = r.valor

    const apiUrl = (cfg.evolution_api_url || '').replace(/\/+$/, '')
    const apiKey = cfg.evolution_api_key
    const instancia = cfg.evolution_master_instance || INSTANCIA_MENSALLI
    if (!apiUrl || !apiKey) return json({ error: 'Evolution nao configurada' }, 500)

    // ---------- envio ----------
    let resp: Response
    try {
      resp = await fetch(`${apiUrl}/message/sendText/${instancia}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({ number: destino, text: texto }),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return json({ error: `Falha de rede ao falar com a Evolution: ${msg}` }, 502)
    }

    const raw = await resp.text()
    let payload: any = null
    try { payload = JSON.parse(raw) } catch { /* resposta nao-JSON */ }

    if (!resp.ok) {
      return json({
        error: 'Evolution recusou o envio',
        http_status: resp.status,
        detalhe: payload?.message || payload?.error || raw.slice(0, 400),
      }, 502)
    }

    const waMessageId: string | null = payload?.key?.id || null
    const enviadoEm = payload?.messageTimestamp
      ? new Date(Number(payload.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString()

    // ---------- grava a mensagem ----------
    // Sem key.id nao da pra deduplicar contra o eco do webhook: melhor nao
    // gravar e deixar o webhook criar a linha daqui a um ou dois segundos.
    let mensagem = null
    if (waMessageId) {
      const { data: inserida } = await supabase
        .from('mensalli_lead_mensagens')
        .upsert({
          lead_id: lead.id,
          wa_message_id: waMessageId,
          direcao: 'out',
          texto,
          tipo: 'texto',
          midia_status: 'nao_aplica',
          enviado_em: enviadoEm,
        }, { onConflict: 'wa_message_id', ignoreDuplicates: true })
        .select()
        .maybeSingle()
      mensagem = inserida
    }

    // ---------- atualiza o lead ----------
    const toqueNum = lead.toque_num || 0
    const patch: Record<string, unknown> = {
      ultima_mensagem: texto,
      ultima_direcao: 'out',
      ultima_interacao: enviadoEm,
      nao_lidas: 0,
      lido_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    // Responder tira da coluna "Novo": ela significa "ainda nao respondi".
    if (lead.status === 'novo') patch.status = 'conversando'
    if (lead.fila) {
      patch.toque_num = toqueNum + 1
      patch.proximo_toque_em = proximoToque(lead.fila, toqueNum)
    }

    await supabase.from('mensalli_leads').update(patch).eq('id', lead.id)

    return json({
      ok: true,
      wa_message_id: waMessageId,
      gravou_local: Boolean(waMessageId),
      mensagem,
      instancia,
    })
  } catch (e) {
    console.error('[mensalli-lead-send] erro:', e)
    const msg = e instanceof Error ? e.message : 'Erro inesperado'
    return json({ error: msg }, 500)
  }
})
