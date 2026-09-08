import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../supabaseClient'

// A conversa aberta: mensagens, tempo real, envio e URLs assinadas da mídia.
//
// Sobre o balão otimista: a edge function só grava a mensagem quando a
// Evolution devolve `key.id` (senão não dá pra deduplicar contra o eco do
// webhook). Quando ela não grava, a linha real chega pelo webhook um ou dois
// segundos depois — até lá o balão pendente segura a conversa. Ele some
// sozinho quando a mensagem de verdade aparece.

const BUCKET = 'lead-midia'
const VALIDADE_URL = 60 * 30 // 30 min: o suficiente para a sessão, curto o bastante para não vazar

export function useConversa(leadId) {
  const [mensagens, setMensagens] = useState([])
  const [pendentes, setPendentes] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [urlsMidia, setUrlsMidia] = useState({})

  const canalRef = useRef(null)

  const carregar = useCallback(async () => {
    if (!leadId) { setMensagens([]); return }
    setCarregando(true)
    const { data, error } = await supabase
      .from('mensalli_lead_mensagens')
      .select('*')
      .eq('lead_id', leadId)
      .order('enviado_em', { ascending: true })
    if (error) console.error('[conversa] erro ao carregar mensagens:', error)
    setMensagens(data || [])
    setCarregando(false)
  }, [leadId])

  useEffect(() => {
    setPendentes([])
    setUrlsMidia({})
    carregar()
  }, [carregar])

  // ---------- tempo real da conversa aberta ----------
  useEffect(() => {
    if (!leadId) return
    const canal = supabase
      .channel(`conversa-${leadId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'mensalli_lead_mensagens', filter: `lead_id=eq.${leadId}` },
        () => carregar())
      .subscribe()
    canalRef.current = canal
    return () => { if (canalRef.current) supabase.removeChannel(canalRef.current) }
  }, [leadId, carregar])

  // ---------- some com o balão pendente quando a linha real chega ----------
  useEffect(() => {
    if (pendentes.length === 0) return
    setPendentes(ps => ps.filter(p => {
      const chegou = mensagens.some(m =>
        m.direcao === 'out' &&
        (m.texto || '').trim() === p.texto.trim() &&
        new Date(m.enviado_em).getTime() >= p.criadoEm - 5000
      )
      return !chegou
    }))
  }, [mensagens]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- URLs assinadas da mídia ----------
  // Bucket privado: conversa de terceiro nunca vira link público.
  useEffect(() => {
    const paths = mensagens
      .filter(m => m.midia_status === 'ok' && m.midia_path && !urlsMidia[m.midia_path])
      .map(m => m.midia_path)
    if (paths.length === 0) return
    let cancelado = false
    ;(async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, VALIDADE_URL)
      if (cancelado || error || !data) return
      const novas = {}
      data.forEach(item => { if (item.signedUrl && item.path) novas[item.path] = item.signedUrl })
      setUrlsMidia(u => ({ ...u, ...novas }))
    })()
    return () => { cancelado = true }
  }, [mensagens]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- envio ----------
  const enviar = useCallback(async (texto) => {
    const limpo = (texto || '').trim()
    if (!limpo || !leadId) return { ok: false }

    const tempId = `tmp-${Date.now()}`
    setPendentes(ps => [...ps, { tempId, texto: limpo, criadoEm: Date.now(), status: 'enviando' }])
    setEnviando(true)

    try {
      const { data, error } = await supabase.functions.invoke('mensalli-lead-send', {
        body: { lead_id: leadId, texto: limpo }
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)

      if (data?.gravou_local) {
        await carregar()
      } else {
        // Sem key.id: a linha vem pelo eco do webhook. Marca como enviada e
        // deixa o efeito acima limpar quando ela chegar.
        setPendentes(ps => ps.map(p => (p.tempId === tempId ? { ...p, status: 'enviada' } : p)))
      }
      return { ok: true, data }
    } catch (e) {
      const msg = e?.message || 'Falha ao enviar'
      setPendentes(ps => ps.map(p => (p.tempId === tempId ? { ...p, status: 'erro', erro: msg } : p)))
      return { ok: false, erro: msg }
    } finally {
      setEnviando(false)
    }
  }, [leadId, carregar])

  const descartarPendente = useCallback((tempId) => {
    setPendentes(ps => ps.filter(p => p.tempId !== tempId))
  }, [])

  return { mensagens, pendentes, carregando, enviando, urlsMidia, enviar, recarregar: carregar, descartarPendente }
}
