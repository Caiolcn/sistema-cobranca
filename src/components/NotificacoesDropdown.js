import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { supabase } from '../supabaseClient'

const TIPOS = {
  pagamento: { icon: 'fluent:money-20-regular', cor: '#10b981', bg: '#ecfdf5' },
  lead: { icon: 'fluent:person-add-20-regular', cor: '#8b5cf6', bg: '#f5f3ff' },
  agendamento: { icon: 'fluent:calendar-20-regular', cor: '#ec4899', bg: '#fdf2f8' },
  vencendo: { icon: 'fluent:alert-20-regular', cor: '#f59e0b', bg: '#fffbeb' },
  atrasada: { icon: 'fluent:error-circle-20-regular', cor: '#ef4444', bg: '#fef2f2' },
}

const storageKey = (userId) => `mensalli_notif_last_read_${userId}`

export function getLastRead(userId) {
  return localStorage.getItem(storageKey(userId)) || '1970-01-01T00:00:00Z'
}

export function setLastReadNow(userId) {
  localStorage.setItem(storageKey(userId), new Date().toISOString())
}

const fmtValor = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(v || 0))

const fmtDataBr = (iso) => {
  if (!iso) return ''
  const [y, m, d] = String(iso).split('-')
  return `${d}/${m}/${y}`
}

export async function carregarNotificacoes(userId) {
  if (!userId) return []
  const agora = new Date()
  const hojeStr = agora.toISOString().split('T')[0]
  const hojeIni = `${hojeStr}T00:00:00`

  const [pgRes, leadRes, agRes, vencRes, atrRes] = await Promise.all([
    supabase
      .from('mensalidades')
      .select('id, valor, data_pagamento, devedores(nome)')
      .eq('user_id', userId)
      .eq('status', 'pago')
      .gte('data_pagamento', hojeStr)
      .order('data_pagamento', { ascending: false })
      .limit(10),
    supabase
      .from('leads')
      .select('id, nome, telefone, origem, created_at')
      .eq('user_id', userId)
      .gte('created_at', hojeIni)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('agendamentos')
      .select('id, data, horario, created_at, devedores(nome)')
      .eq('user_id', userId)
      .gte('created_at', hojeIni)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('mensalidades')
      .select('id, valor, data_vencimento, devedores(nome)')
      .eq('user_id', userId)
      .in('status', ['pendente', 'atrasado'])
      .eq('data_vencimento', hojeStr)
      .limit(10),
    supabase
      .from('mensalidades')
      .select('id, valor, data_vencimento, devedores(nome)')
      .eq('user_id', userId)
      .in('status', ['pendente', 'atrasado'])
      .lt('data_vencimento', hojeStr)
      .order('data_vencimento', { ascending: false })
      .limit(10),
  ])

  const itens = []

  for (const m of pgRes.data || []) {
    itens.push({
      tipo: 'pagamento',
      id: `p-${m.id}`,
      titulo: `${m.devedores?.nome || 'Cliente'} pagou ${fmtValor(m.valor)}`,
      sub: 'Pagamento confirmado hoje',
      timestamp: `${m.data_pagamento}T12:00:00`,
      link: '/app/financeiro?status=pago',
    })
  }
  for (const l of leadRes.data || []) {
    itens.push({
      tipo: 'lead',
      id: `l-${l.id}`,
      titulo: `Novo lead: ${l.nome || l.telefone || 'Sem nome'}`,
      sub: l.origem === 'bot_whatsapp' ? 'Bot WhatsApp' : (l.origem || 'Manual'),
      timestamp: l.created_at,
      link: '/app/crm',
    })
  }
  for (const a of agRes.data || []) {
    itens.push({
      tipo: 'agendamento',
      id: `a-${a.id}`,
      titulo: `${a.devedores?.nome || 'Aluno'} agendou aula`,
      sub: `${fmtDataBr(a.data)}${a.horario ? ' · ' + a.horario : ''}`,
      timestamp: a.created_at,
      link: '/app/horarios',
    })
  }
  for (const m of vencRes.data || []) {
    itens.push({
      tipo: 'vencendo',
      id: `v-${m.id}`,
      titulo: `${m.devedores?.nome || 'Cliente'} vence hoje`,
      sub: fmtValor(m.valor),
      timestamp: `${m.data_vencimento}T08:00:00`,
      link: '/app/financeiro',
    })
  }
  for (const m of atrRes.data || []) {
    itens.push({
      tipo: 'atrasada',
      id: `at-${m.id}`,
      titulo: `${m.devedores?.nome || 'Cliente'} em atraso`,
      sub: `${fmtValor(m.valor)} · venceu ${fmtDataBr(m.data_vencimento)}`,
      timestamp: `${m.data_vencimento}T08:00:00`,
      link: '/app/financeiro?inadimplente=true',
    })
  }

  return itens.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
}

export async function contarNaoLidas(userId) {
  const itens = await carregarNotificacoes(userId)
  const lastRead = getLastRead(userId)
  return itens.filter((i) => String(i.timestamp) > lastRead).length
}

export default function NotificacoesDropdown({ userId, onClose, onMarcarLidos }) {
  const navigate = useNavigate()
  const [itens, setItens] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelado = false
    if (!userId) return
    carregarNotificacoes(userId).then((data) => {
      if (cancelado) return
      setItens(data)
      setLoading(false)
      setLastReadNow(userId)
      if (onMarcarLidos) onMarcarLidos()
    })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  return (
    <div
      style={{
        position: 'absolute',
        top: 'calc(100% + 8px)',
        right: 0,
        width: '380px',
        maxHeight: '480px',
        backgroundColor: 'white',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
        zIndex: 202,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: '700', color: '#344848' }}>Notificações</div>
        <div style={{ fontSize: '12px', color: '#9ca3af' }}>Hoje</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        {loading && (
          <div style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
            Carregando...
          </div>
        )}
        {!loading && itens.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af' }}>
            <Icon icon="fluent:alert-off-20-regular" width="36" height="36" />
            <div style={{ fontSize: '13px', marginTop: '8px' }}>
              Nenhuma notificação por enquanto
            </div>
          </div>
        )}
        {!loading &&
          itens.map((item) => {
            const tipo = TIPOS[item.tipo]
            return (
              <div
                key={item.id}
                onClick={() => {
                  navigate(item.link)
                  onClose()
                }}
                style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f9fafb')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: tipo.bg,
                    color: tipo.cor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon icon={tipo.icon} width="20" height="20" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#111',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.titulo}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '1px' }}>
                    {item.sub}
                  </div>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
