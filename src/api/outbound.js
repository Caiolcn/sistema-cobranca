import { supabase } from '../supabaseClient'

// GET /api/outbound/leads — lista leads com filtros
export async function getLeads(instanceId, filters = {}) {
  let query = supabase
    .from('outbound_leads')
    .select('*')
    .eq('instance_id', instanceId)
    .order('criado_em', { ascending: false })

  if (filters.vertical) query = query.eq('vertical', filters.vertical)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.data_minima) query = query.gte('criado_em', filters.data_minima)

  const { data, error } = await query

  if (error) throw new Error(`Erro ao buscar leads: ${error.message}`)
  return data
}

// GET /api/outbound/daily-list — leads de hoje (último cron)
export async function getDailyList(instanceId) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('outbound_leads')
    .select('*')
    .eq('instance_id', instanceId)
    .eq('status', 'novo')
    .gte('criado_em', today.toISOString())
    .order('vertical', { ascending: true })

  if (error) throw new Error(`Erro ao buscar daily list: ${error.message}`)
  return data
}

// POST /api/outbound/lead — criar novo lead
export async function createLead(instanceId, lead) {
  const { data, error } = await supabase
    .from('outbound_leads')
    .insert([
      {
        instance_id: instanceId,
        nome: lead.nome,
        vertical: lead.vertical,
        instagram_handle: lead.instagram_handle,
        telefone: lead.telefone,
        google_maps_url: lead.google_maps_url,
        mensagem_template: lead.mensagem_template
      }
    ])
    .select()

  if (error) throw new Error(`Erro ao criar lead: ${error.message}`)
  return data[0]
}

// PATCH /api/outbound/lead/:id — atualizar status/notas
// data_abordagem / data_resposta / etapa_desde são preenchidos pelo trigger
// trg_outbound_leads_etapa na troca de status.
export async function updateLead(leadId, updates) {
  const { data, error } = await supabase
    .from('outbound_leads')
    .update(updates)
    .eq('id', leadId)
    .select()

  if (error) throw new Error(`Erro ao atualizar lead: ${error.message}`)
  return data[0]
}

// Respondeu / Criou conta / Fechado automáticos (sql-outbound-crm.sql)
export async function syncOutbound() {
  const { data, error } = await supabase.rpc('sync_outbound_leads')
  if (error) throw new Error(`Erro ao sincronizar outbound: ${error.message}`)
  return data?.[0] || null
}

// Importa em lote; lugares já importados (mesmo place_id) são ignorados
export async function createBulkLeads(instanceId, leads) {
  const formatted = leads.map(lead => ({
    instance_id: instanceId,
    nome: lead.nome,
    vertical: lead.vertical,
    instagram_handle: lead.instagram_handle || null,
    telefone: lead.telefone || null,
    google_maps_url: lead.google_maps_url,
    mensagem_template: lead.mensagem_template || null,
    place_id: lead.place_id || null,
    dados_google: lead.dados_google || null
  }))

  const { data, error } = await supabase
    .from('outbound_leads')
    .upsert(formatted, { onConflict: 'instance_id,place_id', ignoreDuplicates: true })
    .select()

  if (error) throw new Error(`Erro ao criar leads em lote: ${error.message}`)
  return data
}

// GET /api/outbound/stats — estatísticas
export async function getStats(instanceId) {
  const { data, error } = await supabase
    .from('outbound_leads')
    .select('status')
    .eq('instance_id', instanceId)

  if (error) throw new Error(`Erro ao buscar estatísticas: ${error.message}`)

  const stats = {
    total: data.length,
    novo: data.filter(d => d.status === 'novo').length,
    abordado: data.filter(d => d.status === 'abordado').length,
    respondeu: data.filter(d => d.status === 'respondeu').length,
    nao_respondeu: data.filter(d => d.status === 'nao_respondeu').length,
    trial_criado: data.filter(d => d.status === 'trial_criado').length,
    fechado: data.filter(d => d.status === 'fechado').length
  }

  stats.conversao_resposta = stats.respondeu / stats.abordado || 0
  stats.conversao_trial = stats.trial_criado / stats.respondeu || 0
  stats.conversao_total = stats.fechado / stats.abordado || 0

  return stats
}
