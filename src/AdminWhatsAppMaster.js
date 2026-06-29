import { useState, useEffect, useRef, useCallback } from 'react'
import { useUser } from './contexts/UserContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import useWindowSize from './hooks/useWindowSize'
import { Icon } from '@iconify/react'

// Tela ADMIN pra conectar o WhatsApp MASTER da Mensalli — o número da
// plataforma que dispara avisos de sistema (ex.: "seu WhatsApp caiu").
// Reaproveita o fluxo de QR Code da Evolution, mas numa instância fixa
// (config.evolution_master_instance, default "mensalli_master").

const MASTER_INSTANCE_FALLBACK = 'mensalli_master'

export default function AdminWhatsAppMaster() {
  const { isAdmin, loading: userLoading } = useUser()
  const navigate = useNavigate()
  const { isMobile } = useWindowSize()

  const [apiUrl, setApiUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [instance, setInstance] = useState(MASTER_INSTANCE_FALLBACK)
  const [status, setStatus] = useState('disconnected') // 'disconnected' | 'connecting' | 'connected'
  const [qrCode, setQrCode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [numero, setNumero] = useState(null)
  const [tempoRestante, setTempoRestante] = useState(120)
  const cfgRef = useRef({ apiUrl: '', apiKey: '', instance: MASTER_INSTANCE_FALLBACK })

  useEffect(() => {
    if (!userLoading && !isAdmin) navigate('/app/home')
  }, [isAdmin, userLoading, navigate])

  useEffect(() => { cfgRef.current = { apiUrl, apiKey, instance } }, [apiUrl, apiKey, instance])

  // Carregar credenciais globais + nome da instância master + status
  const carregar = useCallback(async () => {
    const { data: configs } = await supabase
      .from('config')
      .select('chave, valor')
      .in('chave', ['evolution_api_key', 'evolution_api_url', 'evolution_master_instance'])

    const map = {}
    configs?.forEach(c => { map[c.chave] = c.valor })
    const url = map.evolution_api_url || 'https://service-evolution-api.tnvro1.easypanel.host'
    const key = map.evolution_api_key || ''
    const inst = map.evolution_master_instance || MASTER_INSTANCE_FALLBACK
    setApiUrl(url); setApiKey(key); setInstance(inst)

    if (key) {
      try {
        const res = await fetch(`${url}/instance/connectionState/${inst}`, { headers: { apikey: key } })
        if (res.ok) {
          const data = await res.json()
          if ((data.instance?.state) === 'open') {
            setStatus('connected')
            // busca o número conectado (best-effort)
            try {
              const pr = await fetch(`${url}/instance/fetchInstances`, { headers: { apikey: key } })
              if (pr.ok) {
                const arr = await pr.json()
                const minha = arr.find(i => i.instance?.instanceName === inst)
                setNumero(minha?.instance?.owner || minha?.instance?.profileName || null)
              }
            } catch (_e) { /* ignore */ }
          }
        }
      } catch (_e) { /* instância não existe ainda */ }
    }
  }, [])

  useEffect(() => { if (isAdmin) carregar() }, [isAdmin, carregar])

  // Conectar: cria a instância se não existir e gera o QR
  const conectar = async () => {
    setLoading(true); setErro('')
    try {
      // 1. existe?
      let existe = false, estado = null
      const r = await fetch(`${apiUrl}/instance/fetchInstances`, { headers: { apikey: apiKey } })
      if (r.ok) {
        const arr = await r.json()
        const minha = arr.find(i => i.instance?.instanceName === instance)
        existe = !!minha
        estado = minha?.instance?.state || null
      }

      if (existe && estado === 'open') {
        setStatus('connected'); setQrCode(null)
        setLoading(false)
        return
      }

      // 2. criar se não existir
      if (!existe) {
        const cr = await fetch(`${apiUrl}/instance/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: apiKey },
          body: JSON.stringify({ instanceName: instance, qrcode: true, integration: 'WHATSAPP-BAILEYS' })
        })
        if (cr.status !== 403 && cr.status !== 409 && !cr.ok) {
          const e = await cr.json().catch(() => ({}))
          throw new Error(e.message || `Erro ao criar instância: HTTP ${cr.status}`)
        }
      }

      // 3. gerar QR
      const cn = await fetch(`${apiUrl}/instance/connect/${instance}`, { headers: { apikey: apiKey } })
      if (!cn.ok) {
        const e = await cn.json().catch(() => ({}))
        throw new Error(e.message || `HTTP ${cn.status}`)
      }
      const data = await cn.json()
      const qr = data.base64 || data.qrcode?.base64 || data.code || data.qr
      if (!qr) throw new Error('QR Code não foi gerado pela API.')

      setQrCode(qr); setStatus('connecting'); setTempoRestante(120)
    } catch (e) {
      setErro(e.message); setStatus('disconnected')
    } finally {
      setLoading(false)
    }
  }

  // Polling enquanto conecta
  useEffect(() => {
    if (status !== 'connecting' || !qrCode) return
    const cfg = cfgRef.current
    if (!cfg.apiKey) return

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`${cfg.apiUrl}/instance/connectionState/${cfg.instance}`, { headers: { apikey: cfg.apiKey } })
        if (res.ok) {
          const data = await res.json()
          if ((data.instance?.state) === 'open') {
            setStatus('connected'); setQrCode(null); carregar()
          }
        }
      } catch (_e) { /* ignore */ }
    }, 3000)

    const countdownId = setInterval(() => setTempoRestante(prev => (prev <= 1 ? 0 : prev - 1)), 1000)
    const timeoutId = setTimeout(() => {
      clearInterval(intervalId); clearInterval(countdownId)
      setQrCode(null); setStatus('disconnected'); setTempoRestante(120)
      setErro('Tempo expirado. Clique em "Conectar" novamente.')
    }, 120000)

    return () => { clearInterval(intervalId); clearInterval(countdownId); clearTimeout(timeoutId) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, qrCode])

  const desconectar = async () => {
    setLoading(true); setErro('')
    try {
      await fetch(`${apiUrl}/instance/logout/${instance}`, { method: 'DELETE', headers: { apikey: apiKey } })
      setStatus('disconnected'); setQrCode(null); setNumero(null)
    } catch (e) {
      setErro('Erro ao desconectar: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  if (userLoading || !isAdmin) return null

  const corStatus = status === 'connected' ? '#16a34a' : status === 'connecting' ? '#f59e0b' : '#dc2626'
  const labelStatus = status === 'connected' ? 'Conectado' : status === 'connecting' ? 'Aguardando leitura...' : 'Desconectado'

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '760px', margin: '0 auto' }}>
      <button
        onClick={() => navigate('/app/admin')}
        style={{ background: 'transparent', border: 'none', color: '#667eea', cursor: 'pointer', fontSize: '13px', padding: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '4px' }}
      >
        <Icon icon="mdi:arrow-left" width="16" /> Voltar ao /admin
      </button>

      <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: 'bold', color: '#333', margin: '0 0 6px 0' }}>
        WhatsApp Master da Mensalli
      </h1>
      <p style={{ color: '#666', fontSize: '14px', margin: '0 0 24px 0' }}>
        Número da plataforma que dispara avisos de sistema — como avisar um gestor de que o WhatsApp <strong>dele</strong> caiu (já que o canal dele está fora do ar). Instância: <code>{instance}</code>
      </p>

      {erro && (
        <div style={{ padding: '14px 16px', borderRadius: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#c62828', marginBottom: '20px', fontSize: '14px' }}>
          {erro}
        </div>
      )}

      <div style={{ backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '12px', padding: isMobile ? '20px' : '28px' }}>
        {/* Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: corStatus, flexShrink: 0 }} />
          <span style={{ fontSize: '15px', fontWeight: 600, color: corStatus }}>{labelStatus}</span>
          {numero && <span style={{ fontSize: '13px', color: '#888' }}>· {numero}</span>}
        </div>

        {/* Conectado */}
        {status === 'connected' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Icon icon="mdi:check-circle" width={64} style={{ color: '#16a34a', marginBottom: 12 }} />
            <p style={{ fontSize: 15, color: '#333', fontWeight: 600, margin: '0 0 6px' }}>WhatsApp master conectado!</p>
            <p style={{ fontSize: 13, color: '#888', margin: '0 0 20px' }}>Os avisos de sistema serão enviados por este número.</p>
            <button onClick={desconectar} disabled={loading} style={{
              padding: '10px 20px', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
              borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6
            }}>
              <Icon icon="mdi:logout-variant" width={16} /> Desconectar
            </button>
          </div>
        )}

        {/* QR Code */}
        {status === 'connecting' && qrCode && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: '#333', margin: '0 0 16px' }}>
              Abra o WhatsApp no celular da Mensalli → <strong>Aparelhos conectados</strong> → escaneie:
            </p>
            <img src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`} alt="QR Code"
              style={{ width: 260, height: 260, border: '1px solid #e5e7eb', borderRadius: 12, padding: 8, backgroundColor: '#fff' }} />
            <p style={{ fontSize: 13, color: '#888', marginTop: 12 }}>
              Expira em {Math.floor(tempoRestante / 60)}:{String(tempoRestante % 60).padStart(2, '0')}
            </p>
          </div>
        )}

        {/* Desconectado */}
        {status === 'disconnected' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Icon icon="mdi:whatsapp" width={64} style={{ color: '#25D366', marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: '#666', margin: '0 0 20px' }}>
              {apiKey ? 'Clique abaixo pra gerar o QR Code e conectar o número da plataforma.' : 'Configure a Evolution API primeiro (chave não encontrada na tabela config).'}
            </p>
            <button onClick={conectar} disabled={loading || !apiKey} style={{
              padding: '12px 28px', backgroundColor: apiKey ? '#344848' : '#ccc', color: 'white', border: 'none',
              borderRadius: '8px', fontSize: '15px', fontWeight: 600, cursor: loading || !apiKey ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8
            }}>
              <Icon icon={loading ? 'mdi:loading' : 'mdi:qrcode'} width={18} style={loading ? { animation: 'ds-spin 1s linear infinite' } : undefined} />
              {loading ? 'Gerando...' : 'Conectar WhatsApp'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
