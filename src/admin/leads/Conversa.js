import { useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { formatarHora, duracaoAudio, rotuloTipo } from './utils'

// A conversa em si. Mídia antiga pode não baixar (o WhatsApp expira o arquivo)
// e nesse caso o balão vira um atalho para abrir no WhatsApp — é degradação
// esperada, não erro de tela.

const diaDe = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

const rotuloDia = (iso) => {
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const ontem = new Date(Date.now() - 86400000).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const d = diaDe(iso)
  if (d === hoje) return 'Hoje'
  if (d === ontem) return 'Ontem'
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'long' })
}

function Midia({ m, url, telefone }) {
  const abrirNoWhats = () => {
    const d = String(telefone || '').replace(/\D/g, '')
    if (d) window.open(`https://wa.me/${d}`, '_blank', 'noopener')
  }

  if (m.midia_status === 'pendente') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '12px', padding: '4px 0' }}>
        <Icon icon="mdi:progress-download" width="15" /> Baixando {rotuloTipo(m.tipo).toLowerCase()}…
      </div>
    )
  }

  if (m.midia_status === 'erro' || !url) {
    return (
      <button
        type="button"
        onClick={abrirNoWhats}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px',
          color: '#0f766e', background: '#f0fdfa', border: '1px solid #99f6e4',
          borderRadius: '8px', padding: '6px 9px', cursor: telefone ? 'pointer' : 'default', width: '100%'
        }}
        title={telefone ? 'Abrir a conversa no WhatsApp' : 'Sem número para abrir'}
      >
        <Icon icon="mdi:paperclip" width="15" />
        {rotuloTipo(m.tipo)} — abrir no WhatsApp
      </button>
    )
  }

  if (m.tipo === 'audio') {
    return (
      <div style={{ minWidth: '210px' }}>
        <audio controls preload="none" src={url} style={{ width: '100%', height: '34px' }} />
        {m.duracao_seg ? (
          <div style={{ fontSize: '10px', color: '#94a3b8' }}>{duracaoAudio(m.duracao_seg)}</div>
        ) : null}
      </div>
    )
  }

  if (m.tipo === 'imagem' || m.tipo === 'sticker') {
    return (
      <img
        src={url}
        alt={m.tipo === 'sticker' ? 'Figurinha' : 'Imagem recebida'}
        onClick={() => window.open(url, '_blank', 'noopener')}
        style={{
          maxWidth: m.tipo === 'sticker' ? '110px' : '240px',
          maxHeight: '260px', borderRadius: '8px', cursor: 'zoom-in', display: 'block'
        }}
      />
    )
  }

  if (m.tipo === 'video') {
    return <video controls preload="metadata" src={url} style={{ maxWidth: '240px', borderRadius: '8px', display: 'block' }} />
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#1d4ed8' }}
    >
      <Icon icon="mdi:file-document-outline" width="15" /> Abrir documento
    </a>
  )
}

export default function Conversa({ mensagens, pendentes, carregando, urlsMidia, telefone, onDescartarPendente }) {
  const fimRef = useRef(null)

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' })
  }, [mensagens.length, pendentes.length])

  if (carregando) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Carregando conversa…</div>
  }

  if (mensagens.length === 0 && pendentes.length === 0) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Nenhuma mensagem registrada nesta conversa.</div>
  }

  let diaAnterior = null

  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {mensagens.map(m => {
        const dia = diaDe(m.enviado_em)
        const novoDia = dia !== diaAnterior
        diaAnterior = dia
        const meu = m.direcao === 'out'
        const temMidia = m.tipo !== 'texto'

        return (
          <div key={m.id}>
            {novoDia && (
              <div style={{ textAlign: 'center', margin: '12px 0 8px' }}>
                <span style={{
                  fontSize: '11px', color: '#64748b', backgroundColor: '#e2e8f0',
                  borderRadius: '999px', padding: '2px 10px'
                }}>
                  {rotuloDia(m.enviado_em)}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: meu ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '78%',
                backgroundColor: meu ? '#dcf8c6' : '#fff',
                border: `1px solid ${meu ? '#bbf0a0' : '#e2e8f0'}`,
                borderRadius: meu ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                padding: '7px 10px 5px', fontSize: '13.5px', color: '#1e293b',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45
              }}>
                {temMidia && (
                  <div style={{ marginBottom: m.texto ? '6px' : '2px' }}>
                    <Midia m={m} url={urlsMidia[m.midia_path]} telefone={telefone} />
                  </div>
                )}
                {m.texto}
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px', textAlign: 'right' }}>
                  {formatarHora(m.enviado_em)}
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {pendentes.map(p => (
        <div key={p.tempId} style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{
            maxWidth: '78%',
            backgroundColor: p.status === 'erro' ? '#fef2f2' : '#f1f8e9',
            border: `1px dashed ${p.status === 'erro' ? '#fca5a5' : '#c5e1a5'}`,
            borderRadius: '12px 12px 4px 12px', padding: '7px 10px 5px',
            fontSize: '13.5px', color: '#1e293b', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
          }}>
            {p.texto}
            <div style={{ fontSize: '10px', marginTop: '4px', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px' }}>
              {p.status === 'erro' ? (
                <>
                  <span style={{ color: '#b91c1c' }}>{p.erro}</span>
                  <button
                    type="button"
                    onClick={() => onDescartarPendente?.(p.tempId)}
                    style={{ background: 'transparent', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: '10px', textDecoration: 'underline', padding: 0 }}
                  >
                    dispensar
                  </button>
                </>
              ) : (
                <span style={{ color: '#64748b' }}>
                  {p.status === 'enviando' ? 'enviando…' : 'entregue, aguardando confirmação'}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}

      <div ref={fimRef} />
    </div>
  )
}
