import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../supabaseClient'

// Estado da caixa de entrada: a lista de leads, o tempo real e as mutações.
//
// Tempo real com rede de proteção: se o canal não chegar a SUBSCRIBED (túnel
// caiu, publicação não configurada, aba em segundo plano), cai num polling de
// 15s. Melhor recarregar de vez em quando do que a caixa mentir que está vazia.

const POLL_MS = 15000

// Bipe curto gerado na hora — evita empacotar um mp3 só para isso e funciona
// offline. Só toca com o app aberto; o WhatsApp do celular já notifica o resto.
function tocarBipe() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1180, ctx.currentTime + 0.09)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
    osc.onended = () => ctx.close()
  } catch {
    // som é conforto, nunca erro de tela
  }
}

export function useInbox(isAdmin) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [tempoReal, setTempoReal] = useState(false)
  const [somLigado, setSomLigado] = useState(() => {
    try { return localStorage.getItem('mensalli:inbox:som') !== 'off' } catch { return true }
  })

  const canalRef = useRef(null)
  const recarregarRef = useRef(null)
  const somRef = useRef(somLigado)
  useEffect(() => { somRef.current = somLigado }, [somLigado])

  const alternarSom = useCallback(() => {
    setSomLigado(v => {
      const novo = !v
      try { localStorage.setItem('mensalli:inbox:som', novo ? 'on' : 'off') } catch { /* modo privado */ }
      return novo
    })
  }, [])

  // `sync` roda o RPC que promove quem criou conta / virou pagante. É barato,
  // mas não precisa rodar a cada evento de tempo real — só na carga e no botão.
  const carregar = useCallback(async ({ sync = false } = {}) => {
    if (!isAdmin) { setLoading(false); return }
    try {
      if (sync) await supabase.rpc('sync_mensalli_leads')
      const { data, error } = await supabase
        .from('vw_mensalli_leads')
        .select('*')
        .order('ultima_interacao', { ascending: false })
      if (error) throw error
      setLeads(data || [])
      setErro(null)
    } catch (err) {
      console.error('[inbox] erro ao carregar leads:', err)
      setErro(err.message || 'Não consegui carregar a caixa')
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  useEffect(() => { recarregarRef.current = carregar }, [carregar])
  useEffect(() => { carregar({ sync: true }) }, [carregar])

  // ---------- tempo real ----------
  useEffect(() => {
    if (!isAdmin) return

    let debounce = null
    const recarregarLogo = () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => recarregarRef.current?.({ sync: false }), 400)
    }

    const canal = supabase
      .channel('inbox-leads')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'mensalli_leads' },
        recarregarLogo)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensalli_lead_mensagens', filter: 'direcao=eq.in' },
        () => {
          if (somRef.current) tocarBipe()
          recarregarLogo()
        })
      .subscribe((status) => {
        setTempoReal(status === 'SUBSCRIBED')
      })

    canalRef.current = canal
    return () => {
      clearTimeout(debounce)
      if (canalRef.current) supabase.removeChannel(canalRef.current)
      setTempoReal(false)
    }
  }, [isAdmin])

  // ---------- polling de reserva ----------
  useEffect(() => {
    if (!isAdmin || tempoReal) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') recarregarRef.current?.({ sync: false })
    }, POLL_MS)
    return () => clearInterval(t)
  }, [isAdmin, tempoReal])

  // ---------- mutações ----------
  const aplicarLocal = useCallback((leadId, patch) => {
    setLeads(ls => ls.map(l => (l.id === leadId ? { ...l, ...patch } : l)))
  }, [])

  const salvarLead = useCallback(async (leadId, patch) => {
    const anterior = leads.find(l => l.id === leadId)
    const comData = { ...patch, updated_at: new Date().toISOString() }
    aplicarLocal(leadId, comData)
    const { error } = await supabase.from('mensalli_leads').update(comData).eq('id', leadId)
    if (error) {
      if (anterior) aplicarLocal(leadId, anterior)
      throw error
    }
    return true
  }, [leads, aplicarLocal])

  const moverStatus = useCallback((leadId, status) => salvarLead(leadId, { status }), [salvarLead])

  // O número do Mensalli também é pessoal: amigo, fornecedor e família caem no
  // mesmo webhook. `ignorado` tira da caixa E faz o whatsapp-bot parar de
  // gravar as conversas desse contato.
  const ignorarLead = useCallback(async (leadId) => {
    const { error } = await supabase
      .from('mensalli_leads')
      .update({ ignorado: true, updated_at: new Date().toISOString() })
      .eq('id', leadId)
    if (error) throw error
    setLeads(ls => ls.filter(l => l.id !== leadId))
  }, [])

  const marcarLido = useCallback(async (leadId) => {
    const lead = leads.find(l => l.id === leadId)
    if (!lead || (lead.nao_lidas === 0 && lead.lido_em)) return
    aplicarLocal(leadId, { nao_lidas: 0, lido_em: new Date().toISOString() })
    await supabase
      .from('mensalli_leads')
      .update({ nao_lidas: 0, lido_em: new Date().toISOString() })
      .eq('id', leadId)
  }, [leads, aplicarLocal])

  return {
    leads, loading, erro, tempoReal,
    somLigado, alternarSom,
    recarregar: carregar,
    salvarLead, moverStatus, ignorarLead, marcarLido,
    aplicarLocal
  }
}
