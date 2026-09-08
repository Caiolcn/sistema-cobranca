import { useState, useRef, useEffect, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { supabase } from '../../supabaseClient'
import { resolverVariaveis, pendenciasDoTexto } from './utils'

// Campo de resposta com os atalhos do playbook.
//
// Digite "/" no começo para abrir a lista. O texto entra com {{nome}}, {{alunos}},
// {{nicho}}, {{plano}} e {{preco}} já resolvidos pelos dados do lead — o que não
// resolver fica com as chaves à mostra de propósito, como aviso do que falta.
//
// Nada aqui envia sozinho: o playbook manda variar o texto, e copy-paste
// idêntico em sequência é justamente o padrão que o WhatsApp pune.

// Qual atalho faz sentido agora, pelo estado do lead. É sugestão, não regra.
export function sugerirAtalho(lead) {
  if (!lead) return null
  if (lead.toque_vencido && lead.fila) {
    return `${lead.fila.toLowerCase()}${(lead.toque_num || 0) + 1}`
  }
  if (lead.status === 'novo') return 'boasvindas'
  if (lead.status === 'criou_conta') return 'c1'
  if (lead.status === 'conversando') {
    if (!lead.alunos) return 'qsonicho'
    if (lead.alunos >= 30) return 'q30'
    if (lead.alunos >= 20) return 'q2030'
    return 'qpequeno'
  }
  return null
}

const CATEGORIA_ROTULO = { venda: 'Venda', objecao: 'Objeção', followup: 'Follow-up', suporte: 'Suporte' }

export default function Composer({ lead, respostas, enviando, onEnviar, isMobile }) {
  const [texto, setTexto] = useState('')
  const [abertoPicker, setAbertoPicker] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [destaque, setDestaque] = useState(0)
  const areaRef = useRef(null)

  // Troca de conversa limpa o rascunho: mandar para o lead errado é pior do
  // que reescrever a frase.
  useEffect(() => {
    setTexto('')
    setAbertoPicker(false)
  }, [lead?.id])

  const sugestao = useMemo(() => {
    const atalho = sugerirAtalho(lead)
    return atalho ? respostas.find(r => r.atalho === atalho) : null
  }, [lead, respostas])

  const filtradas = useMemo(() => {
    const termo = filtro.trim().toLowerCase()
    const base = respostas.filter(r => r.ativo !== false)
    if (!termo) return base.slice(0, 40)
    return base.filter(r =>
      r.atalho.toLowerCase().includes(termo) ||
      r.titulo.toLowerCase().includes(termo) ||
      (r.texto || '').toLowerCase().includes(termo)
    ).slice(0, 40)
  }, [respostas, filtro])

  const pendencias = useMemo(() => pendenciasDoTexto(texto), [texto])

  const aplicarResposta = (resposta) => {
    setTexto(resolverVariaveis(resposta.texto, lead))
    setAbertoPicker(false)
    setFiltro('')
    setDestaque(0)
    // Contador de uso: ajuda a saber qual atalho realmente trabalha.
    supabase
      .from('mensalli_respostas_rapidas')
      .update({ uso_count: (resposta.uso_count || 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', resposta.id)
      .then(() => {}, () => {})
    setTimeout(() => areaRef.current?.focus(), 0)
  }

  const aoDigitar = (e) => {
    const v = e.target.value
    setTexto(v)
    // "/" no começo do campo abre a busca de atalhos.
    if (v.startsWith('/')) {
      setAbertoPicker(true)
      setFiltro(v.slice(1))
      setDestaque(0)
    } else if (abertoPicker) {
      setAbertoPicker(false)
      setFiltro('')
    }
  }

  const enviar = async () => {
    const limpo = texto.trim()
    if (!limpo || enviando) return
    const r = await onEnviar(limpo)
    if (r?.ok) setTexto('')
  }

  const aoTeclar = (e) => {
    if (abertoPicker) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setDestaque(i => Math.min(i + 1, filtradas.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setDestaque(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' && filtradas[destaque]) { e.preventDefault(); aplicarResposta(filtradas[destaque]); return }
      if (e.key === 'Escape') { setAbertoPicker(false); setTexto(''); return }
    }
    // No celular o Enter é quebra de linha e o envio é no botão.
    if (!isMobile && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  return (
    <div style={{ borderTop: '1px solid #e2e8f0', backgroundColor: '#fff', position: 'relative' }}>
      {abertoPicker && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, right: 0, maxHeight: '320px', overflowY: 'auto',
          backgroundColor: '#fff', borderTop: '1px solid #e2e8f0', boxShadow: '0 -8px 20px rgba(15,23,42,0.10)'
        }}>
          <div style={{ padding: '8px 14px', fontSize: '11px', color: '#64748b', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, background: '#fff' }}>
            {filtradas.length} resposta(s) — setas para navegar, Enter para escolher, Esc para sair
          </div>
          {filtradas.length === 0 ? (
            <div style={{ padding: '16px', fontSize: '13px', color: '#94a3b8' }}>Nenhum atalho com “{filtro}”.</div>
          ) : filtradas.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onMouseEnter={() => setDestaque(i)}
              onClick={() => aplicarResposta(r)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                backgroundColor: i === destaque ? '#eff6ff' : '#fff',
                padding: '9px 14px', borderBottom: '1px solid #f8fafc'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                <code style={{ fontSize: '11px', backgroundColor: '#f1f5f9', color: '#0f172a', borderRadius: '4px', padding: '1px 5px' }}>/{r.atalho}</code>
                <strong style={{ fontSize: '12.5px', color: '#1e293b' }}>{r.titulo}</strong>
                <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: 'auto' }}>{CATEGORIA_ROTULO[r.categoria] || r.categoria}</span>
              </div>
              <div style={{
                fontSize: '11.5px', color: '#64748b', lineHeight: 1.35,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
              }}>
                {r.texto}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Sugestão contextual + pendências */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '8px 14px 0' }}>
        {sugestao && !texto && (
          <button
            type="button"
            onClick={() => aplicarResposta(sugestao)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
              fontSize: '11.5px', color: '#1d4ed8', backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe', borderRadius: '999px', padding: '4px 10px'
            }}
          >
            <Icon icon="mdi:lightbulb-on-outline" width="14" />
            Sugerido: {sugestao.titulo}
          </button>
        )}
        {pendencias.length > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '11.5px', color: '#92400e', backgroundColor: '#fffbeb',
            border: '1px solid #fde68a', borderRadius: '999px', padding: '4px 10px'
          }}>
            <Icon icon="mdi:alert-outline" width="14" />
            Falta preencher: {pendencias.join(', ')}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', padding: '8px 14px 12px' }}>
        <textarea
          ref={areaRef}
          value={texto}
          onChange={aoDigitar}
          onKeyDown={aoTeclar}
          rows={isMobile ? 2 : 3}
          placeholder={'Escreva a resposta, ou digite / para os atalhos do playbook'}
          style={{
            flex: 1, padding: '10px 12px', borderRadius: '10px', border: '1px solid #cbd5e1',
            fontSize: '13.5px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
            lineHeight: 1.45, maxHeight: '220px'
          }}
        />
        <button
          type="button"
          onClick={enviar}
          disabled={!texto.trim() || enviando}
          title="Enviar pelo WhatsApp do Mensalli"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            backgroundColor: !texto.trim() || enviando ? '#cbd5e1' : '#16a34a',
            color: '#fff', border: 'none', borderRadius: '10px',
            padding: '11px 16px', fontSize: '13.5px', fontWeight: 600,
            cursor: !texto.trim() || enviando ? 'default' : 'pointer', flexShrink: 0
          }}
          onMouseEnter={(e) => { if (texto.trim() && !enviando) e.currentTarget.style.backgroundColor = '#15803d' }}
          onMouseLeave={(e) => { if (texto.trim() && !enviando) e.currentTarget.style.backgroundColor = '#16a34a' }}
        >
          {/* SVG inline: o ícone é a única affordance do botão e não pode
              depender do CDN do Iconify carregar. */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}
